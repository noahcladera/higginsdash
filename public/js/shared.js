/* higgins-shared.js — loaded on every page */
'use strict';

// ── API helpers ──────────────────────────────────────────────────────────────
const API = {
  async get(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
    return res.json();
  },
  async post(path, body) {
    const res = await fetch(path, {
      method: 'POST',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `API ${path} → ${res.status}`);
    return data;
  },
  async put(path, body) {
    const res = await fetch(path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `API ${path} → ${res.status}`);
    return data;
  },
  async delete(path) {
    const res = await fetch(path, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `API ${path} → ${res.status}`);
    return data;
  },
  classes(params = {}) {
    const q = new URLSearchParams(params).toString();
    return API.get('/api/classes' + (q ? '?' + q : ''));
  },
  instances(params = {}) {
    const q = new URLSearchParams(params).toString();
    return API.get('/api/instances' + (q ? '?' + q : ''));
  },
  createInstance(data) {
    return API.post('/api/instances', data);
  },
  updateInstance(id, data) {
    return API.put('/api/instance/' + encodeURIComponent(id), data);
  },
  deleteInstance(id, scope) {
    const q = scope === 'future' ? '?scope=future' : '';
    return API.delete('/api/instance/' + encodeURIComponent(id) + q);
  },
  templates(params = {}) {
    const q = new URLSearchParams(params).toString();
    return API.get('/api/templates' + (q ? '?' + q : ''));
  },
  createTemplate(data) {
    return API.post('/api/templates', data);
  },
  updateTemplate(id, data, scope) {
    return API.put('/api/template/' + encodeURIComponent(id), { ...data, scope: scope || 'template_only' });
  },
  deleteTemplate(id) {
    return API.delete('/api/template/' + encodeURIComponent(id));
  },
  stats(season)   { return API.get('/api/stats?season=' + encodeURIComponent(season)); },
  seasons()       { return API.get('/api/seasons'); },
  seasonsConfig() { return API.get('/api/seasons-config'); },
  coaches(season) { return API.get('/api/coaches?season=' + encodeURIComponent(season)); },
  coachContacts() { return fetch('/api/coach-contacts', { cache: 'no-store' }).then(r => r.ok ? r.json() : {}); },
  reload()        { return API.post('/api/reload'); },
  importData()    { return API.post('/api/import'); },
  gcalStatus()    { return API.get('/api/gcal/status'); },
  gcalSync()      { return API.post('/api/gcal/sync'); },
  gcalSyncStatus(){ return API.get('/api/gcal/sync-status'); },
  gcalPull()      { return API.post('/api/gcal/pull'); },
  financeMonthly()    { return API.get('/api/finance/monthly'); },
  financeSessions()  { return API.get('/api/finance/sessions'); },
  financeEnrollments(){ return API.get('/api/finance/enrollments'); },
  financeSchools()   { return API.get('/api/finance/schools'); },
  financeEnrollmentHistory(params = {}) {
    const q = new URLSearchParams(params).toString();
    return API.get('/api/finance/enrollment-history' + (q ? '?' + q : ''));
  },
  studentEnrollments(id) { return API.get('/api/student/' + encodeURIComponent(id) + '/enrollments'); },
  migrate(body)   { return API.post('/api/migrate', body || {}); },
  students(params = {}) {
    const q = new URLSearchParams(params).toString();
    return API.get('/api/students' + (q ? '?' + q : ''));
  },
  student(id) { return API.get('/api/student/' + encodeURIComponent(id)); },
  createStudent(data) { return API.post('/api/students', data); },
  updateStudent(id, data) { return API.put('/api/student/' + encodeURIComponent(id), data); },
  deleteStudent(id) { return API.delete('/api/student/' + encodeURIComponent(id)); },
  studentsSearch(q) {
    return API.get('/api/students/search?q=' + encodeURIComponent(q || ''));
  },
  programs() { return API.get('/api/programs'); },
  createProgram(data) { return API.post('/api/programs', data); },
  updateProgram(id, data) { return API.put('/api/program/' + encodeURIComponent(id), data); },
};

// ── Season detection ─────────────────────────────────────────────────────────
function autoSeason() {
  return (new Date().getMonth() + 1 >= 4) ? 'Spring 2026' : 'Winter 2026';
}

// ── Global season (persisted across pages) ────────────────────────────────────
const SEASON_KEY = 'ht-season';
function getSeason() {
  const saved = localStorage.getItem(SEASON_KEY);
  return saved || autoSeason();
}
function setSeason(s) {
  localStorage.setItem(SEASON_KEY, s);
}

// ── Color class from a class object ─────────────────────────────────────────
function colorClass(c) {
  const loc  = (c.location || '').toLowerCase();
  const type = (c.type     || '').toLowerCase();
  if (type === 'event') return 'event';
  if (type === 'school') return 'school';
  if (type === 'gocap' || type === 'pickup') return 'gocap';
  if (loc.includes('randwijck') || loc.includes('randwijk')) return 'randwijck';
  if (loc.includes('triaz') || loc.includes('ajernstraat')) return 'triaz';
  return 'school';
}

// ── Season switcher (shared header widget, persisted globally) ─────────────────
// Fetches seasons from API, builds a select dropdown. Scales to any number of seasons.
async function initSeasonSwitcher(onChange) {
  const sw = document.getElementById('seasonSwitcher');
  if (!sw) return getSeason();
  const sel = document.getElementById('seasonSelect');
  if (!sel) return getSeason();
  let seasons = [];
  try {
    seasons = await API.seasons();
  } catch (e) {
    seasons = [autoSeason()];
  }
  if (!seasons.length) seasons = [autoSeason()];
  sel.innerHTML = seasons.map(s => `<option value="${s.replace(/"/g, '&quot;')}">${s}</option>`).join('');
  let initial = getSeason();
  if (!seasons.includes(initial)) {
    initial = seasons[seasons.length - 1];
    setSeason(initial);
    if (onChange) onChange(initial);
  }
  sel.value = initial;
  sel.addEventListener('change', () => {
    const s = sel.value;
    setSeason(s);
    if (onChange) onChange(s);
  });
  return initial;
}

// ── Nav active state ─────────────────────────────────────────────────────────
function initNav() {
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  document.querySelectorAll('.ni').forEach(a => {
    const href = a.getAttribute('href').replace(/\.html$/, '').replace(/\/$/, '') || '/';
    a.classList.toggle('active', href === path || (path === '/' && href === '/index'));
  });
}

// ── Error banner ─────────────────────────────────────────────────────────────
function showError(msg) {
  let el = document.getElementById('errBanner');
  if (!el) {
    el = document.createElement('div');
    el.id = 'errBanner';
    el.className = 'err-banner hidden';
    document.querySelector('nav')?.after(el);
  }
  el.textContent = '⚠ ' + msg;
  el.classList.remove('hidden');
}

// ── Success banner ───────────────────────────────────────────────────────────
function showSuccess(msg) {
  let el = document.getElementById('successBanner');
  if (!el) {
    el = document.createElement('div');
    el.id = 'successBanner';
    el.className = 'success-banner hidden';
    document.querySelector('nav')?.after(el);
  }
  el.textContent = '✓ ' + msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 2500);
}

