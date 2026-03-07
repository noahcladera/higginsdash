'use strict';
const http = require('http');
const fs   = require('fs');
const path = require('path');
const url  = require('url');

const { getClasses, reload } = require('./data/parse');
const XLSX_PRIMARY = path.join(__dirname, 'data', 'schedule.xlsx');
const XLSX_ALT     = path.join(__dirname, 'data', 'schdule.xlsx'); // fallback for current filename
const XLSX_PATH    = fs.existsSync(XLSX_PRIMARY) ? XLSX_PRIMARY : XLSX_ALT;
const CSV_PATH     = path.join(__dirname, 'data', 'schedule.csv');
const DATA_PATH    = fs.existsSync(XLSX_PATH) ? XLSX_PATH : CSV_PATH;

const PORT = process.env.PORT || 3000;

// ── MIME types ───────────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json',
  '.csv':  'text/csv',
  '.ico':  'image/x-icon',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
};

// ── static file server ───────────────────────────────────────────────────────
function serveStatic(res, filePath) {
  const ext  = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';
  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found: ' + path.basename(filePath));
  }
}

// ── JSON response helper ─────────────────────────────────────────────────────
function json(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

// ── API routes ───────────────────────────────────────────────────────────────
function handleAPI(req, res, pathname, query) {

  // GET /api/classes
  // ?season=Winter+2026&type=GoCAP&coach=Noah&day=Monday
  if (pathname === '/api/classes') {
    let classes = getClasses(DATA_PATH);
    if (query.season) classes = classes.filter(c => c.season === query.season);
    if (query.type)   classes = classes.filter(c => c.type   === query.type);
    if (query.coach)  classes = classes.filter(c => c.coaches.includes(query.coach));
    if (query.day)    classes = classes.filter(c => c.day    === query.day);
    return json(res, classes);
  }

  // GET /api/seasons
  if (pathname === '/api/seasons') {
    const seasons = [...new Set(getClasses(DATA_PATH).map(c => c.season))].sort();
    return json(res, seasons);
  }

  // GET /api/coaches?season=Winter+2026
  if (pathname === '/api/coaches') {
    let classes = getClasses(DATA_PATH);
    if (query.season) classes = classes.filter(c => c.season === query.season);
    const coaches = [...new Set(classes.flatMap(c => c.coaches).filter(Boolean))].sort();
    return json(res, coaches);
  }

  // GET /api/stats?season=Winter+2026
  if (pathname === '/api/stats') {
    let classes = getClasses(CSV_PATH);
    if (query.season) classes = classes.filter(c => c.season === query.season);
    const active = classes.filter(c => !c.cancelled);
    const revenue   = active.reduce((s,c) => s + (c.session_cost || 0), 0);
    const expenses  = active.reduce((s,c) => s + (c.expenses || 0), 0);
    const coaches   = [...new Set(active.flatMap(c => c.coaches).filter(Boolean))];
    const locations = [...new Set(active.map(c => c.location))];
    const totalPax  = active.reduce((s,c) => s + (c.participants || 0), 0);
    const totalMax  = active.reduce((s,c) => s + (c.max_participants || 0), 0);
    return json(res, {
      classes:   active.length,
      students:  totalPax,
      coaches:   coaches.length,
      locations: locations.length,
      revenue:   Math.round(revenue),
      expenses:  Math.round(expenses),
      net:       Math.round(revenue - expenses),
      fill_rate: totalMax > 0 ? Math.round(totalPax / totalMax * 100) : 0,
    });
  }

  // GET /api/class/:id
  const idMatch = pathname.match(/^\/api\/class\/(\d+)$/);
  if (idMatch) {
    const id = parseInt(idMatch[1]);
    const c  = getClasses(DATA_PATH).find(x => x.id === id);
    return c ? json(res, c) : json(res, { error: 'Not found' }, 404);
  }

  // POST /api/reload  — hot-reload the CSV without restarting the server
  if (pathname === '/api/reload' && req.method === 'POST') {
    try {
      const classes = reload(DATA_PATH);
      return json(res, { ok: true, count: classes.length });
    } catch(e) {
      return json(res, { ok: false, error: e.message }, 500);
    }
  }

  json(res, { error: 'Unknown API route' }, 404);
}

// ── request router ───────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const parsed   = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const query    = parsed.query;

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST' });
    return res.end();
  }

  // API
  if (pathname.startsWith('/api/')) {
    return handleAPI(req, res, pathname, query);
  }

  // Page routes → serve HTML from views/
  const PAGE_MAP = {
    '/':          'index.html',
    '/index':     'index.html',
    '/calendar':  'calendar.html',
    '/gocap':     'gocap.html',
    '/coaches':   'coaches.html',
    '/finance':   'finance.html',
    '/seasons':   'seasons.html',
  };

  // strip .html suffix if someone types it
  const cleanPath = pathname.replace(/\.html$/, '');

  if (PAGE_MAP[cleanPath]) {
    return serveStatic(res, path.join(__dirname, 'views', PAGE_MAP[cleanPath]));
  }

  // Static assets  /css/*, /js/*, etc.
  if (pathname.startsWith('/css/') || pathname.startsWith('/js/') || pathname.startsWith('/assets/')) {
    return serveStatic(res, path.join(__dirname, 'public', pathname));
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'text/html' });
  res.end('<h2 style="font-family:monospace;padding:40px">404 — Not found</h2>');
});

server.listen(PORT, () => {
  console.log(`\n  🎾  Higgins Tennis OPS`);
  console.log(`  ──────────────────────────────`);
  console.log(`  Local:  http://localhost:${PORT}`);
  console.log(`  API:    http://localhost:${PORT}/api/classes`);
  console.log(`  Reload: curl -X POST http://localhost:${PORT}/api/reload`);
  console.log(`  ──────────────────────────────\n`);

  // Pre-warm the parser
  try {
    const classes = getClasses(DATA_PATH);
    console.log(`  ✓ Loaded ${classes.length} classes from schedule.csv\n`);
  } catch(e) {
    console.error(`  ✗ Could not parse schedule.csv:`, e.message);
  }
});

module.exports = server;
