'use strict';
/**
 * Split students.json into adults.json and kids.json with relational links.
 * Enriches with enrollment data from class-enrollments.json.
 *
 * Rules:
 * - Under 18 (from DOB) → kid
 * - Else: if the person's name matches account_owner name → adult. Else → kid.
 *
 * Relational fields:
 * - Kids: contact_id, guardian_2_id, enrollments, total_fees, total_paid, outstanding, level, age_from_enrollment
 * - Adults: children_ids, contacts_for_ids, enrollments, total_fees, total_paid, outstanding, level, age_from_enrollment
 */
const fs = require('fs');
const path = require('path');

const STUDENTS_PATH = path.join(__dirname, 'students.json');
const ADULTS_PATH = path.join(__dirname, 'adults.json');
const KIDS_PATH = path.join(__dirname, 'kids.json');
const ENROLLMENTS_PATH = path.join(__dirname, 'class-enrollments.json');

function norm(s) {
  if (!s || typeof s !== 'string') return '';
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normEmail(s) {
  if (!s || typeof s !== 'string') return '';
  return s.trim().toLowerCase();
}

function namesMatch(name1, name2) {
  const a = norm(name1);
  const b = norm(name2);
  if (!a || !b) return false;
  if (a === b) return true;
  const aParts = a.split(' ').filter(Boolean);
  const bParts = b.split(' ').filter(Boolean);
  if (aParts.length && bParts.length && aParts[0] === bParts[0] && aParts[aParts.length - 1] === bParts[bParts.length - 1]) return true;
  return false;
}

function ageFromDob(dob) {
  if (!dob || typeof dob !== 'string') return null;
  const s = dob.trim();
  if (!s || s === '-') return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const birth = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function isUnder18(dob) {
  const age = ageFromDob(dob);
  return age !== null && age < 18;
}

function categorize(record) {
  const name = record.name || '';
  const owner = record.account_owner || {};
  const ownerName = owner.name || '';

  if (isUnder18(record.dob)) return 'kid';
  if (namesMatch(name, ownerName)) return 'adult';
  return 'kid';
}

function main() {
  const raw = fs.readFileSync(STUDENTS_PATH, 'utf8');
  const students = JSON.parse(raw);
  if (!Array.isArray(students)) {
    throw new Error('students.json is not an array');
  }

  const adults = [];
  const kids = [];

  for (const s of students) {
    const category = categorize(s);
    if (category === 'adult') adults.push({ ...s });
    else kids.push({ ...s });
  }

  // Index adults by their contact email (account_owner.email) so kids can reference them
  const adultIdByEmail = new Map();
  for (const a of adults) {
    const email = normEmail(a.account_owner?.email);
    if (email && !/^[-]+$/.test(email)) {
      if (!adultIdByEmail.has(email)) adultIdByEmail.set(email, a.id);
    }
  }

  // Link kids → adults: contact_id (account_owner), guardian_2_id (guardian_2)
  let linkedContact = 0;
  let linkedGuardian2 = 0;
  for (const k of kids) {
    const contactEmail = normEmail(k.account_owner?.email);
    if (contactEmail && adultIdByEmail.has(contactEmail)) {
      k.contact_id = adultIdByEmail.get(contactEmail);
      linkedContact++;
    } else {
      k.contact_id = null;
    }
    const g2Email = normEmail(k.guardian_2?.email);
    if (g2Email && g2Email !== contactEmail && !/^[-]+$/.test(g2Email) && adultIdByEmail.has(g2Email)) {
      k.guardian_2_id = adultIdByEmail.get(g2Email);
      linkedGuardian2++;
    } else {
      k.guardian_2_id = null;
    }
  }

  // Link adults → kids: children_ids (kids who list this adult as account_owner), contacts_for_ids (as guardian_2)
  for (const a of adults) {
    a.children_ids = [];
    a.contacts_for_ids = [];
  }
  const adultById = new Map(adults.map(a => [a.id, a]));
  for (const k of kids) {
    if (k.contact_id && adultById.has(k.contact_id)) {
      adultById.get(k.contact_id).children_ids.push(k.id);
    }
    if (k.guardian_2_id && adultById.has(k.guardian_2_id)) {
      adultById.get(k.guardian_2_id).contacts_for_ids.push(k.id);
    }
  }

  // Enrich with enrollment data from class-enrollments.json (only when no enrollment_history from import)
  let enriched = 0;
  if (fs.existsSync(ENROLLMENTS_PATH)) {
    const enrollmentsRaw = fs.readFileSync(ENROLLMENTS_PATH, 'utf8');
    const classEnrollments = JSON.parse(enrollmentsRaw);
    const allPeople = [...adults, ...kids];
    function findPerson(stuName, parentEmail) {
      const n = norm(stuName);
      const pe = normEmail(parentEmail);
      const candidates = allPeople.filter(p => norm(p.name) === n);
      if (candidates.length === 0) return null;
      if (candidates.length === 1) return candidates[0];
      const withEmail = candidates.find(p => normEmail(p.account_owner?.email) === pe);
      return withEmail || candidates[0];
    }
    for (const cls of classEnrollments) {
      for (const stu of cls.students || []) {
        const person = findPerson(stu.name, stu.parent1?.email);
        if (!person) continue;
        const enrollmentEntry = {
          class_name: cls.class_name,
          session: cls.session,
          fee: stu.fee || 0,
          amount_paid: stu.amount_paid || 0,
          status: stu.status || '',
          booking_type: stu.booking_type || '',
        };
        person.enrollments = person.enrollments || [];
        person.enrollments.push(enrollmentEntry);
        if (stu.level && !person.level) person.level = stu.level;
        if (stu.age && !person.age_from_enrollment) person.age_from_enrollment = stu.age;
        enriched++;
      }
    }
    for (const p of allPeople) {
      const hasImportHistory = Array.isArray(p.enrollment_history) && p.enrollment_history.length > 0;
      if (!hasImportHistory) {
        const enrollments = p.enrollments || [];
        p.total_fees = enrollments.reduce((s, e) => s + (e.fee || 0), 0);
        p.total_paid = enrollments.reduce((s, e) => s + (e.amount_paid || 0), 0);
        p.outstanding = Math.max(0, p.total_fees - p.total_paid);
      }
    }
  }

  fs.writeFileSync(ADULTS_PATH, JSON.stringify(adults, null, 2) + '\n', 'utf8');
  fs.writeFileSync(KIDS_PATH, JSON.stringify(kids, null, 2) + '\n', 'utf8');

  console.log('Split complete (relational):');
  console.log('  adults.json:', adults.length, '| children_ids, contacts_for_ids');
  console.log('  kids.json:', kids.length, '| contact_id, guardian_2_id');
  console.log('  kids linked to contact:', linkedContact);
  console.log('  kids with guardian_2 linked:', linkedGuardian2);
  if (fs.existsSync(ENROLLMENTS_PATH)) {
    console.log('  enrollment records matched:', enriched);
  }
  console.log('  total:', adults.length + kids.length);
}

if (require.main === module) main();
module.exports = main;
