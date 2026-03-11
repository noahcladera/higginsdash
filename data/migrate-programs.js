'use strict';
/**
 * One-time migration: Add programs to classes.json and assign program_id to templates.
 */
const fs = require('fs');
const path = require('path');

const JSON_PATH = path.join(__dirname, 'classes.json');

const PROGRAMS = [
  { id: 'p_triaz_youth', name: 'S.V. Triaz Youth Classes', location: 'Triaz', type: 'Club', age_category: 'Youth' },
  { id: 'p_triaz_adult', name: 'S.V. Triaz Adult Classes', location: 'Triaz', type: 'Club', age_category: 'Adult' },
  { id: 'p_triaz_hp', name: 'S.V. Triaz Youth High Performance', location: 'Triaz', type: 'Club', age_category: 'Youth HP' },
  { id: 'p_randwijck_youth', name: 'Tennispark Randwijck Youth Classes', location: 'Randwijck', type: 'Club', age_category: 'Youth' },
  { id: 'p_randwijck_adult', name: 'Tennispark Randwijck Adult Classes', location: 'Randwijck', type: 'Club', age_category: 'Adult' },
  { id: 'p_randwijck_amity', name: 'Tennispark Randwijck Youth Amity School Pickup', location: 'Randwijck', type: 'GoCAP', age_category: 'Youth' },
  { id: 'p_bsa', name: 'The British School of Amsterdam after school tennis', location: 'AJErnstraat', type: 'GoCAP', age_category: 'Youth' },
  { id: 'p_aics', name: 'S.V. Triaz Youth AICS School Pickup', location: 'Triaz', type: 'GoCAP', age_category: 'Youth' },
  { id: 'p_kindercampus', name: 'S.V. Triaz Youth Kindercampus Zuidas School Pickup', location: 'Triaz', type: 'GoCAP', age_category: 'Youth' },
  { id: 'p_ifs', name: 'International French School Pickup', location: 'VU', type: 'GoCAP', age_category: 'Youth' },
  { id: 'p_amity', name: 'Triaz Youth Amity School', location: 'Triaz', type: 'GoCAP', age_category: 'Youth' },
  { id: 'p_aics_school', name: 'AICS In-School Program', location: 'AICS South Campus', type: 'School', age_category: 'Youth' },
  { id: 'p_bsa_triaz', name: 'BSA Pickup at Triaz', location: 'Triaz', type: 'GoCAP', age_category: 'Youth' },
  { id: 'p_ifs_aj', name: 'IFS Pickup at AJErnstraat', location: 'AJErnstraat', type: 'GoCAP', age_category: 'Youth' },
  { id: 'p_private', name: 'Private Lessons', location: '', type: 'Private', age_category: 'Adult' },
];

function assignProgramId(template) {
  const loc = (template.location || '').toLowerCase();
  const type = (template.type || '').toLowerCase();
  const prog = (template.program_name || '').toLowerCase();
  const age = (template.age_group || '').toLowerCase();

  if (type === 'school' || loc.includes('aics south')) return 'p_aics_school';
  if (type === 'private') return 'p_private';

  if (type === 'club' && loc.includes('triaz')) {
    if (age === 'adult') return 'p_triaz_adult';
    if (prog.includes('high per') || prog.includes('high perf') || age.includes('8-12') || age.includes('9-14')) return 'p_triaz_hp';
    return 'p_triaz_youth';
  }
  if (type === 'club' && loc.includes('randwijck')) {
    if (age === 'adult') return 'p_randwijck_adult';
    return 'p_randwijck_youth';
  }
  if (type === 'club' && (loc.includes('ajernstraat') || loc.includes('ajern') || loc === 'ajernstraat')) {
    if (prog.includes('high per')) return 'p_triaz_hp';
    return 'p_triaz_youth';
  }
  if (type === 'club' && loc.includes('vu')) return 'p_triaz_youth';

  if (type === 'gocap' || type === 'pickup') {
    if (prog.includes('bsa') || prog.includes('british')) return loc.includes('triaz') ? 'p_bsa_triaz' : 'p_bsa';
    if (prog.includes('ifs') || prog.includes('french')) return loc.includes('ajern') ? 'p_ifs_aj' : 'p_ifs';
    if (prog.includes('aics')) return 'p_aics';
    if (prog.includes('kindercampus') || prog.includes('zuidas')) return 'p_kindercampus';
    if (prog.includes('amity') && loc.includes('randwijck')) return 'p_randwijck_amity';
    if (prog.includes('amity')) return 'p_amity';
    if (prog.includes('bsa')) return 'p_bsa';
    if (prog.includes('ifs')) return 'p_ifs';
    return 'p_aics';
  }

  return 'p_triaz_youth';
}

function main() {
  const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  if (!data.programs) data.programs = PROGRAMS;

  const templates = data.templates || [];
  templates.forEach(t => {
    if (!t.program_id) t.program_id = assignProgramId(t);
    if (!Array.isArray(t.student_ids)) t.student_ids = [];
  });

  fs.writeFileSync(JSON_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log('Migrated', templates.length, 'templates with programs');
}

main();
