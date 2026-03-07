/* higgins-shared.js — loaded on every page */
'use strict';

// ── API helpers ──────────────────────────────────────────────────────────────
const API = {
  async get(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
    return res.json();
  },
  async post(path) {
    const res = await fetch(path, { method: 'POST' });
    return res.json();
  },
  classes(params = {}) {
    const q = new URLSearchParams(params).toString();
    return API.get('/api/classes' + (q ? '?' + q : ''));
  },
  stats(season)   { return API.get('/api/stats?season=' + encodeURIComponent(season)); },
  seasons()       { return API.get('/api/seasons'); },
  coaches(season) { return API.get('/api/coaches?season=' + encodeURIComponent(season)); },
  coachContacts() { return fetch('/api/coach-contacts', { cache: 'no-store' }).then(r => r.ok ? r.json() : {}); },
  reload()        { return API.post('/api/reload'); },
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
window.HT = { API, autoSeason, getSeason, setSeason, colorClass, initSeasonSwitcher, initTheme, eur, t2m, coachEffectiveWorkload, effectiveCourtHours, showError };
