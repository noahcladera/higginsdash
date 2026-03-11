'use strict';
const http = require('http');
const fs   = require('fs');
const path = require('path');
const url  = require('url');

const store = require('./data/store');
const gcal = require('./data/gcal');
const sync = require('./data/sync');
const { migrateToJson } = require('./data/parse');
const XLSX_PRIMARY = path.join(__dirname, 'data', 'schedule.xlsx');
const XLSX_ALT     = path.join(__dirname, 'data', 'schdule.xlsx');
const XLSX_PATH    = fs.existsSync(XLSX_PRIMARY) ? XLSX_PRIMARY : XLSX_ALT;
const JSON_PATH    = path.join(__dirname, 'data', 'classes.json');

const PORT = process.env.PORT || 3000;

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

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
  '.avif': 'image/avif',
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
function handleAPI(req, res, pathname, query, body = {}) {

  // GET /api/classes — backward compat, uses store.getClassesCompat
  if (pathname === '/api/classes') {
    const seasons = Object.keys(store.getSeasons());
    const seasonFilter = query.season || (seasons.length ? null : '');
    let classes = seasonFilter
      ? store.getClassesCompat(seasonFilter)
      : seasons.flatMap(s => store.getClassesCompat(s));
    if (query.type)   classes = classes.filter(c => c.type === query.type);
    if (query.coach)  classes = classes.filter(c => (c.coaches || []).includes(query.coach));
    if (query.day)    classes = classes.filter(c => c.day === query.day);
    return json(res, classes);
  }

  // GET /api/seasons
  if (pathname === '/api/seasons') {
    const seasons = Object.keys(store.getSeasons()).sort();
    const fromCompat = store.getClassesCompat('');
    const allSeasons = [...new Set([...seasons, ...fromCompat.map(c => c.season)])].filter(Boolean).sort();
    return json(res, allSeasons.length ? allSeasons : seasons.length ? seasons : ['Winter 2026', 'Spring 2026']);
  }

  // GET /api/coach-contacts
  if (pathname === '/api/coach-contacts' && req.method === 'GET') {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'coaches.json'), 'utf8'));
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store, no-cache',
      });
      return res.end(JSON.stringify(data));
    } catch (e) {
      return json(res, {});
    }
  }

  // POST /api/coach-contacts — add or update coach in coaches.json
  if (pathname === '/api/coach-contacts' && req.method === 'POST') {
    try {
      const { name, phone, email } = body;
      if (!name || typeof name !== 'string' || !name.trim()) {
        return json(res, { error: 'name required' }, 400);
      }
      const coachesPath = path.join(__dirname, 'data', 'coaches.json');
      const data = JSON.parse(fs.readFileSync(coachesPath, 'utf8'));
      const existing = data[name.trim()] || {};
      data[name.trim()] = {
        phone: (phone != null ? phone : existing.phone || '').toString().trim(),
        email: (email != null ? email : existing.email || '').toString().trim(),
        hourly_rate: body.hourly_rate != null ? Number(body.hourly_rate) : (existing.hourly_rate || 0),
      };
      fs.writeFileSync(coachesPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
      return json(res, { ok: true, coach: data[name.trim()] });
    } catch (e) {
      return json(res, { error: e.message }, 500);
    }
  }

  // DELETE /api/coach-contacts/:name
  const coachDelMatch = pathname.match(/^\/api\/coach-contacts\/(.+)$/);
  if (coachDelMatch && req.method === 'DELETE') {
    try {
      const name = decodeURIComponent(coachDelMatch[1]).trim();
      if (!name) return json(res, { error: 'name required' }, 400);
      const coachesPath = path.join(__dirname, 'data', 'coaches.json');
      const data = JSON.parse(fs.readFileSync(coachesPath, 'utf8'));
      if (!(name in data)) return json(res, { error: 'Coach not found' }, 404);
      delete data[name];
      fs.writeFileSync(coachesPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
      return json(res, { ok: true });
    } catch (e) {
      return json(res, { error: e.message }, 500);
    }
  }

  // GET /api/students?q=&school=&status=
  if (pathname === '/api/students' && req.method === 'GET') {
    const filters = {};
    if (query.q) filters.q = query.q;
    if (query.school) filters.school = query.school;
    if (query.status) filters.status = query.status;
    const students = store.getStudents(filters);
    return json(res, students);
  }

  // GET /api/student/:id/enrollments — enrollment history for a student
  const studentEnrollMatch = pathname.match(/^\/api\/student\/([a-z0-9_]+)\/enrollments$/i);
  if (studentEnrollMatch && req.method === 'GET') {
    const s = store.getStudent(studentEnrollMatch[1]);
    if (!s) return json(res, { error: 'Not found' }, 404);
    const enrollments = s.enrollment_history || [];
    return json(res, enrollments);
  }

  // GET /api/student/:id
  const studentIdMatch = pathname.match(/^\/api\/student\/([a-z0-9_]+)$/i);
  if (studentIdMatch && req.method === 'GET') {
    const s = store.getStudent(studentIdMatch[1]);
    return s ? json(res, s) : json(res, { error: 'Not found' }, 404);
  }

  // POST /api/students
  if (pathname === '/api/students' && req.method === 'POST') {
    try {
      const s = store.createStudent(body);
      return json(res, s, 201);
    } catch (e) {
      return json(res, { error: e.message }, 400);
    }
  }

  // PUT /api/student/:id
  const putStudentMatch = pathname.match(/^\/api\/student\/([a-z0-9_]+)$/i);
  if (putStudentMatch && req.method === 'PUT') {
    try {
      const s = store.updateStudent(putStudentMatch[1], body);
      return json(res, s);
    } catch (e) {
      return json(res, { error: e.message }, e.message === 'Student not found' ? 404 : 400);
    }
  }

  // DELETE /api/student/:id
  const delStudentMatch = pathname.match(/^\/api\/student\/([a-z0-9_]+)$/i);
  if (delStudentMatch && req.method === 'DELETE') {
    try {
      store.deleteStudent(delStudentMatch[1]);
      return json(res, { ok: true });
    } catch (e) {
      return json(res, { error: e.message }, e.message === 'Student not found' ? 404 : 400);
    }
  }

  // GET /api/students/search?q= — fuzzy search for enrollment UI
  if (pathname === '/api/students/search' && req.method === 'GET') {
    const results = store.searchStudents(query.q, 50);
    return json(res, results);
  }

  // GET /api/programs
  if (pathname === '/api/programs' && req.method === 'GET') {
    return json(res, store.getPrograms());
  }

  // POST /api/programs
  if (pathname === '/api/programs' && req.method === 'POST') {
    try {
      const p = store.createProgram(body);
      return json(res, p, 201);
    } catch (e) {
      return json(res, { error: e.message }, 400);
    }
  }

  // PUT /api/program/:id
  const putProgramMatch = pathname.match(/^\/api\/program\/([a-z0-9_]+)$/i);
  if (putProgramMatch && req.method === 'PUT') {
    try {
      const p = store.updateProgram(putProgramMatch[1], body);
      return json(res, p);
    } catch (e) {
      return json(res, { error: e.message }, e.message === 'Program not found' ? 404 : 400);
    }
  }

  // GET /api/coaches?season=Winter+2026
  if (pathname === '/api/coaches') {
    let classes = store.getClassesCompat(query.season || '');
    if (!query.season) {
      classes = Object.keys(store.getSeasons()).flatMap(s => store.getClassesCompat(s));
    }
    const coaches = [...new Set(classes.flatMap(c => c.coaches || []).filter(Boolean))].sort();
    return json(res, coaches);
  }

  // GET /api/stats?season=Winter+2026
  if (pathname === '/api/stats') {
    let classes = store.getClassesCompat(query.season || '');
    if (!query.season) {
      classes = Object.keys(store.getSeasons()).flatMap(s => store.getClassesCompat(s));
    }
    const active = classes.filter(c => !c.cancelled);
    const revenue   = active.reduce((s, c) => s + (c.session_cost || 0), 0);
    const expenses  = active.reduce((s, c) => s + (c.expenses || 0), 0);
    const coaches   = [...new Set(active.flatMap(c => c.coaches || []).filter(Boolean))];
    const locations = [...new Set(active.map(c => c.location).filter(Boolean))];
    const totalPax  = active.reduce((s, c) => s + (c.participants || 0), 0);
    const totalMax  = active.reduce((s, c) => s + (c.max_participants || 0), 0);
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

  // GET /api/class/:id — backward compat (numeric id from getClassesCompat)
  const classIdMatch = pathname.match(/^\/api\/class\/(\d+)$/);
  if (classIdMatch && req.method === 'GET') {
    const id = parseInt(classIdMatch[1]);
    const seasons = Object.keys(store.getSeasons());
    for (const season of seasons) {
      const classes = store.getClassesCompat(season);
      const c = classes.find(x => x.id === id);
      if (c) return json(res, c);
    }
    return json(res, { error: 'Not found' }, 404);
  }

  // GET /api/instances
  if (pathname === '/api/instances' && req.method === 'GET') {
    const filters = {};
    if (query.season) filters.season = query.season;
    if (query.from) filters.from = query.from;
    if (query.to) filters.to = query.to;
    if (query.coach) filters.coach = query.coach;
    if (query.type) filters.type = query.type;
    if (query.date) filters.date = query.date;
    if (query.day) filters.day = query.day;
    if (query.location) filters.location = query.location;
    const instances = store.getInstances(filters);
    return json(res, instances);
  }

  // GET /api/instance/:id
  const instanceIdMatch = pathname.match(/^\/api\/instance\/([a-z0-9_]+)$/i);
  if (instanceIdMatch && req.method === 'GET') {
    const inst = store.getInstance(instanceIdMatch[1]);
    return inst ? json(res, inst) : json(res, { error: 'Not found' }, 404);
  }

  // POST /api/instances
  if (pathname === '/api/instances' && req.method === 'POST') {
    try {
      const inst = store.createInstance(body);
      return json(res, inst, 201);
    } catch (e) {
      return json(res, { error: e.message }, 400);
    }
  }

  // PUT /api/instance/:id
  const putInstanceMatch = pathname.match(/^\/api\/instance\/([a-z0-9_]+)$/i);
  if (putInstanceMatch && req.method === 'PUT') {
    try {
      const inst = store.updateInstance(putInstanceMatch[1], body);
      return json(res, inst);
    } catch (e) {
      return json(res, { error: e.message }, e.message === 'Instance not found' ? 404 : 400);
    }
  }

  // DELETE /api/instance/:id?scope=one|future
  const delInstanceMatch = pathname.match(/^\/api\/instance\/([a-z0-9_]+)$/i);
  if (delInstanceMatch && req.method === 'DELETE') {
    try {
      const scope = query.scope === 'future' ? 'future' : 'one';
      const result = store.deleteInstance(delInstanceMatch[1], scope);
      return json(res, typeof result === 'object' ? { ok: true, deleted: result.deleted } : { ok: true });
    } catch (e) {
      return json(res, { error: e.message }, e.message === 'Instance not found' ? 404 : 400);
    }
  }

  // GET /api/templates
  if (pathname === '/api/templates' && req.method === 'GET') {
    const templates = store.getTemplates({ season: query.season });
    return json(res, templates);
  }

  // POST /api/templates
  if (pathname === '/api/templates' && req.method === 'POST') {
    try {
      const t = store.createTemplate(body);
      return json(res, t, 201);
    } catch (e) {
      return json(res, { error: e.message }, 400);
    }
  }

  // PUT /api/template/:id
  const putTemplateMatch = pathname.match(/^\/api\/template\/([a-z0-9_]+)$/i);
  if (putTemplateMatch && req.method === 'PUT') {
    try {
      const scope = body.scope || 'template_only';
      const { scope: _, ...data } = body;
      const t = store.updateTemplate(putTemplateMatch[1], data, scope);
      return json(res, t);
    } catch (e) {
      return json(res, { error: e.message }, e.message === 'Template not found' ? 404 : 400);
    }
  }

  // DELETE /api/template/:id
  const delTemplateMatch = pathname.match(/^\/api\/template\/([a-z0-9_]+)$/i);
  if (delTemplateMatch && req.method === 'DELETE') {
    try {
      store.deleteTemplate(delTemplateMatch[1]);
      return json(res, { ok: true });
    } catch (e) {
      return json(res, { error: e.message }, e.message === 'Template not found' ? 404 : 400);
    }
  }

  // GET /api/seasons-config
  if (pathname === '/api/seasons-config') {
    return json(res, store.getSeasons());
  }

  // PUT /api/seasons-config
  if (pathname === '/api/seasons-config' && req.method === 'PUT') {
    try {
      const { name, start, end } = body;
      if (!name) return json(res, { error: 'name required' }, 400);
      store.updateSeason(name, { start, end });
      return json(res, store.getSeasons());
    } catch (e) {
      return json(res, { error: e.message }, 400);
    }
  }

  // POST /api/migrate
  if (pathname === '/api/migrate' && req.method === 'POST') {
    try {
      const xlsxPath = body.path || XLSX_PATH;
      const outputPath = body.output || JSON_PATH;
      if (!fs.existsSync(xlsxPath)) return json(res, { error: 'XLSX file not found' }, 400);
      const result = migrateToJson(xlsxPath, outputPath);
      return json(res, { ok: true, ...result });
    } catch (e) {
      return json(res, { ok: false, error: e.message }, 500);
    }
  }

  // POST /api/import — run import-financials, import-financials-2, split-adults-kids
  if (pathname === '/api/import' && req.method === 'POST') {
    try {
      const imp1 = require('./data/import-financials');
      const imp2 = require('./data/import-financials-2');
      const split = require('./data/split-adults-kids');
      imp1();
      imp2();
      split();
      store.reload();
      return json(res, { ok: true });
    } catch (e) {
      return json(res, { ok: false, error: e.message }, 500);
    }
  }

  // POST /api/reload
  if (pathname === '/api/reload' && req.method === 'POST') {
    try {
      store.reload();
      const data = store.load();
      const count = (data.templates || []).length + (data.instances || []).length;
      return json(res, { ok: true, count });
    } catch (e) {
      return json(res, { ok: false, error: e.message }, 500);
    }
  }

  // GET /api/gcal/status
  if (pathname === '/api/gcal/status') {
    return json(res, {
      configured: gcal.isConfigured(),
      oauthConnected: gcal.isOAuthConnected(),
    });
  }

  // POST /api/gcal/sync — full two-way sync (push + pull)
  if (pathname === '/api/gcal/sync' && req.method === 'POST') {
    if (!gcal.isConfigured()) {
      return json(res, { ok: false, error: 'Google Calendar not configured' }, 400);
    }
    sync.fullSync()
      .then(result => json(res, result))
      .catch(e => json(res, { ok: false, error: e.message }, 500));
    return;
  }

  // GET /api/gcal/sync-status
  if (pathname === '/api/gcal/sync-status' && req.method === 'GET') {
    return json(res, sync.getSyncStatus());
  }

  // POST /api/gcal/pull — manually trigger pull from Google Calendar
  if (pathname === '/api/gcal/pull' && req.method === 'POST') {
    if (!gcal.isConfigured()) {
      return json(res, { ok: false, error: 'Google Calendar not configured' }, 400);
    }
    sync.pullFromGCal()
      .then(result => json(res, { ok: true, ...result }))
      .catch(e => json(res, { ok: false, error: e.message }, 500));
    return;
  }

  // GET /api/finance/monthly — monthly revenue from imported data
  if (pathname === '/api/finance/monthly' && req.method === 'GET') {
    try {
      const p = path.join(__dirname, 'data', 'monthly-revenue.json');
      const data = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : [];
      return json(res, data);
    } catch (e) {
      return json(res, [], 200);
    }
  }

  // GET /api/finance/sessions — session summary from imported data
  if (pathname === '/api/finance/sessions' && req.method === 'GET') {
    try {
      const p = path.join(__dirname, 'data', 'session-summary.json');
      const data = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : [];
      return json(res, data);
    } catch (e) {
      return json(res, [], 200);
    }
  }

  // GET /api/finance/enrollments — class enrollments from imported data
  if (pathname === '/api/finance/enrollments' && req.method === 'GET') {
    try {
      const p = path.join(__dirname, 'data', 'class-enrollments.json');
      const data = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : [];
      return json(res, data);
    } catch (e) {
      return json(res, [], 200);
    }
  }

  // GET /api/finance/schools — schools/venues database
  if (pathname === '/api/finance/schools' && req.method === 'GET') {
    try {
      const p = path.join(__dirname, 'data', 'schools.json');
      const data = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : [];
      return json(res, data);
    } catch (e) {
      return json(res, [], 200);
    }
  }

  // GET /api/finance/enrollment-history — full enrollment history (optional: ?session=, ?school=, ?student=)
  if (pathname === '/api/finance/enrollment-history' && req.method === 'GET') {
    try {
      const p = path.join(__dirname, 'data', 'enrollment-history.json');
      let data = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : [];
      const PROGRAM_TO_SCHOOL = {
        'S.V. Triaz Adult Classes': 'S.V. Triaz', 'S.V. Triaz Youth Classes': 'S.V. Triaz',
        'S.V. Triaz Youth High Performance': 'S.V. Triaz', 'Adult Match Play 2024': 'S.V. Triaz',
        'S.V. Triaz International French School school pickup': 'International French School (IFS)',
        'S.V. Triaz Youth AICS School Pickup': 'AICS', 'S.V. Triaz Youth Kindercampus Zuidas School Pickup': 'Kindercampus Zuidas',
        'Tennispark Randwijck Adult Classes': 'Tennispark Randwijck', 'Tennispark Randwijck Youth Classes': 'Tennispark Randwijck',
        'Tennispark Randwijck High Performance': 'Tennispark Randwijck',
        'Tennispark Randwijck Youth Amity School Pickup': 'Amity International School', 'Triaz Youth Amity School': 'Amity International School',
        'The British School of Amsterdam after school tennis': 'British School of Amsterdam (BSA)',
        'Tennis, Sports & Parks Camp 2023': 'Camps', 'Youth Camp 2024': 'Camps', 'Youth Camp 2025': 'Camps',
      };
      if (query.session) {
        const s = String(query.session).toLowerCase();
        data = data.filter(e => (e.session || '').toLowerCase().includes(s));
      }
      if (query.school) {
        const s = String(query.school).toLowerCase();
        data = data.filter(e => {
          const school = PROGRAM_TO_SCHOOL[e.program] || (e.program ? 'Other' : 'Private/Other');
          return school.toLowerCase().includes(s);
        });
      }
      if (query.student) {
        const s = String(query.student).toLowerCase();
        data = data.filter(e =>
          (e.student_name || '').toLowerCase().includes(s) ||
          (e.parent1?.email || '').toLowerCase().includes(s)
        );
      }
      return json(res, data);
    } catch (e) {
      return json(res, [], 200);
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
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  // OAuth: GET /auth/google — redirect to Google consent
  if (pathname === '/auth/google' && req.method === 'GET') {
    const baseUrl = `http://localhost:${PORT}`;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${baseUrl}/auth/callback`;
    const url = gcal.getOAuthUrl(redirectUri);
    if (!url) {
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h2>OAuth not configured</h2><p>Add <code>data/oauth-credentials.json</code> from Google Cloud Console.</p>');
      return;
    }
    res.writeHead(302, { Location: url });
    return res.end();
  }

  // OAuth: GET /auth/callback — exchange code for tokens, save, redirect home
  if (pathname === '/auth/callback' && req.method === 'GET') {
    const baseUrl = `http://localhost:${PORT}`;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${baseUrl}/auth/callback`;
    const code = query.code;
    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h2>OAuth failed</h2><p>No authorization code received.</p><p><a href="/">← Back to home</a></p>');
      return;
    }
    gcal.exchangeCodeForTokens(code, redirectUri)
      .then(() => {
        res.writeHead(302, { Location: '/?gcal_connected=1' });
        res.end();
      })
      .catch(e => {
        console.error('[auth] exchangeCodeForTokens failed:', e.message);
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<h2>OAuth failed</h2><p>${(e.message || 'Token exchange failed').replace(/</g, '&lt;')}</p><p><a href="/">← Back to home</a></p>`);
      });
    return;
  }

  // API
  if (pathname.startsWith('/api/')) {
    const needsBody = ['POST', 'PUT'].includes(req.method);
    if (needsBody) {
      readBody(req).then(body => {
        handleAPI(req, res, pathname, query, body);
      }).catch(e => {
        json(res, { error: e.message || 'Invalid JSON' }, 400);
      });
    } else {
      handleAPI(req, res, pathname, query, {});
    }
    return;
  }

  // Page routes → serve HTML from views/
  const PAGE_MAP = {
    '/':          'index.html',
    '/index':     'index.html',
    '/calendar':  'calendar.html',
    '/classes':   'classes.html',
    '/coaches':   'coaches.html',
    '/students':  'students.html',
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

  // Pre-warm the store
  try {
    const data = store.load();
    const t = (data.templates || []).length;
    const i = (data.instances || []).length;
    console.log(`  ✓ Loaded ${t} templates, ${i} instances from classes.json`);
  } catch (e) {
    console.error(`  ✗ Could not load classes.json:`, e.message);
  }

  // Start background GCal sync polling when configured
  if (gcal.isConfigured()) {
    sync.startPolling(60000);
  }
});

module.exports = server;
