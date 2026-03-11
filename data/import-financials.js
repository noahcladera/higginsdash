'use strict';
/**
 * One-time script: Parse financial XLS files into JSON.
 * - Monthly_Summary (4).xls -> monthly-revenue.json
 * - Session_Summary.xls -> session-summary.json
 * - class_Enrolled_Students*.xls -> class-enrollments.json
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const IMPORTS_BASE = path.join(__dirname, 'imports');
const MONTHLY_PATH = path.join(IMPORTS_BASE, 'monthly-summary', '2023-2026_Monthly_Summary.xls');
const SESSION_PATH = path.join(IMPORTS_BASE, 'session-summary', '2025-2026_Session_Summary.xls');
const CLASS_ENROLL_DIR = path.join(IMPORTS_BASE, 'class-enrollments');
const OUTPUT_MONTHLY = path.join(__dirname, 'monthly-revenue.json');
const OUTPUT_SESSION = path.join(__dirname, 'session-summary.json');
const OUTPUT_ENROLLMENTS = path.join(__dirname, 'class-enrollments.json');

function parseDollar(val) {
  if (val == null) return 0;
  const s = String(val).replace(/[$,]/g, '').trim();
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function parseDateUS(val) {
  if (!val) return '';
  const s = String(val).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return s;
  const [, mm, dd, yy] = m;
  return `${yy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

function parseMonthlySummary() {
  const wb = XLSX.readFile(MONTHLY_PATH);
  const data = XLSX.utils.sheet_to_json(wb.Sheets['Monthly_Summary'], { header: 1 });
  const out = [];
  let i = 4;
  let lastMonth = null, lastYear = null;
  while (i < data.length) {
    const row = data[i];
    if (!row) { i++; continue; }
    const month = row[0] || lastMonth;
    const year = row[1] ?? lastYear;
    if (row[0] != null) lastMonth = row[0];
    if (row[1] != null) lastYear = row[1];
    const label = (row[2] || '').toString().trim();
    if (!label) { i++; continue; }
    if (label === 'Total Revenue') {
      if (!month || !year) { i++; continue; }
      out.push({
        month: String(month),
        year: parseInt(year, 10),
        total_revenue: parseDollar(row[3]),  // col 3 = total, 4-8 = breakdown
        refunds: 0,
        net_revenue: 0,
        season_classes: parseDollar(row[4]),
        recurring_classes: parseDollar(row[5]),
        private_lessons: parseDollar(row[6]),
        camps: parseDollar(row[7]),
        events: parseDollar(row[8]),
      });
    } else if (label === 'Refunds') {
      if (out.length) {
        out[out.length - 1].refunds = parseDollar(row[3]);
      }
    } else if (label === 'Net Revenue') {
      if (out.length) {
        out[out.length - 1].net_revenue = parseDollar(row[3]);
      }
    }
    i++;
  }
  return out;
}

function parseSessionSummary() {
  const wb = XLSX.readFile(SESSION_PATH);
  const data = XLSX.utils.sheet_to_json(wb.Sheets['Session Summary'], { header: 1 });
  const out = [];
  for (let i = 3; i < data.length; i++) {
    const row = data[i];
    if (!row || !row[0]) continue;
    const name = String(row[0]).trim();
    if (name === 'Totals') break;
    out.push({
      name,
      from: parseDateUS(row[1]),
      to: parseDateUS(row[2]),
      classes: parseInt(row[3], 10) || 0,
      coaches: parseInt(row[4], 10) || 0,
      students: parseInt(row[5], 10) || 0,
      gross_revenue: parseDollar(row[6]),
      refunds: parseDollar(row[7]),
      net_revenue: parseDollar(row[8]),
      pending: parseDollar(row[9]),
    });
  }
  return out;
}

function parseEnrolledStudentsFile(filePath) {
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets['Class_Details'] || wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  const title = (data[0] && data[0][0]) ? String(data[0][0]).trim() : '';
  const metaRow = data[3] || [];
  const totalSlots = parseInt(metaRow[0], 10) || 0;
  const slotsAvailable = parseInt(metaRow[1], 10) || 0;
  const level = (metaRow[2] || '').toString().trim() || 'Varies';
  const court = (metaRow[3] || '').toString().trim() || '';
  const session = (metaRow[4] || '').toString().trim() || '';
  const program = (metaRow[5] || '').toString().trim() || '';
  const coachesStr = (metaRow[6] || '').toString().trim() || '';
  const coaches = coachesStr.split(',').map(c => c.trim()).filter(Boolean);
  const students = [];
  for (let r = 7; r < data.length; r++) {
    const row = data[r];
    if (!row || !row[0]) continue;
    const studentName = (row[0] || '').toString().trim();
    if (!studentName || studentName === 'Student Name') continue;
    const fee = parseDollar(row[5]);
    const amountPaid = parseDollar(row[6]);
    const parent1Email = (row[11] || '').toString().trim() || null;
    const parent2Email = (row[14] || '').toString().trim() || null;
    if (!parent1Email || parent1Email === 'Parent1 Email') continue;
    students.push({
      name: studentName,
      age: (row[1] || '').toString().trim() || '',
      level: (row[2] || '').toString().trim() || '',
      payment_mode: (row[3] || '').toString().trim() || '',
      status: (row[4] || '').toString().trim() || '',
      fee,
      amount_paid: amountPaid,
      notes: row[7] != null ? String(row[7]).trim() : null,
      booking_type: (row[8] || '').toString().trim() || '',
      dropin_dates: (row[9] || '').toString().trim() || '-',
      parent1: {
        name: (row[10] || '').toString().trim() || '',
        email: parent1Email,
        phone: (row[12] || '').toString().trim() || '',
      },
      parent2: (row[13] && row[14]) ? {
        name: (row[13] || '').toString().trim() || '',
        email: parent2Email,
        phone: (row[15] || '').toString().trim() || '',
      } : null,
    });
  }
  return {
    class_name: title,
    total_slots: totalSlots,
    slots_available: slotsAvailable,
    level,
    court,
    session,
    program,
    coaches,
    students,
  };
}

function main() {
  if (!fs.existsSync(IMPORTS_BASE)) {
    throw new Error('data/imports directory not found');
  }

  const monthly = parseMonthlySummary();
  fs.writeFileSync(OUTPUT_MONTHLY, JSON.stringify(monthly, null, 2) + '\n', 'utf8');
  console.log('monthly-revenue.json:', monthly.length, 'months');

  const sessions = parseSessionSummary();
  fs.writeFileSync(OUTPUT_SESSION, JSON.stringify(sessions, null, 2) + '\n', 'utf8');
  console.log('session-summary.json:', sessions.length, 'sessions');

  const enrollFiles = fs.readdirSync(CLASS_ENROLL_DIR)
    .filter(f => f.startsWith('class_Enrolled_Students') && f.endsWith('.xls'))
    .sort();
  const enrollments = [];
  for (const f of enrollFiles) {
    const full = path.join(CLASS_ENROLL_DIR, f);
    try {
      const cls = parseEnrolledStudentsFile(full);
      enrollments.push(cls);
    } catch (e) {
      console.error('Error parsing', f, e.message);
    }
  }
  fs.writeFileSync(OUTPUT_ENROLLMENTS, JSON.stringify(enrollments, null, 2) + '\n', 'utf8');
  console.log('class-enrollments.json:', enrollments.length, 'classes');
  const totalStudents = enrollments.reduce((s, c) => s + c.students.length, 0);
  console.log('  total student enrollments:', totalStudents);
}

if (require.main === module) main();
module.exports = main;
