'use strict';
const fs = require('fs');
const path = require('path');

const gcal = require('./gcal');
const store = require('./store');

const SYNC_STATE_PATH = path.join(__dirname, 'gcal-sync.json');
let pollInterval = null;

function loadSyncState() {
  try {
    if (fs.existsSync(SYNC_STATE_PATH)) {
      const raw = fs.readFileSync(SYNC_STATE_PATH, 'utf8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('[sync] loadSyncState failed:', e.message);
  }
  return { syncToken: null, lastSyncAt: null, lastPushAt: null };
}

function saveSyncState(state) {
  try {
    fs.writeFileSync(SYNC_STATE_PATH, JSON.stringify(state, null, 2) + '\n', 'utf8');
    return true;
  } catch (e) {
    console.error('[sync] saveSyncState failed:', e.message);
    return false;
  }
}

function parseGCalEvent(gcalEvent) {
  const start = gcalEvent.start?.dateTime || gcalEvent.start?.date;
  const end = gcalEvent.end?.dateTime || gcalEvent.end?.date;
  if (!start || !end) return null;

  const startDate = new Date(start);
  const endDate = new Date(end);
  const dateStr = startDate.toISOString().slice(0, 10);
  const startTime = startDate.toTimeString().slice(0, 5);
  const endTime = endDate.toTimeString().slice(0, 5);

  let program_name = (gcalEvent.summary || '').trim() || 'Class';
  let age_group = '';
  let type = 'Club';
  let location = (gcalEvent.location || '').trim();
  let notes = '';

  const desc = (gcalEvent.description || '').trim();
  if (desc) {
    const lines = desc.split('\n');
    for (const line of lines) {
      const m = line.match(/^(\w+(?:\s+\w+)?):\s*(.+)$/);
      if (m) {
        const [, key, val] = m;
        const v = val.trim();
        if (key === 'Program') program_name = v;
        else if (key === 'Age group') age_group = v;
        else if (key === 'Type') type = v;
        else if (key === 'Location') location = v || location;
        else if (key === 'Notes') notes = v;
      }
    }
  }

  const colorId = String(gcalEvent.colorId || '');
  if (colorId === '3') type = 'event';
  else if (colorId === '11') type = 'GoCAP';
  else if (colorId === '10') type = 'GoCAP';

  return {
    gcal_event_id: gcalEvent.id,
    template_id: null,
    date: dateStr,
    start_time: startTime,
    end_time: endTime,
    delivery: 'onsite',
    pickup_time: null,
    lesson_start: startTime,
    lesson_end: endTime,
    program_name,
    location,
    type,
    age_group,
    coaches: [],
    original_coaches: [],
    participants: 0,
    max_participants: 0,
    cost_per_class: null,
    coach_pay: [],
    court_fee: 0,
    cancelled: false,
    notes,
    participant_names: [],
    gcal_updated_at: gcalEvent.updated || null,
  };
}

async function pullFromGCal() {
  if (!gcal.isConfigured()) return { pulled: 0, cancelled: 0, imported: 0, errors: [] };
  const errors = [];
  let pulled = 0;
  let cancelled = 0;
  let imported = 0;

  let state = loadSyncState();
  let syncToken = state.syncToken;
  if (state.fullSyncRequired) syncToken = null;

  try {
    let result = await gcal.listEvents(syncToken);
    if (result.fullSyncRequired) {
      state.fullSyncRequired = false;
      syncToken = null;
      result = await gcal.listEvents(null);
    }

    const { events, nextSyncToken } = result;
    if (!events || !events.length) {
      if (nextSyncToken) {
        saveSyncState({ ...state, syncToken: nextSyncToken, lastSyncAt: new Date().toISOString() });
      }
      return { pulled: 0, cancelled: 0, imported: 0, errors: [] };
    }

    for (const ev of events) {
      try {
        if (ev.status === 'cancelled') {
          const ok = store.markInstanceCancelled(ev.id);
          if (ok) cancelled++;
          continue;
        }

        const local = store.findInstanceByGcalEventId(ev.id);
        if (local) {
          const localGcalUpdated = local.gcal_updated_at || '';
          const gcalUpdated = ev.updated || '';
          if (gcalUpdated && localGcalUpdated && new Date(gcalUpdated) <= new Date(localGcalUpdated)) {
            continue;
          }
          await gcal.updateEvent(local);
          store.updateInstance(local.id, { gcal_updated_at: new Date().toISOString(), skipGcalSync: true });
          pulled++;
        } else {
          const parsed = parseGCalEvent(ev);
          if (parsed) {
            store.upsertInstanceFromGCal(parsed);
            imported++;
          }
        }
      } catch (e) {
        errors.push({ eventId: ev.id, error: e.message });
      }
    }

    saveSyncState({
      ...state,
      syncToken: nextSyncToken || state.syncToken,
      lastSyncAt: new Date().toISOString(),
    });
  } catch (e) {
    errors.push({ error: e.message });
    if (e.message && e.message.includes('410')) {
      saveSyncState({ ...state, syncToken: null, fullSyncRequired: true });
    }
  }

  return { pulled, cancelled, imported, errors };
}

async function pushAllToGCal() {
  if (!gcal.isConfigured()) return { created: 0, updated: 0, errors: [] };
  const instances = store.getInstances({});
  const needsCreate = instances.filter(i => !i.gcal_event_id && !i.cancelled);
  const errors = [];
  let created = 0;
  let updated = 0;

  for (const inst of needsCreate) {
    try {
      const eventId = await gcal.createEvent(inst);
      if (eventId) {
        store.updateInstance(inst.id, { gcal_event_id: eventId, gcal_updated_at: new Date().toISOString(), skipGcalSync: true });
        created++;
      }
    } catch (e) {
      errors.push({ instanceId: inst.id, error: e.message });
    }
  }

  const withGcal = instances.filter(i => i.gcal_event_id && !i.cancelled);
  for (const inst of withGcal) {
    const localUpdated = inst.updated_at || '';
    const lastPushed = inst.gcal_updated_at || '';
    if (localUpdated && lastPushed && new Date(localUpdated) <= new Date(lastPushed)) continue;
    try {
      const ok = await gcal.updateEvent(inst);
      if (ok) {
        store.updateInstance(inst.id, { gcal_updated_at: new Date().toISOString(), skipGcalSync: true });
        updated++;
      }
    } catch (e) {
      if (e.code !== 404) errors.push({ instanceId: inst.id, error: e.message });
    }
  }

  const state = loadSyncState();
  saveSyncState({ ...state, lastPushAt: new Date().toISOString() });

  return { created, updated, errors };
}

async function fullSync() {
  const pushResult = await pushAllToGCal();
  const pullResult = await pullFromGCal();
  return {
    ok: true,
    pushed: pushResult.created + pushResult.updated,
    pulled: pullResult.pulled + pullResult.imported + pullResult.cancelled,
    created: pushResult.created,
    updated: pushResult.updated,
    imported: pullResult.imported,
    cancelled: pullResult.cancelled,
    errors: [...pushResult.errors, ...pullResult.errors],
  };
}

function startPolling(intervalMs = 60000) {
  if (pollInterval) return;
  if (!gcal.isConfigured()) return;
  pollInterval = setInterval(() => {
    pullFromGCal().then(r => {
      if (r.pulled || r.imported || r.cancelled) {
        console.log(`[sync] Poll: pulled=${r.pulled} imported=${r.imported} cancelled=${r.cancelled}`);
      }
    }).catch(e => console.error('[sync] Poll error:', e.message));
  }, intervalMs);
  console.log(`[sync] Background polling started (every ${intervalMs / 1000}s)`);
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
    console.log('[sync] Background polling stopped');
  }
}

function getSyncStatus() {
  const state = loadSyncState();
  return {
    lastSyncAt: state.lastSyncAt,
    lastPushAt: state.lastPushAt,
    syncToken: !!state.syncToken,
    polling: !!pollInterval,
  };
}

module.exports = {
  loadSyncState,
  saveSyncState,
  pullFromGCal,
  pushAllToGCal,
  fullSync,
  startPolling,
  stopPolling,
  getSyncStatus,
  parseGCalEvent,
};
