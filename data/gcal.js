'use strict';
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const GCAL_SCOPES = ['https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/calendar.events'];
const COACHES_PATH = path.join(__dirname, 'coaches.json');
const OAUTH_CREDENTIALS_PATH = path.join(__dirname, 'oauth-credentials.json');
const OAUTH_TOKEN_PATH = path.join(__dirname, 'oauth-token.json');

function findCredentialsPath() {
  const candidates = [
    path.join(__dirname, 'google-credentials.json'),
    path.join(__dirname, 'higgins-tennis-20c153b72cc5.json'),
  ];
  return candidates.find(p => fs.existsSync(p)) || null;
}
const SERVICE_ACCOUNT_PATH = findCredentialsPath();

function getCalendarId() {
  if (process.env.GOOGLE_CALENDAR_ID) return process.env.GOOGLE_CALENDAR_ID;
  try {
    const cfgPath = path.join(__dirname, 'gcal-config.json');
    if (fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      return cfg.calendarId || null;
    }
  } catch {}
  return null;
}
const CALENDAR_ID = getCalendarId();

let calendar = null;
let initError = null;
let useOAuth = false;

function loadCoaches() {
  try {
    const raw = fs.readFileSync(COACHES_PATH, 'utf8');
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

function loadOAuthCredentials() {
  if (!fs.existsSync(OAUTH_CREDENTIALS_PATH)) return null;
  try {
    const raw = fs.readFileSync(OAUTH_CREDENTIALS_PATH, 'utf8');
    const data = JSON.parse(raw);
    const creds = data.web || data.installed || data;
    const clientId = creds.client_id || creds.clientId;
    const clientSecret = creds.client_secret || creds.clientSecret;
    const redirectUri = (creds.redirect_uris && creds.redirect_uris[0]) || creds.redirect_uri || 'http://localhost:3000/auth/callback';
    if (clientId && clientSecret) return { clientId, clientSecret, redirectUri };
  } catch (e) {
    console.error('[gcal] loadOAuthCredentials failed:', e.message);
  }
  return null;
}

function loadOAuthToken() {
  if (!fs.existsSync(OAUTH_TOKEN_PATH)) return null;
  try {
    const raw = fs.readFileSync(OAUTH_TOKEN_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('[gcal] loadOAuthToken failed:', e.message);
  }
  return null;
}

function saveOAuthToken(tokens) {
  try {
    fs.writeFileSync(OAUTH_TOKEN_PATH, JSON.stringify(tokens, null, 2) + '\n', 'utf8');
    return true;
  } catch (e) {
    console.error('[gcal] saveOAuthToken failed:', e.message);
    return false;
  }
}

function initOAuthClient() {
  const creds = loadOAuthCredentials();
  if (!creds) return null;
  const oauth2Client = new google.auth.OAuth2(creds.clientId, creds.clientSecret, creds.redirectUri);
  const token = loadOAuthToken();
  if (token && (token.refresh_token || token.access_token)) {
    oauth2Client.setCredentials(token);
    return oauth2Client;
  }
  return oauth2Client;
}

function resetAuth() {
  calendar = null;
  initError = null;
  useOAuth = false;
}

function getAuth() {
  if (calendar !== null || initError !== null) return { calendar, initError };
  if (!CALENDAR_ID) {
    initError = new Error('Google Calendar not configured (missing calendar ID in gcal-config.json)');
    return { calendar: null, initError };
  }

  try {
    const oauth2Client = initOAuthClient();
    const token = loadOAuthToken();

    if (oauth2Client && token && token.refresh_token) {
      oauth2Client.setCredentials(token);
      const auth = oauth2Client;
      calendar = google.calendar({ version: 'v3', auth });
      useOAuth = true;
      return { calendar, initError: null };
    }

    if (SERVICE_ACCOUNT_PATH) {
      const creds = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
      const auth = new google.auth.GoogleAuth({
        credentials: creds,
        scopes: GCAL_SCOPES,
      });
      calendar = google.calendar({ version: 'v3', auth });
      useOAuth = false;
      return { calendar, initError: null };
    }

    initError = new Error('Google Calendar not configured. Add oauth-credentials.json and connect at /auth/google, or add service account credentials.');
    return { calendar: null, initError };
  } catch (e) {
    initError = e;
    return { calendar: null, initError };
  }
}

function isConfigured() {
  const { initError } = getAuth();
  return !initError && calendar !== null;
}

function isOAuthConnected() {
  const token = loadOAuthToken();
  return !!(token && token.refresh_token);
}

function getOAuthUrl(redirectUri) {
  const creds = loadOAuthCredentials();
  if (!creds) return null;
  const oauth2Client = new google.auth.OAuth2(creds.clientId, creds.clientSecret, redirectUri || creds.redirectUri);
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: GCAL_SCOPES,
    prompt: 'consent',
  });
}

async function exchangeCodeForTokens(code, redirectUri) {
  const creds = loadOAuthCredentials();
  if (!creds) throw new Error('OAuth credentials not found');
  const oauth2Client = new google.auth.OAuth2(creds.clientId, creds.clientSecret, redirectUri || creds.redirectUri);
  const { tokens } = await oauth2Client.getToken(code);
  if (!tokens.refresh_token) throw new Error('No refresh_token in response - try revoking app access and reconnecting');
  saveOAuthToken(tokens);
  resetAuth();
  return tokens;
}

function getColorId(instance) {
  const type = (instance.type || '').toLowerCase();
  if (type === 'event') return '3';
  const delivery = (instance.delivery || '').toLowerCase();
  const loc = (instance.location || '').toLowerCase();
  const isPickup = delivery === 'pickup' || type === 'gocap';
  if (isPickup && (loc.includes('randwijck') || loc.includes('randwijk'))) return '11';
  if (isPickup) return '10';
  return '9';
}

function buildDescription(instance) {
  const parts = [];
  if (instance.program_name) parts.push(`Program: ${instance.program_name}`);
  if (instance.age_group) parts.push(`Age group: ${instance.age_group}`);
  if (instance.location) parts.push(`Location: ${instance.location}`);
  if (instance.type) parts.push(`Type: ${instance.type}`);
  const pax = instance.participants ?? 0;
  const max = instance.max_participants ?? 0;
  if (max > 0) parts.push(`Participants: ${pax}/${max}`);
  if (instance.notes) parts.push(`Notes: ${instance.notes}`);
  if (instance.participant_names && Array.isArray(instance.participant_names) && instance.participant_names.length) {
    parts.push(`\nStudents (${instance.participant_names.length}):\n` + instance.participant_names.map(n => `- ${n}`).join('\n'));
  }
  return parts.join('\n') || 'Higgins Tennis class';
}

function coachEmails(coaches, coachContacts) {
  if (!Array.isArray(coaches) || !coaches.length) return [];
  const emails = [];
  coaches.forEach(name => {
    const n = (name || '').trim();
    if (!n) return;
    const contact = coachContacts[n] || coachContacts[Object.keys(coachContacts || {}).find(k => k.trim().toLowerCase() === n.toLowerCase())];
    const email = contact && contact.email ? contact.email.trim() : null;
    if (email && /^[^@]+@[^@]+\.[^@]+$/.test(email)) emails.push(email);
  });
  return [...new Set(emails)];
}

async function createEvent(instance) {
  const { calendar, initError } = getAuth();
  if (initError || !calendar) return null;
  const coachContacts = loadCoaches();
  const start = new Date(`${instance.date}T${instance.start_time || '09:00'}:00`);
  const end = new Date(`${instance.date}T${instance.end_time || instance.start_time || '10:00'}:00`);
  const attendees = coachEmails(instance.coaches || [], coachContacts).map(email => ({ email }));
  const event = {
    summary: (instance.program_name || 'Higgins Tennis').trim() || 'Class',
    description: buildDescription(instance),
    location: instance.location || '',
    colorId: getColorId(instance),
    start: { dateTime: start.toISOString(), timeZone: 'Europe/Amsterdam' },
    end: { dateTime: end.toISOString(), timeZone: 'Europe/Amsterdam' },
    attendees: attendees.length ? attendees : undefined,
  };
  try {
    const res = await calendar.events.insert({
      calendarId: CALENDAR_ID,
      requestBody: event,
      sendUpdates: attendees.length ? 'all' : 'none',
    });
    return res.data && res.data.id ? res.data.id : null;
  } catch (e) {
    console.error('[gcal] createEvent failed:', e.message);
    return null;
  }
}

async function updateEvent(instance) {
  const eventId = instance.gcal_event_id;
  if (!eventId) return false;
  const { calendar, initError } = getAuth();
  if (initError || !calendar) return false;
  const coachContacts = loadCoaches();
  const start = new Date(`${instance.date}T${instance.start_time || '09:00'}:00`);
  const end = new Date(`${instance.date}T${instance.end_time || instance.start_time || '10:00'}:00`);
  const attendees = coachEmails(instance.coaches || [], coachContacts).map(email => ({ email }));
  const event = {
    summary: (instance.program_name || 'Higgins Tennis').trim() || 'Class',
    description: buildDescription(instance),
    location: instance.location || '',
    colorId: getColorId(instance),
    start: { dateTime: start.toISOString(), timeZone: 'Europe/Amsterdam' },
    end: { dateTime: end.toISOString(), timeZone: 'Europe/Amsterdam' },
    attendees: attendees.length ? attendees : undefined,
  };
  try {
    await calendar.events.patch({
      calendarId: CALENDAR_ID,
      eventId,
      requestBody: event,
      sendUpdates: attendees.length ? 'all' : 'none',
    });
    return true;
  } catch (e) {
    if (e.code === 404) return false;
    console.error('[gcal] updateEvent failed:', e.message);
    return false;
  }
}

async function deleteEvent(gcalEventId) {
  if (!gcalEventId) return true;
  const { calendar, initError } = getAuth();
  if (initError || !calendar) return false;
  try {
    await calendar.events.delete({
      calendarId: CALENDAR_ID,
      eventId: gcalEventId,
      sendUpdates: 'all',
    });
    return true;
  } catch (e) {
    if (e.code === 404) return true;
    console.error('[gcal] deleteEvent failed:', e.message);
    return false;
  }
}

function getCalendarIdPublic() {
  return CALENDAR_ID;
}

async function listEvents(syncToken) {
  const { calendar, initError } = getAuth();
  if (initError || !calendar) return { events: [], fullSyncRequired: false };
  const allEvents = [];
  let nextPageToken = null;
  let nextSyncToken = null;
  try {
    const opts = {
      calendarId: CALENDAR_ID,
      singleEvents: true,
    };
    if (syncToken) {
      opts.syncToken = syncToken;
    } else {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      opts.timeMin = oneYearAgo.toISOString();
    }
    do {
      if (nextPageToken) opts.pageToken = nextPageToken;
      const res = await calendar.events.list(opts);
      const items = res.data.items || [];
      allEvents.push(...items);
      nextPageToken = res.data.nextPageToken || null;
      nextSyncToken = res.data.nextSyncToken || null;
    } while (nextPageToken);
    return { events: allEvents, nextSyncToken, fullSyncRequired: false };
  } catch (e) {
    if (e.code === 410) {
      return { events: [], nextSyncToken: null, fullSyncRequired: true };
    }
    if (e.code === 429) {
      console.error('[gcal] listEvents rate limited:', e.message);
      return { events: [], nextSyncToken: null, fullSyncRequired: false };
    }
    console.error('[gcal] listEvents failed:', e.message);
    throw e;
  }
}

async function getEvent(eventId) {
  if (!eventId) return null;
  const { calendar, initError } = getAuth();
  if (initError || !calendar) return null;
  try {
    const res = await calendar.events.get({
      calendarId: CALENDAR_ID,
      eventId,
    });
    return res.data || null;
  } catch (e) {
    if (e.code === 404) return null;
    console.error('[gcal] getEvent failed:', e.message);
    return null;
  }
}

module.exports = {
  isConfigured,
  isOAuthConnected,
  getOAuthUrl,
  exchangeCodeForTokens,
  resetAuth,
  getCalendarId: getCalendarIdPublic,
  createEvent,
  updateEvent,
  deleteEvent,
  listEvents,
  getEvent,
};
