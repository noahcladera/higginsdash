'use strict';
const fs   = require('fs');
const path = require('path');
const XLSX = require('xlsx');

// ── helpers ──────────────────────────────────────────────────────────────────

function num(v) {
  const s = String(v == null ? '' : v).replace(/[^0-9.\-]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function str(v) { return String(v == null ? '' : v).trim(); }

// Normalize a single time token ("4:30" or "12" or "8") to "HH:MM"
// Rule from the Python parser: hours 1-8 are PM (add 12)
function normTime(t) {
  t = String(t).trim().replace(/pm$/i, '');
  if (!t) return '';
  let h, m = 0;
  if (t.includes(':')) {
    const parts = t.split(':');
    h = parseInt(parts[0], 10);
    m = parseInt(parts[1], 10) || 0;
  } else {
    h = parseInt(t, 10);
  }
  if (isNaN(h)) return '';
  if (h >= 1 && h < 9) h += 12;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

// Extract start/end times from a course name string
// Handles: "4:30-6:00", "12-2:15", "3:30/3:40-5:00", "6:30-8", "8:00-9:00pm"
const TIME_RE = /(\d{1,2}(?::\d{2})?)(?:\/\d{1,2}(?::\d{2})?)?\s*[-–]\s*(\d{1,2}(?::\d{2})?)\s*(?:pm)?/i;

function parseTimeRange(name) {
  const m = TIME_RE.exec(name);
  if (!m) return { start: '', end: '' };
  let start = normTime(m[1]);
  let end   = normTime(m[2]);
  // Fix wraparound: if end <= start, end hour needs +12 (e.g. 20:00→09:00 should be 20:00→21:00)
  if (start && end && end <= start) {
    const eh = parseInt(end.split(':')[0], 10);
    if (eh + 12 <= 23) {
      end = String(eh + 12).padStart(2, '0') + ':' + end.split(':')[1];
    }
  }
  return { start, end };
}

// Day extraction from course name
const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const DAY_MAP = {
  monday:'Monday', tuesday:'Tuesday', wednesday:'Wednesday', thursday:'Thursday',
  friday:'Friday', saturday:'Saturday', sunday:'Sunday',
  mon:'Monday', tue:'Tuesday', tues:'Tuesday', wed:'Wednesday', weds:'Wednesday',
  thu:'Thursday', thur:'Thursday', thurs:'Thursday', fri:'Friday',
  sat:'Saturday', sun:'Sunday',
};

function extractDay(name) {
  const words = name.trim().split(/\s+/);
  if (words.length > 0) {
    const first = words[0].toLowerCase().replace(/[^a-z]/g, '');
    if (DAY_MAP[first]) return DAY_MAP[first];
  }
  return '';
}

// Clean program name: strip day prefix, time range, trailing junk
function cleanProgramName(raw) {
  let n = str(raw);

  // Strip leading day name (full or abbreviated)
  const allDayNames = [
    ...DAYS,
    'Mon','Tue','Tues','Wed','Weds','Thu','Thur','Thurs','Fri','Sat','Sun',
  ];
  for (const d of allDayNames) {
    const re = new RegExp('^' + d + '\\b\\s*', 'i');
    if (re.test(n)) { n = n.replace(re, ''); break; }
  }

  // Strip only the FIRST time range (the class time), not age ranges like "9-14"
  const tm = TIME_RE.exec(n);
  if (tm) {
    n = n.slice(0, tm.index) + ' ' + n.slice(tm.index + tm[0].length);
  }

  // Strip leading/trailing punctuation and whitespace
  n = n.replace(/^[-–\s.,;:]+/, '').replace(/[-–\s.,;:]+$/, '');

  // Strip trailing stray 2-digit numbers (like "23")
  n = n.replace(/\s+\d{1,2}\s*$/, '');

  // Strip "yo" suffix on age numbers ("6-9yo" → "6-9")
  n = n.replace(/(\d)yo\b/gi, '$1');

  // Strip long junk suffixes
  n = n.replace(/[-–]\s*(?:Travel|unless)\s.*$/i, '');

  // Strip truncated "divided by lev..." suffix
  n = n.replace(/\s+divi\w*$/i, '');

  // Strip trailing ". Beginner" duplicates (data entry artifact)
  n = n.replace(/\.\s*Beginner\s*$/i, '');

  // Collapse whitespace
  n = n.replace(/\s+/g, ' ').trim();

  return n || str(raw);
}

// Infer class type from course name and location
function inferType(name, loc) {
  const nl = name.toLowerCase();
  const ll = loc.toLowerCase();
  if (nl.includes('on campus') || (ll.includes('campus') && ll.includes('south'))) return 'School';
  if (nl.includes('private group') || nl.includes('private')) return 'Private';
  const gocapKeywords = [
    'pickup','pick up','amity','ifs','bsa','french school',
    'kindercampus','gocap','gocab','bakfiets',
  ];
  if (gocapKeywords.some(k => nl.includes(k))) return 'GoCAP';
  return 'Club';
}

// Infer age group from course name
function inferAgeGroup(name, isAdult) {
  const m = name.match(/ages?\s*([\d]+[-–][\d]+)/i);
  if (m) return m[1].replace('–', '-');
  const m2 = name.match(/ages?\s*([\d]+)\s*(?:yo)?/i);
  if (m2) return m2[1];
  if (/adult/i.test(name)) return 'Adult';
  if (isAdult) {
    const nl = name.toLowerCase();
    if (!(/ages?\s/i.test(nl)) && /beginner|intermediate|advanced|private/i.test(nl)) {
      return 'Adult';
    }
  }
  return '';
}

// Normalize location name
function normLoc(raw) {
  const l = str(raw).toLowerCase();
  if (!l) return '';
  if (l.includes('randwijk') || l.includes('randwijck')) return 'Randwijck';
  if (l.includes('triaz'))   return 'Triaz';
  if (l === 'vu')            return 'VU';
  if (l.includes('aics') || (l.includes('south') && l.includes('campus'))) return 'AICS South Campus';
  if (l.includes('ajernstraat') || l.includes('aj ern')) return 'AJErnstraat';
  return '';
}

// Check if a cell value looks like a known location
function isKnownLocation(s) {
  return !!normLoc(s);
}

// ── main parser ──────────────────────────────────────────────────────────────
// Handles the raw messy XLSX/CSV format with:
//   - Pricing header rows (skip)
//   - Season markers in col[1] ("WINTER 2026", "SPRING 2026")
//   - Day markers in col[1] ("Monday", "Tuesday", ...)
//   - Youth rows: col[0]=yes/empty, col[1]=location, col[3]=courseName
//   - Adult section markers: col[0]="SPRING 1"/"SPRING 2", col[2]="Adult"
//   - Adult rows: col[0]=location, col[1]=empty, col[3]=courseName
//   - Cancelled marker: col[0]="Cancelled" → skip; col[2]="cancelled" → include but mark

function parseRows(rows) {
  const classes = [];
  let season = null;
  let currentDay = null;
  let inAdultSection = false;
  let idCounter = 1;

  for (let i = 0; i < rows.length; i++) {
    const rawRow = rows[i] || [];
    const row = rawRow.map(v => (v == null ? '' : String(v)));

    const r0 = str(row[0]);
    const r1 = str(row[1]);
    const r2 = str(row[2]);
    const r3 = str(row[3]);

    // ── Season markers ──
    if (/winter\s*2026/i.test(r1)) { season = 'Winter 2026'; inAdultSection = false; continue; }
    if (/spring\s*2026/i.test(r1)) { season = 'Spring 2026'; inAdultSection = false; continue; }

    // ── Adult section markers ("SPRING 1" / "SPRING 2" with "Adult" in col[2]) ──
    if (/^spring\s*[12]$/i.test(r0) && /adult/i.test(r2)) {
      inAdultSection = true;
      if (!season) season = 'Spring 2026';
      continue;
    }

    // ── Day markers (col[1] or col[0] is a day name, no course name) ──
    if (!r3) {
      if (DAYS.includes(r1)) { currentDay = r1; continue; }
      if (DAYS.includes(r0)) { currentDay = r0; continue; }
      continue;
    }

    // ── Skip rows before any season is set (pricing headers) ──
    if (!season) continue;

    // ── Skip rows where col[0] is "Cancelled" ──
    if (/^cancel/i.test(r0)) continue;

    // ── Determine location ──
    let location = '';
    let isAdultRow = false;

    if (isKnownLocation(r1)) {
      location = normLoc(r1);
    } else if (inAdultSection && isKnownLocation(r0)) {
      location = normLoc(r0);
      isAdultRow = true;
    } else if (!inAdultSection && isKnownLocation(r0) && !r1) {
      location = normLoc(r0);
      isAdultRow = true;
    }

    if (!location) continue;

    // ── Parse day and time from course name ──
    const dayFromName = extractDay(r3);
    const { start, end } = parseTimeRange(r3);

    if (!start || !end) continue;

    const day = dayFromName || currentDay;
    if (!day) continue;

    // Update currentDay for rows without explicit day (e.g. Private Group Christa)
    if (dayFromName) currentDay = dayFromName;

    // ── Cancelled detection (col[2] or course name contains "cancel") ──
    const cancelled = /cancel/i.test(r2) || /cancel/i.test(r3);

    // ── Coaches (cols 16-19) ──
    const coaches = [str(row[16]), str(row[17]), str(row[18]), str(row[19])]
      .map(c => c.replace(/\s*\(.*\)/, '').trim())
      .filter(c => c && c !== '?' && c !== '0');

    // ── Program name ──
    const programName = cleanProgramName(r3);

    // ── Type ──
    const type = inferType(r3, location);

    // ── Age group ──
    const ageGroup = inferAgeGroup(r3, isAdultRow || inAdultSection);

    // ── Financials ──
    const weeks        = num(row[6]);
    const costPerClass = num(row[8]);
    const sessionCost  = num(row[9]);
    const participants = num(row[11]);
    const maxPax       = num(row[12]);
    const expPay1      = num(row[22]);
    const expBonus1    = num(row[23]);
    const expPay2      = num(row[24]);
    const expPay3      = num(row[25]);
    const courtFee     = num(row[26]);
    const totalExp     = num(row[27]);
    const income       = num(row[28]);
    const netProfit    = num(row[29]);

    // ── Notes ──
    let notes = '';
    if (cancelled) notes = 'Cancelled';
    else if (/bakfiets/i.test(r2)) notes = 'Bakfiets';
    else if (/private\s*group/i.test(r2)) notes = 'Private Group';

    classes.push({
      id:               idCounter++,
      season,
      day,
      start_time:       start,
      end_time:         end,
      program_name:     programName,
      location,
      type,
      age_group:        ageGroup,
      coaches,
      participants:     participants || 0,
      max_participants: maxPax || 0,
      cost_per_class:   costPerClass,
      weeks,
      session_cost:     sessionCost,
      expenses:         totalExp,
      net_profit:       netProfit,
      income,
      coach_pay:        [expPay1, expPay2, expPay3],
      coach_bonus:      [expBonus1],
      court_fee:        courtFee,
      no_class_dates:   str(row[14]),
      cancelled,
      ready:            true,
      notes,
    });
  }

  return deduplicateClasses(classes);
}

// ── deduplication: merge Spring 1/Spring 2 adult duplicates ────────────────────
// Same season+day+time+location+name → keep one, prefer entry with student data
function deduplicateClasses(classes) {
  const key = (c) => [c.season, c.day, c.start_time, c.end_time, c.location || '', (c.program_name || '').trim()].join('\0');
  const byKey = new Map();
  classes.forEach((c, idx) => {
    const k = key(c);
    const existing = byKey.get(k);
    if (!existing) {
      byKey.set(k, { ...c, _idx: idx });
      return;
    }
    const keep = existing;
    const dup = c;
    const keepHasData = (keep.participants || 0) > 0 || (keep.max_participants || 0) > 0;
    const dupHasData = (dup.participants || 0) > 0 || (dup.max_participants || 0) > 0;
    const preferDup = dupHasData && !keepHasData;
    const base = preferDup ? dup : keep;
    const other = preferDup ? keep : dup;
    const merged = {
      ...base,
      weeks: (base.weeks || 0) + (other.weeks || 0) || base.weeks || other.weeks,
      session_cost: (base.session_cost || 0) + (other.session_cost || 0) || base.session_cost || other.session_cost,
      expenses: (base.expenses || 0) + (other.expenses || 0) || base.expenses || other.expenses,
      income: (base.income || 0) + (other.income || 0) || base.income || other.income,
      net_profit: (base.net_profit != null ? base.net_profit : 0) + (other.net_profit != null ? other.net_profit : 0),
      participants: Math.max(base.participants || 0, other.participants || 0),
      max_participants: Math.max(base.max_participants || 0, other.max_participants || 0),
      cancelled: base.cancelled || other.cancelled,
      coaches: (dup.coaches && dup.coaches.length) ? dup.coaches : (keep.coaches || []),
    };
    if (base.coach_pay && other.coach_pay) {
      merged.coach_pay = base.coach_pay.map((v, i) => (v || 0) + (other.coach_pay[i] || 0));
    }
    if (base.coach_bonus && other.coach_bonus) {
      merged.coach_bonus = base.coach_bonus.map((v, i) => (v || 0) + (other.coach_bonus[i] || 0));
    }
    merged.court_fee = (base.court_fee || 0) + (other.court_fee || 0) || base.court_fee || other.court_fee;
    byKey.set(k, merged);
  });
  const out = Array.from(byKey.values()).map(({ _idx, ...c }) => c);
  const dayOrder = (d) => DAYS.indexOf(d || '');
  out.sort((a, b) => (dayOrder(a.day) - dayOrder(b.day)) || (a.start_time || '').localeCompare(b.start_time || ''));
  out.forEach((c, i) => { c.id = i + 1; });
  return out;
}

// ── file readers ─────────────────────────────────────────────────────────────

function readCsvRows(csvPath) {
  const raw = fs.readFileSync(csvPath, 'utf8');
  return raw.split(/\r?\n/).map(line => {
    const cols = [];
    let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    cols.push(cur.trim());
    return cols;
  });
}

function readXlsxRows(xlsxPath) {
  const wb = XLSX.readFile(xlsxPath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
}

function parse(filePath) {
  const ext = path.extname(filePath || '').toLowerCase();
  const rows = (ext === '.xlsx' || ext === '.xls')
    ? readXlsxRows(filePath)
    : readCsvRows(filePath || path.join(__dirname, 'schedule.csv'));
  return parseRows(rows);
}

// ── cached API ───────────────────────────────────────────────────────────────

let _cache = null;
function getClasses(filePath) {
  if (!_cache) {
    _cache = parse(filePath || path.join(__dirname, 'schedule.csv'));
  }
  return _cache;
}

function reload(filePath) {
  _cache = null;
  return getClasses(filePath);
}

module.exports = { getClasses, reload, parse };
