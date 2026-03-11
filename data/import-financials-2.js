'use strict';
/**
 * Import financial data from "financial imports 2" folder:
 * - Enrollment_report.xls -> enrollment-history.json
 * - Session_Summary (1-4).xls -> merge into session-summary.json
 * - Build schools.json from enrollment data
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const IMPORTS_BASE = path.join(__dirname, 'imports');
const ENROLLMENT_PATH = path.join(IMPORTS_BASE, 'enrollment-report', '2023-2026_Enrollment_Report.xls');
const SESSION_DIR = path.join(IMPORTS_BASE, 'session-summary');
const OUTPUT_ENROLLMENT = path.join(__dirname, 'enrollment-history.json');
const OUTPUT_SCHOOLS = path.join(__dirname, 'schools.json');
const OUTPUT_SESSION = path.join(__dirname, 'session-summary.json');
const STUDENTS_PATH = path.join(__dirname, 'students.json');
const CLASSES_PATH = path.join(__dirname, 'classes.json');

// Manual override: enrollment service_name -> template program_name (edge cases)
const SERVICE_TO_TEMPLATE_OVERRIDE = {
  'Winter Ages 7-13 Friday 4:00-5:30PM Beginner to High Performance divided by age and level 2026':
    'Winter Ages 7-11 Friday 4:00-5:30PM Beginner to High Performance divided by age and level 2026',
  'Winter Ages 7-13 Sunday 10:30-12:00PM Beginner to High Performance divided by level 2026':
    'Winter Ages 7-11 Sunday 10:30-12:00PM Beginner to High Performance divided by level 2026',
  'Winter Ages 7-13 Wednesday 4-5:30PM Adv. Beg to High Performance divided by age and level 2026':
    'Winter Ages 7-11 Wednesday 4-5:30PM Adv. Beg to High Performance divided by age and level 2026',
  'Winter Adv. Beg Weds 12-2:15 Ages 7-9 AICS School Pickup 2026':
    'Winter Adv. Beg Weds 12-1:45 Ages 7-9 AICS School Pickup 2026',
  'Winter High Perfor. Mon. 4:30-6PM Ages 9-14 Advanced 2026':
    'Winter High Perf. Mon. 4:30-6PM Ages 9-14 Advanced 2026',
  'Winter Amity Ages 6-9 Advanced Beginner Friday 12:30-2:30PM-Amity School Pickup 2026':
    'Winter Amity Ages 6-9 Advanced Beginner Friday 12:30-2:10PM Amity School Pickup 2026',
  'IFS Friday Age 8-12 30-3:40pm-5:30pm After school pickup 25/26':
    'IFS Friday Age 8-12 3:40pm-5:30pm After school pickup 21/26',
  'IFS Friday ages 5-7 3:30-3:40pm-5:00pm Ages 5-7 After school pickup 25/26':
    'IFS Friday ages 5-7 3:30-5:00pm After school pickup 21/26',
  'Winter Adv Beg Weds 12-1:45 Ages 4-6 AICS School Pickup 2026':
    'Winter Adv. Beg Weds 12-1:45 Ages 4-6 AICS School Pickup 2026',
};

// School name -> id (must match buildSchools output)
const SCHOOL_NAME_TO_ID = {
  'S.V. Triaz': 'school_triaz',
  'AICS': 'school_aics',
  'Camps': 'school_camps',
  'International French School (IFS)': 'school_ifs',
  'Tennispark Randwijck': 'school_randwijck',
  'Amity International School': 'school_amity',
  'British School of Amsterdam (BSA)': 'school_bsa',
  'Kindercampus Zuidas': 'school_kindercampus',
  'Other': 'school_other',
  'Private/Other': 'school_private',
};

// Program -> school mapping
const PROGRAM_TO_SCHOOL = {
  'S.V. Triaz Adult Classes': 'S.V. Triaz',
  'S.V. Triaz Youth Classes': 'S.V. Triaz',
  'S.V. Triaz Youth High Performance': 'S.V. Triaz',
  'Adult Match Play 2024': 'S.V. Triaz',
  'S.V. Triaz International French School school pickup': 'International French School (IFS)',
  'S.V. Triaz Youth AICS School Pickup': 'AICS',
  'S.V. Triaz Youth Kindercampus Zuidas School Pickup': 'Kindercampus Zuidas',
  'Tennispark Randwijck Adult Classes': 'Tennispark Randwijck',
  'Tennispark Randwijck Youth Classes': 'Tennispark Randwijck',
  'Tennispark Randwijck High Performance': 'Tennispark Randwijck',
  'Tennispark Randwijck Youth Amity School Pickup': 'Amity International School',
  'Triaz Youth Amity School': 'Amity International School',
  'The British School of Amsterdam after school tennis': 'British School of Amsterdam (BSA)',
  'Tennis, Sports & Parks Camp 2023': 'Camps',
  'Youth Camp 2024': 'Camps',
  'Youth Camp 2025': 'Camps',
};

function parseDollar(val) {
  if (val == null) return 0;
  const s = String(val).replace(/[$,]/g, '').trim();
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function parseDateUS(val) {
  if (!val) return '';
  const s = String(val).trim();
  // MM/DD/YYYY
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [, mm, dd, yy] = m;
    return `${yy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }
  // MM-DD-YYYY
  m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) {
    const [, mm, dd, yy] = m;
    return `${yy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }
  return s;
}

function parseEnrollmentReport() {
  const wb = XLSX.readFile(ENROLLMENT_PATH);
  const ws = wb.Sheets['Enrollment_Details'] || wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const out = [];
  for (let i = 3; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[0]) continue;
    const rawName = (r[0] || '').toString().trim();
    const flags = [];
    let studentName = rawName;
    if (rawName.includes('(R)')) { flags.push('R'); studentName = rawName.replace(/\s*\(R\)/g, '').trim(); }
    if (rawName.includes('(RR)')) { flags.push('RR'); studentName = rawName.replace(/\s*\(RR\)/g, '').trim(); }
    if (rawName.includes('(M)')) { flags.push('M'); studentName = rawName.replace(/\s*\(M\)/g, '').trim(); }
    if (!studentName) continue;

    const dobRaw = (r[1] || '').toString().trim();
    const dob = dobRaw && dobRaw !== '-' && dobRaw !== ' - ' ? parseDateUS(dobRaw) : null;
    const ageRaw = r[2];
    const age = typeof ageRaw === 'number' ? ageRaw : (ageRaw ? parseInt(String(ageRaw).replace(/\D/g, ''), 10) : null);
    const ageVal = age && !isNaN(age) ? age : null;

    const fee = parseDollar(r[11]);
    const amountPaid = parseDollar(r[12]);
    const discount = parseDollar(r[13]);
    const creditUsed = parseDollar(r[14]);
    const refundAmount = typeof r[17] === 'number' ? r[17] : parseDollar(r[17]);

    const parent1Email = (r[24] || '').toString().trim() || null;
    const parent2Email = (r[27] && r[27] !== '-') ? (r[27] || '').toString().trim() : null;

    out.push({
      student_name: studentName,
      dob: dob || null,
      age: ageVal,
      gender: (r[3] || '').toString().trim() || null,
      level: (r[4] || '').toString().trim() || null,
      triaz_membership: (r[5] || '').toString().trim() === 'Yes',
      session: (r[6] || '').toString().trim() || null,
      program: (r[7] || '').toString().trim() || null,
      service_name: (r[8] || '').toString().trim() || null,
      booking_type: (r[21] || '').toString().trim() || null,
      payment_mode: (r[9] || '').toString().trim() || null,
      status: (r[10] || '').toString().trim() || null,
      fee,
      amount_paid: amountPaid,
      discount,
      credit_used: creditUsed,
      refund_amount: refundAmount,
      booking_date: parseDateUS(r[15]) || null,
      payment_date: parseDateUS(r[16]) || null,
      refund_date: (r[19] && r[19] !== '-') ? parseDateUS(r[19]) : null,
      notes: (r[20] || '').toString().trim() || '',
      dropin_dates: (r[22] && r[22] !== '-') ? (r[22] || '').toString().trim() : null,
      parent1: parent1Email ? {
        name: (r[23] || '').toString().trim() || '',
        email: parent1Email,
        phone: (r[25] || '').toString().trim() || '',
      } : null,
      parent2: parent2Email ? {
        name: (r[26] || '').toString().trim() || '',
        email: parent2Email,
        phone: (r[28] || '').toString().trim() || '',
      } : null,
      address: {
        street: (r[29] || '').toString().trim() || '',
        city: (r[30] || '').toString().trim() || '',
        state: (r[31] || '').toString().trim().replace(/\t/g, '') || '',
        zip: (r[32] || '').toString().trim().replace(/\t/g, '') || '',
      },
      flags,
    });
  }
  return out;
}

function parseSessionSummaryFile(filePath) {
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets['Session Summary'] || wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
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

function mergeSessionSummaries() {
  const existingPath = OUTPUT_SESSION;
  let existing = [];
  if (fs.existsSync(existingPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(existingPath, 'utf8'));
    } catch (_) {}
  }

  const sessFile = path.join(SESSION_DIR, '2022-2024_Session_Summary.xls');
  if (!fs.existsSync(sessFile)) {
    console.log('2022-2024_Session_Summary.xls not found, keeping existing sessions only');
    return existing;
  }

  const historical = parseSessionSummaryFile(sessFile);
  const byName = new Map();
  for (const s of [...historical, ...existing]) {
    if (!byName.has(s.name)) byName.set(s.name, s);
  }
  return Array.from(byName.values()).sort((a, b) => {
    const aFrom = a.from || '';
    const bFrom = b.from || '';
    return aFrom.localeCompare(bFrom);
  });
}

function buildSchools(enrollmentHistory) {
  const bySchool = new Map();
  for (const e of enrollmentHistory) {
    const program = e.program || '';
    const schoolName = PROGRAM_TO_SCHOOL[program] || (program ? 'Other' : 'Private/Other');
    if (!bySchool.has(schoolName)) {
      bySchool.set(schoolName, {
        name: schoolName,
        programs: new Set(),
        students: new Set(),
        enrollments: 0,
        gross_revenue: 0,
        total_refunds: 0,
        revenue_by_year: {},
      });
    }
    const s = bySchool.get(schoolName);
    s.programs.add(program);
    const key = (e.student_name || '').toLowerCase() + '|' + (e.parent1?.email || '').toLowerCase();
    s.students.add(key);
    s.enrollments++;
    s.gross_revenue += e.amount_paid || 0;
    s.total_refunds += e.refund_amount || 0;
    const bookDate = e.booking_date || e.payment_date;
    if (bookDate) {
      const yr = bookDate.split('-')[0];
      if (yr && yr.length === 4) {
        s.revenue_by_year[yr] = (s.revenue_by_year[yr] || 0) + (e.amount_paid || 0);
      }
    }
  }

  const schoolIds = {
    'S.V. Triaz': 'school_triaz',
    'AICS': 'school_aics',
    'Camps': 'school_camps',
    'International French School (IFS)': 'school_ifs',
    'Tennispark Randwijck': 'school_randwijck',
    'Amity International School': 'school_amity',
    'British School of Amsterdam (BSA)': 'school_bsa',
    'Kindercampus Zuidas': 'school_kindercampus',
    'Other': 'school_other',
    'Private/Other': 'school_private',
  };

  const locations = {
    'S.V. Triaz': 'AJ Ernststraat, Amsterdam',
    'AICS': 'AICS South Campus',
    'Camps': 'Various',
    'International French School (IFS)': 'IFS Amsterdam',
    'Tennispark Randwijck': 'Tennispark Randwijck',
    'Amity International School': 'Amity / Randwijck',
    'British School of Amsterdam (BSA)': 'BSA Amsterdam',
    'Kindercampus Zuidas': 'Kindercampus Zuidas',
    'Other': 'Various',
    'Private/Other': 'Various',
  };

  const out = [];
  const years = Object.keys(
    Object.values(bySchool).reduce((acc, s) => {
      Object.keys(s.revenue_by_year).forEach(y => { acc[y] = true; });
      return acc;
    }, {})
  ).sort();

  for (const [name, data] of bySchool.entries()) {
    const netRevenue = data.gross_revenue - data.total_refunds;
    const studentCount = data.students.size;
    const avgRev = studentCount > 0 ? netRevenue / studentCount : 0;

    const yoyGrowth = {};
    for (let i = 1; i < years.length; i++) {
      const prev = data.revenue_by_year[years[i - 1]] || 0;
      const curr = data.revenue_by_year[years[i]] || 0;
      if (prev > 0) {
        yoyGrowth[`${years[i]}_vs_${years[i - 1]}`] = Math.round(((curr - prev) / prev) * 1000) / 10;
      }
    }

    out.push({
      id: schoolIds[name] || `school_${name.toLowerCase().replace(/\s+/g, '_')}`,
      name,
      type: name === 'Camps' || name === 'Private/Other' ? 'other' : (name.includes('School') || name === 'AICS' || name === 'IFS' ? 'school' : 'venue'),
      location: locations[name] || '',
      programs: Array.from(data.programs).filter(Boolean).sort(),
      total_students: studentCount,
      total_enrollments: data.enrollments,
      gross_revenue: Math.round(data.gross_revenue * 100) / 100,
      total_refunds: Math.round(data.total_refunds * 100) / 100,
      net_revenue: Math.round(netRevenue * 100) / 100,
      revenue_by_year: data.revenue_by_year,
      sessions_active: new Set(enrollmentHistory.filter(e => PROGRAM_TO_SCHOOL[e.program] === name).map(e => e.session)).size,
      avg_revenue_per_student: Math.round(avgRev * 100) / 100,
      yoy_growth: yoyGrowth,
    });
  }

  return out.sort((a, b) => b.net_revenue - a.net_revenue);
}

function norm(s) {
  if (!s || typeof s !== 'string') return '';
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normEmail(s) {
  if (!s || typeof s !== 'string') return '';
  return s.trim().toLowerCase();
}

function namesMatch(a, b) {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const aParts = na.split(' ').filter(Boolean);
  const bParts = nb.split(' ').filter(Boolean);
  if (aParts.length && bParts.length && aParts[0] === bParts[0] && aParts[aParts.length - 1] === bParts[bParts.length - 1]) return true;
  return false;
}

function enrichStudents(enrollmentHistory) {
  if (!fs.existsSync(STUDENTS_PATH)) {
    console.log('students.json not found, skipping enrichment');
    return;
  }
  const students = JSON.parse(fs.readFileSync(STUDENTS_PATH, 'utf8'));
  if (!Array.isArray(students)) return;

  const studentById = new Map(students.map(s => [s.id, { ...s }]));
  const enrollmentsByStudentId = new Map();

  for (const e of enrollmentHistory) {
    const enrollName = e.student_name;
    const enrollEmail = normEmail(e.parent1?.email);
    if (!enrollName || !enrollEmail || /^[-]+$/.test(enrollEmail)) continue;

    let matched = null;
    for (const s of students) {
      if (!namesMatch(s.name, enrollName)) continue;
      const ownerEmail = normEmail(s.account_owner?.email);
      if (ownerEmail === enrollEmail) {
        matched = s;
        break;
      }
      if (!ownerEmail || /^[-]+$/.test(ownerEmail)) continue;
    }
    if (!matched) continue;

    const id = matched.id;
    if (!enrollmentsByStudentId.has(id)) enrollmentsByStudentId.set(id, []);
    enrollmentsByStudentId.get(id).push(e);
  }

  let enrichedCount = 0;
  for (const student of students) {
    const id = student.id;
    const enrollments = enrollmentsByStudentId.get(id) || [];
    const rec = studentById.get(id);

    if (enrollments.length === 0) {
      rec.enrollment_history = [];
      rec.first_enrolled = null;
      rec.last_enrolled = null;
      rec.lifetime_value = 0;
      rec.total_fees = 0;
      rec.total_paid = 0;
      rec.outstanding = 0;
      rec.total_discounts = 0;
      rec.total_refunds = 0;
      rec.sessions_count = 0;
      rec.programs = [];
      rec.preferred_program = null;
      rec.payment_reliability = null;
      rec.is_active = false;
      rec.school_ids = [];
      continue;
    }

    enrichedCount++;
    const sorted = [...enrollments].sort((a, b) => {
      const da = a.booking_date || a.payment_date || '';
      const db = b.booking_date || b.payment_date || '';
      return da.localeCompare(db);
    });

    let totalFees = 0;
    let totalPaid = 0;
    let totalDiscounts = 0;
    let totalRefunds = 0;
    const sessionsSet = new Set();
    const programsCount = {};
    const schoolIdsSet = new Set();

    for (const e of enrollments) {
      totalFees += e.fee || 0;
      totalPaid += e.amount_paid || 0;
      totalDiscounts += e.discount || 0;
      totalRefunds += e.refund_amount || 0;
      if (e.session) sessionsSet.add(e.session);
      if (e.program) {
        programsCount[e.program] = (programsCount[e.program] || 0) + 1;
        const schoolName = PROGRAM_TO_SCHOOL[e.program] || (e.program ? 'Other' : 'Private/Other');
        const sid = SCHOOL_NAME_TO_ID[schoolName];
        if (sid) schoolIdsSet.add(sid);
      }
    }

    const firstDate = sorted[0]?.booking_date || sorted[0]?.payment_date;
    const lastDate = sorted[sorted.length - 1]?.booking_date || sorted[sorted.length - 1]?.payment_date;

    const enrollmentHistoryCompact = enrollments.map(e => ({
      session: e.session,
      program: e.program,
      service_name: e.service_name,
      fee: e.fee,
      amount_paid: e.amount_paid,
      booking_date: e.booking_date,
      status: e.status,
      booking_type: e.booking_type,
    }));

    rec.enrollment_history = enrollmentHistoryCompact;
    rec.first_enrolled = firstDate || null;
    rec.last_enrolled = lastDate || null;
    rec.lifetime_value = Math.round(totalPaid * 100) / 100;
    rec.total_fees = Math.round(totalFees * 100) / 100;
    rec.total_paid = Math.round(totalPaid * 100) / 100;
    rec.outstanding = Math.max(0, Math.round((totalFees - totalPaid) * 100) / 100);
    rec.total_discounts = Math.round(totalDiscounts * 100) / 100;
    rec.total_refunds = Math.round(totalRefunds * 100) / 100;
    rec.sessions_count = sessionsSet.size;
    rec.programs = [...new Set(enrollments.map(e => e.program).filter(Boolean))];
    rec.preferred_program = Object.entries(programsCount).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    rec.payment_reliability = totalFees > 0 ? Math.round((totalPaid / totalFees) * 1000) / 1000 : null;
    rec.school_ids = [...schoolIdsSet];

    const recentSessions = ['Youth Winter 2026', 'Adult Spring 2026', 'Youth Spring 2026', 'IFS 2025-2026', 'BSA 2025-2026'];
    rec.is_active = [...sessionsSet].some(s => recentSessions.some(r => (s || '').includes(r) || (r || '').includes(s)));

    if (!rec.dob || rec.dob === '-' || rec.dob === '') {
      const withDob = enrollments.find(e => e.dob);
      if (withDob) rec.dob = withDob.dob;
    }
    if (!rec.gender || rec.gender === '-') {
      const withGender = enrollments.find(e => e.gender);
      if (withGender) rec.gender = withGender.gender;
    }
    if (!rec.level || rec.level === '') {
      const withLevel = enrollments.filter(e => e.level).pop();
      if (withLevel) rec.level = withLevel.level;
    }
    if (!rec.address || !rec.address.street || rec.address.street === '-') {
      const withAddr = enrollments.find(e => e.address?.street && e.address.street !== '-');
      if (withAddr && withAddr.address) rec.address = { ...withAddr.address, unit: rec.address?.unit || '' };
    }
    if (rec.triaz_membership === '' || rec.triaz_membership === false) {
      const withTriaz = enrollments.find(e => e.triaz_membership);
      if (withTriaz) rec.triaz_membership = 'Yes';
    } else if (rec.triaz_membership === true) {
      rec.triaz_membership = 'Yes';
    }
  }

  const out = Array.from(studentById.values());
  fs.writeFileSync(STUDENTS_PATH, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log('students.json enriched:', enrichedCount, 'students matched with enrollment history');
}

function normService(s) {
  if (!s || typeof s !== 'string') return '';
  return s
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function serviceMatchesTemplate(serviceName, programName) {
  if (!serviceName || !programName) return false;
  if (serviceName === programName) return true;
  const ns = normService(serviceName);
  const np = normService(programName);
  if (ns === np) return true;
  const nsNorm = ns.replace(/\s*25\/26|21\/26|22\/23|23\/24|24\/25/gi, '').replace(/\d{4}$/, '').trim();
  const npNorm = np.replace(/\s*25\/26|21\/26|22\/23|23\/24|24\/25/gi, '').replace(/\d{4}$/, '').trim();
  return nsNorm === npNorm;
}

function populateTemplateStudents(enrollmentHistory) {
  if (!fs.existsSync(CLASSES_PATH)) {
    console.log('classes.json not found, skipping template student population');
    return;
  }
  if (!fs.existsSync(STUDENTS_PATH)) {
    console.log('students.json not found, skipping template student population');
    return;
  }

  const classesData = JSON.parse(fs.readFileSync(CLASSES_PATH, 'utf8'));
  const templates = classesData.templates || [];
  const instances = classesData.instances || [];
  const students = JSON.parse(fs.readFileSync(STUDENTS_PATH, 'utf8'));
  if (!Array.isArray(students)) return;

  const studentById = new Map(students.map(s => [s.id, s]));
  const studentByName = new Map();
  for (const s of students) {
    const n = norm(s.name);
    if (!n) continue;
    if (!studentByName.has(n)) studentByName.set(n, s.id);
  }

  const enrollmentsBySession = new Map();
  for (const e of enrollmentHistory) {
    const session = (e.session || '').trim();
    const sn = (e.service_name || '').trim();
    if (!session || !sn) continue;
    if (!enrollmentsBySession.has(session)) enrollmentsBySession.set(session, []);
    enrollmentsBySession.get(session).push(e);
  }

  let populatedCount = 0;
  for (const template of templates) {
    const programName = template.program_name || '';
    const season = (template.season || '').trim();
    const studentIds = new Set();

    const sessionEnrollments = enrollmentsBySession.get(season) || [];
    for (const e of sessionEnrollments) {
      const serviceName = (e.service_name || '').trim();
      if (!serviceName) continue;

      let matchesTemplate = false;
      if (SERVICE_TO_TEMPLATE_OVERRIDE[serviceName]) {
        matchesTemplate = SERVICE_TO_TEMPLATE_OVERRIDE[serviceName] === programName;
      } else {
        matchesTemplate = serviceMatchesTemplate(serviceName, programName);
      }
      if (!matchesTemplate) continue;

      const name = (e.student_name || '').trim().replace(/\s+/g, ' ');
      if (!name) continue;

      let sid = studentByName.get(norm(name));
      if (!sid && e.parent1?.email) {
        for (const s of students) {
          if (namesMatch(s.name, e.student_name) && normEmail(s.account_owner?.email) === normEmail(e.parent1?.email)) {
            sid = s.id;
            break;
          }
        }
      }
      if (sid && studentById.has(sid)) studentIds.add(sid);
    }

    const validIds = [...studentIds].filter(id => studentById.has(id));
    template.student_ids = validIds;
    template.enrollment_count = validIds.length;
    if (validIds.length > 0) populatedCount++;
  }

  const templateById = new Map(templates.map(t => [t.id, t]));

  for (const inst of instances) {
    const template = inst.template_id ? templateById.get(inst.template_id) : null;
    if (!template || !template.student_ids?.length) {
      inst.participant_names = inst.participant_names || [];
      continue;
    }
    inst.participant_names = (template.student_ids || [])
      .map(sid => studentById.get(sid))
      .filter(Boolean)
      .map(s => (s.name || '').trim())
      .filter(Boolean);
  }

  fs.writeFileSync(CLASSES_PATH, JSON.stringify(classesData, null, 2) + '\n', 'utf8');
  console.log('classes.json: populated', populatedCount, 'templates with students from enrollment data');
}

function main() {
  if (!fs.existsSync(IMPORTS_BASE)) {
    throw new Error('data/imports directory not found');
  }

  console.log('Parsing Enrollment_report.xls...');
  const enrollmentHistory = parseEnrollmentReport();
  fs.writeFileSync(OUTPUT_ENROLLMENT, JSON.stringify(enrollmentHistory, null, 2) + '\n', 'utf8');
  console.log('enrollment-history.json:', enrollmentHistory.length, 'records');

  console.log('Merging session summaries...');
  const sessions = mergeSessionSummaries();
  fs.writeFileSync(OUTPUT_SESSION, JSON.stringify(sessions, null, 2) + '\n', 'utf8');
  console.log('session-summary.json:', sessions.length, 'sessions');

  console.log('Building schools database...');
  const schools = buildSchools(enrollmentHistory);
  fs.writeFileSync(OUTPUT_SCHOOLS, JSON.stringify(schools, null, 2) + '\n', 'utf8');
  console.log('schools.json:', schools.length, 'schools/venues');

  console.log('Enriching students.json...');
  enrichStudents(enrollmentHistory);

  console.log('Populating classes with students from enrollment data...');
  populateTemplateStudents(enrollmentHistory);

  console.log('Done.');
}

if (require.main === module) main();
module.exports = main;