// ── Time options for dropdowns (15-min slots) ─────────────────────────────────
function buildTimeOptions(startHour = 7, endHour = 22, stepMin = 15) {
  const opts = [];
  for (let h = startHour; h <= endHour; h++) {
    for (let m = 0; m < 60; m += stepMin) {
      if (h === endHour && m > 0) break;
      const hh = String(h).padStart(2, '0');
      const mm = String(m).padStart(2, '0');
      const val = `${hh}:${mm}`;
      opts.push({ value: val, label: val });
    }
  }
  return opts;
}

// ── Utility: format currency ─────────────────────────────────────────────────
function eur(n) {
  if (n == null || isNaN(n)) return '—';
  return '€' + Math.round(n).toLocaleString('nl-NL');
}

// ── Utility: time maths ──────────────────────────────────────────────────────
function t2m(t) {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

// ── Coach workload: merge overlapping classes (same coach can't be in 2 places) ─
function coachEffectiveWorkload(classes) {
  const byDay = {};
  classes.forEach(c => {
    const d = c.day || '';
    if (!byDay[d]) byDay[d] = [];
    byDay[d].push([t2m(c.start_time), t2m(c.end_time)]);
  });
  let totalHours = 0;
  let blockCount = 0;
  Object.values(byDay).forEach(intervals => {
    intervals.sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const [s, e] of intervals) {
      if (merged.length && s <= merged[merged.length - 1][1]) {
        merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], e);
      } else {
        merged.push([s, e]);
      }
    }
    merged.forEach(([s, e]) => {
      totalHours += (e - s) / 60;
      blockCount += 1;
    });
  });
  return { hours: totalHours, blockCount };
}

