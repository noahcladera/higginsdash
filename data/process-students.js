'use strict';
/**
 * One-time script: Parse All_Students_Data.xls into students.json.
 * - Removes test entries and coach-as-student rows
 * - Merges duplicates (same name + same account owner email)
 * - Adds blank level, school, classes_attended
 * - Normalizes DOB, phone
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const XLS_PATH = path.join(__dirname, 'All_Students_Data.xls');
const OUTPUT_PATH = path.join(__dirname, 'students.json');

const KNOWN_COACHES = [
  'noah', 'ivan', 'ioannis', 'christa', 'set', 'ramzi', 'giorgio', 'william',
  'farah', 'yassine', 'melissa', 'sofia', 'olha', 'banu', 'rowan higgins',
  'heather court', 'heather court-coach', 'ramzi chouikha', 'william higgins',
  'sofia giustizieri', 'giorgio crisci', 'noah cladera', 'ivan figueroa',
  'set sjostrand', 'farah fernandez'
];

function isTestEntry(row) {
  const name = (row[0] || '').toLowerCase();
  const acctEmail = (row[6] || '').toLowerCase();
  const acctName = (row[5] || '').toLowerCase();

  // admin@gotimmy.com = test
  if (acctEmail === 'admin@gotimmy.com') return true;

  // Famous/test names
  const testNames = [
    'roger federer', 'john davis', 'steffi graff', 'andre agassi', 'coco gauff',
    'ben shelton', 'test coach', 'test bywilliam', 'testkidfirstname',
    'coach tristan', 'william test', 'testharvey test', 'elle lad',
    'admin test student', 'ggg1111 aaaa111', 'asdasd seg1',
    'seg1 emergency phone number', 'test admin', 'test  studen',
    'test_one_child admin', 'william kid', 'test testy', 'test student',
    'tammie  white', 'test student 2', 'test test', 'gray clock testing',
    'test stdent', 'test 2 student', 'laura martins', 'test  student',
    'test studnt'
  ];
  if (testNames.some(t => name.includes(t))) return true;
  if (/^test\s/i.test(name) || /test$/i.test(name) || name.startsWith('test ')) return true;

  return false;
}

function isCoachAsStudent(row) {
  const name = (row[0] || '').trim().toLowerCase();
  const dob = (row[3] || '').toString().trim();
  const hasDob = dob && dob !== '-' && /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(dob);
  if (hasDob) return false; // Has DOB = real student
  const nameParts = name.split(/\s+/).slice(0, 2);
  return KNOWN_COACHES.some(c => {
    const cp = c.split(/\s+/);
    return nameParts.some(np => cp.includes(np)) || name.includes(c.replace(/\s+/g, ''));
  });
}

function normName(s) {
  if (!s || typeof s !== 'string') return '';
  return s.trim().replace(/\s+/g, ' ');
}

function normEmail(s) {
  if (!s || typeof s !== 'string') return '';
  return s.trim().toLowerCase();
}

function normPhone(s) {
  if (!s || typeof s !== 'string') return '';
  let p = s.trim().replace(/\s+/g, '');
  if (/^\d{9,}$/.test(p) && !p.startsWith('+')) p = '+31' + p;
  else if (p.startsWith('0') && p.length >= 9) p = '+31' + p.slice(1);
  return p || '';
}

function parseDob(val) {
  if (!val || val === '-') return '';
  const s = String(val).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return '';
  const [, mm, dd, yy] = m;
  const y = yy.length === 2 ? '20' + yy : yy;
  return `${y}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

function swapIfNeeded(ownerName, ownerEmail) {
  const n = (ownerName || '').trim();
  const e = (ownerEmail || '').trim();
  const looksLikeEmail = (v) => /^[^@]+@[^@]+\.[^@]+$/.test(v);
  if (looksLikeEmail(n) && !looksLikeEmail(e)) return { name: e, email: n };
  if (!looksLikeEmail(n) && looksLikeEmail(e)) return { name: n, email: e };
  return { name: n, email: e };
}

function rowToStudent(row, id) {
  const { name: acctName, email: acctEmail } = swapIfNeeded(row[5], row[6]);
  return {
    id,
    name: normName(row[0]),
    gender: (row[1] || '').trim() || '',
    level: '',
    dob: parseDob(row[3]),
    school: '',
    status: (row[12] || '').trim() || 'Active',
    classes_attended: [],
    account_owner: {
      name: normName(acctName),
      email: normEmail(acctEmail),
      phone: normPhone(row[7])
    },
    guardian_2: {
      name: row[13] && row[13] !== '-' ? normName(row[13]) : '',
      email: row[14] && row[14] !== '-' ? normEmail(row[14]) : '',
      phone: row[15] && row[15] !== '-' ? normPhone(row[15]) : ''
    },
    address: {
      street: row[8] && row[8] !== '-' ? (row[8] || '').trim() : '',
      unit: (row[17] || '').trim() || '',
      city: row[10] && row[10] !== '-' ? (row[10] || '').trim() : '',
      state: row[9] && row[9] !== '-' ? (row[9] || '').trim() : '',
      zip: row[11] && row[11] !== '-' ? (row[11] || '').trim() : ''
    },
    triaz_membership: (row[16] || '').trim() || ''
  };
}

function mergeRows(rows) {
  if (rows.length === 1) return rows[0];
  // Prefer row with most data: DOB, address, guardian
  let best = rows[0];
  let bestScore = 0;
  const score = (r) => {
    let s = 0;
    if (r[3] && r[3] !== '-') s += 10;
    if (r[8] && r[8] !== '-') s += 5;
    if (r[13] && r[13] !== '-') s += 3;
    return s;
  };
  rows.forEach(r => {
    const sc = score(r);
    if (sc > bestScore) { bestScore = sc; best = r; }
  });
  return best;
}

function main() {
  const wb = XLSX.readFile(XLS_PATH);
  const ws = wb.Sheets['Student_Details'];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  const students = [];
  const processed = new Set();
  let idSeq = 1;

  for (let i = 3; i < data.length; i++) {
    const row = data[i];
    if (!row || !row[0]) continue;

    if (isTestEntry(row)) continue;
    if (isCoachAsStudent(row)) continue;

    const studentName = normName(row[0]).toLowerCase();
    const { name: _an, email: normAcctEmail } = swapIfNeeded(row[5], row[6]);
    const normAcct = normEmail(normAcctEmail);

    const key = studentName + '\0' + normAcct;
    if (processed.has(key)) continue;
    processed.add(key);

    // Group duplicates: same name + same account email → merge
    const duplicates = [];
    for (let j = i; j < data.length; j++) {
      const r = data[j];
      if (!r || !r[0]) continue;
      if (isTestEntry(r) || isCoachAsStudent(r)) continue;
      const n = normName(r[0]).toLowerCase();
      const { email: e } = swapIfNeeded(r[5], r[6]);
      if (n === studentName && normEmail(e) === normAcct) {
        duplicates.push(r);
      }
    }

    const merged = mergeRows(duplicates);
    const student = rowToStudent(merged, 's_' + String(idSeq++).padStart(5, '0'));
    students.push(student);

    // Skip remaining duplicate rows for this key
    duplicates.forEach(r => {
      const k = normName(r[0]).toLowerCase() + '\0' + normEmail(swapIfNeeded(r[5], r[6]).email);
      processed.add(k);
    });
  }

  // Second pass: we may have over-merged. Re-run with simpler logic - group by name+email, take one
  const uniq = [];
  const seen = new Set();
  for (const s of students) {
    const k = s.name.toLowerCase() + '\0' + (s.account_owner?.email || '');
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(s);
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(uniq, null, 2) + '\n', 'utf8');
  console.log('Wrote', uniq.length, 'students to', OUTPUT_PATH);
}

main();