// ── Court hours: merge overlapping intervals per day+location (same court) ───
function effectiveCourtHours(classes) {
  const byDayLoc = {};
  classes.forEach(c => {
    const k = (c.day || '') + '\0' + (c.location || '');
    if (!byDayLoc[k]) byDayLoc[k] = [];
    byDayLoc[k].push([t2m(c.start_time), t2m(c.end_time)]);
  });
  let total = 0;
  Object.values(byDayLoc).forEach(intervals => {
    intervals.sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const [s, e] of intervals) {
      if (merged.length && s <= merged[merged.length - 1][1]) {
        merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], e);
      } else {
        merged.push([s, e]);
      }
    }
    merged.forEach(([s, e]) => { total += (e - s) / 60; });
  });
  return total;
}

// ── Instance hours: merge overlapping intervals by date (never double-count) ──
function mergeInstanceHours(instances) {
  const byDate = {};
  instances.forEach(c => {
    const d = c.date;
    if (!d) return;
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push([t2m(c.start_time), t2m(c.end_time || c.start_time)]);
  });
  let totalHours = 0, blockCount = 0;
  const merged = [];
  Object.entries(byDate).sort((a, b) => a[0].localeCompare(b[0])).forEach(([date, intervals]) => {
    intervals.sort((a, b) => a[0] - b[0]);
    const blocks = [];
    for (const [s, e] of intervals) {
      if (blocks.length && s <= blocks[blocks.length - 1][1]) {
        blocks[blocks.length - 1][1] = Math.max(blocks[blocks.length - 1][1], e);
      } else {
        blocks.push([s, e]);
      }
    }
    blocks.forEach(([s, e]) => {
      const hrs = (e - s) / 60;
      totalHours += hrs;
      blockCount++;
      merged.push({ date, start: s, end: e, hours: hrs });
    });
  });
  return { totalHours, blockCount, merged };
}

// ── Theme toggle (light/dark) ─────────────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem('ht-theme');
  if (saved === 'light') document.documentElement.setAttribute('data-theme', 'light');
  const btn = document.getElementById('themeToggle');
  if (btn) {
    btn.addEventListener('click', () => {
      const el = document.documentElement;
      const isLight = el.getAttribute('data-theme') === 'light';
      el.setAttribute('data-theme', isLight ? '' : 'light');
      localStorage.setItem('ht-theme', isLight ? '' : 'light');
      btn.textContent = isLight ? 'Dark' : 'Light';
    });
    btn.textContent = document.documentElement.getAttribute('data-theme') === 'light' ? 'Dark' : 'Light';
  }
}

// ── Init on every page ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => { initNav(); initTheme(); });

// Export
window.HT = { API, autoSeason, getSeason, setSeason, colorClass, initSeasonSwitcher, initTheme, eur, t2m, coachEffectiveWorkload, effectiveCourtHours, mergeInstanceHours, showError, showSuccess, buildTimeOptions };
