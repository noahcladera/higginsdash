'use strict';
const fs = require('fs');
const path = require('path');

let gcal = null;
try { gcal = require('./gcal'); } catch { /* optional */ }

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_TO_NUM = Object.fromEntries(DAYS.map((d, i) => [d, i]));

const JSON_PATH = path.join(__dirname, 'classes.json');
const STUDENTS_PATH = path.join(__dirname, 'students.json');

function genId(prefix) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return prefix + s;
}

function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseNoClassDates(val) {
  if (Array.isArray(val)) return val.filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s));
  if (!val || typeof val !== 'string') return [];
  return String(val)
    .split(/[\s,;]+/)
    .map(s => s.trim())
    .filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s) || /^\d{1,2}\/\d{1,2}(?:\/\d{2,4})?$/.test(s))
    .map(s => {
      if (s.includes('-')) return s;
      const parts = s.split('/');
      if (parts.length === 3) return `${parts[2].length === 2 ? '20' + parts[2] : parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      return `${new Date().getFullYear()}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    });
}

function getTemplateDateRange(template, seasons) {
  if (template.term_start && template.term_end) {
    return { start: template.term_start, end: template.term_end };
  }
  const range = (seasons || {})[template.season];
  return range && range.start && range.end ? range : null;
}

function load() {
  try {
    const raw = fs.readFileSync(JSON_PATH, 'utf8');
    const data = JSON.parse(raw);
    if (!data.templates) data.templates = [];
    if (!data.instances) data.instances = [];
    if (!data.seasons) data.seasons = {};
    if (!data.programs) data.programs = [];
    return data;
  } catch (e) {
    return { version: 1, seasons: {}, templates: [], instances: [], programs: [] };
  }
}

function save(data) {
  const tmpPath = JSON_PATH + '.tmp.' + Date.now();
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpPath, JSON_PATH);
}

function getSeasons() {
  const data = load();
  return data.seasons || {};
}

function updateSeason(name, { start, end }) {
  const data = load();
  if (!data.seasons) data.seasons = {};
  if (start != null) data.seasons[name] = { ...(data.seasons[name] || {}), start };
  if (end != null) data.seasons[name] = { ...(data.seasons[name] || {}), end };
  save(data);
  return data.seasons[name];
}

function getTemplates(filters = {}) {
  const data = load();
  let list = [...(data.templates || [])];
  if (filters.season) list = list.filter(t => t.season === filters.season);
  if (filters.program_id) list = list.filter(t => t.program_id === filters.program_id);
  return list;
}

function getPrograms() {
  const data = load();
  return [...(data.programs || [])];
}

function createProgram(programData) {
  const data = load();
  const id = programData.id || genId('p_');
  const program = {
    id,
    name: programData.name || '',
    location: programData.location || '',
    type: programData.type || 'Club',
    age_category: programData.age_category || '',
  };
  data.programs = data.programs || [];
  data.programs.push(program);
  save(data);
  return program;
}

function updateProgram(id, updateData) {
  const data = load();
  const idx = (data.programs || []).findIndex(p => p.id === id);
  if (idx < 0) throw new Error('Program not found');
  data.programs[idx] = { ...data.programs[idx], ...updateData };
  save(data);
  return data.programs[idx];
}

function deleteProgram(id) {
  const data = load();
  data.programs = (data.programs || []).filter(p => p.id !== id);
  data.templates = (data.templates || []).map(t => (t.program_id === id ? { ...t, program_id: null } : t));
  save(data);
  return true;
}

function getInstances(filters = {}) {
  const data = load();
  let list = [...(data.instances || [])];
  if (filters.season) {
    const seasons = data.seasons || {};
    const range = seasons[filters.season];
    if (range && range.start && range.end) {
      list = list.filter(i => i.date >= range.start && i.date <= range.end);
    }
  }
  if (filters.from) list = list.filter(i => i.date >= filters.from);
  if (filters.to) list = list.filter(i => i.date <= filters.to);
  if (filters.coach) list = list.filter(i => (i.coaches || []).includes(filters.coach));
  if (filters.type) list = list.filter(i => i.type === filters.type);
  if (filters.date) list = list.filter(i => i.date === filters.date);
  if (filters.day) list = list.filter(i => {
    const d = new Date(i.date + 'T12:00:00');
    const dayName = DAYS[d.getDay()];
    return dayName === filters.day;
  });
  if (filters.location) list = list.filter(i => i.location === filters.location);
  return list.sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.start_time || '').localeCompare(b.start_time || ''));
}

function generateInstances(templateId) {
  const data = load();
  const template = (data.templates || []).find(t => t.id === templateId);
  if (!template) throw new Error('Template not found');
  const range = getTemplateDateRange(template, data.seasons || {});
  if (!range || !range.start || !range.end) throw new Error('Term/season date range not configured');

  const startDate = new Date(range.start + 'T12:00:00');
  const endDate = new Date(range.end + 'T12:00:00');
  const targetDay = DAY_TO_NUM[template.day_of_week];
  if (targetDay == null) throw new Error('Invalid day_of_week');

  const noClass = parseNoClassDates(template.no_class_dates || '');
  const delivery = template.delivery || (template.type === 'GoCAP' ? 'pickup' : 'onsite');
  const startTime = template.start_time || template.lesson_start;
  const students = typeof loadStudents === 'function' ? loadStudents() : [];
  const participant_names = (template.student_ids || [])
    .map(sid => students.find(s => s.id === sid))
    .filter(Boolean)
    .map(s => (s.name || '').trim())
    .filter(Boolean);
  const endTime = template.end_time || template.lesson_end;
  const pickupTime = delivery === 'pickup' ? (template.pickup_time || startTime) : null;
  const lessonStart = delivery === 'pickup' ? (template.lesson_start || template.start_time) : startTime;
  const lessonEnd = delivery === 'pickup' ? (template.lesson_end || template.end_time) : endTime;

  const instances = [];
  const d = new Date(startDate);
  while (d <= endDate) {
    if (d.getDay() === targetDay) {
      const dateStr = toDateStr(d);
      if (!noClass.includes(dateStr)) {
        const now = new Date().toISOString();
        const inst = {
          id: genId('i_'),
          template_id: templateId,
          date: dateStr,
          start_time: startTime,
          end_time: endTime,
          delivery,
          pickup_time: pickupTime,
          lesson_start: lessonStart,
          lesson_end: lessonEnd,
          program_name: template.program_name,
          location: template.location,
          type: template.type,
          age_group: template.age_group || '',
          coaches: [...(template.coaches || [])],
          original_coaches: [...(template.coaches || [])],
          participants: 0,
          max_participants: template.max_participants || 0,
          cost_per_class: template.cost_per_class,
          coach_pay: [...(template.coach_pay || [])],
          court_fee: template.court_fee || 0,
          cancelled: false,
          notes: '',
          participant_names: [...participant_names],
          updated_at: now,
        };
        instances.push(inst);
      }
    }
    d.setDate(d.getDate() + 1);
  }

  const removed = (data.instances || []).filter(i => i.template_id === templateId);
  removed.forEach(i => {
    if (gcal && gcal.isConfigured() && i.gcal_event_id) {
      setImmediate(() => gcal.deleteEvent(i.gcal_event_id).catch(() => {}));
    }
  });
  data.instances = (data.instances || []).filter(i => i.template_id !== templateId);
  data.instances.push(...instances);
  data.instances.sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.start_time || '').localeCompare(b.start_time || ''));
  save(data);
  if (gcal && gcal.isConfigured() && instances.length) {
    setImmediate(() => {
      let chain = Promise.resolve();
      instances.forEach(inst => {
        chain = chain.then(() => gcal.createEvent(inst))
          .then(eventId => {
            if (eventId) {
              const d = load();
              const i = (d.instances || []).find(x => x.id === inst.id);
              if (i) {
                i.gcal_event_id = eventId;
                i.gcal_updated_at = new Date().toISOString();
                save(d);
              }
            }
          })
          .catch(() => {});
      });
    });
  }
  return instances;
}

function createTemplate(templateData) {
  const data = load();
  const id = genId('t_');
  const delivery = templateData.delivery || (templateData.type === 'GoCAP' ? 'pickup' : 'onsite');
  const startTime = templateData.start_time || templateData.lesson_start;
  const endTime = templateData.end_time || templateData.lesson_end;
  const pickupTime = delivery === 'pickup' ? (templateData.pickup_time || startTime) : null;
  const lessonStart = delivery === 'pickup' ? (templateData.lesson_start || startTime) : startTime;
  const lessonEnd = delivery === 'pickup' ? (templateData.lesson_end || endTime) : endTime;

  const template = {
    id,
    season: templateData.season || templateData.term,
    day_of_week: templateData.day_of_week,
    start_time: startTime,
    end_time: endTime,
    delivery,
    pickup_time: pickupTime,
    lesson_start: lessonStart,
    lesson_end: lessonEnd,
    term_start: templateData.term_start || null,
    term_end: templateData.term_end || null,
    program_name: templateData.program_name || '',
    location: templateData.location || '',
    type: templateData.type || 'Club',
    age_group: templateData.age_group || '',
    coaches: [...(templateData.coaches || [])],
    max_participants: templateData.max_participants || 0,
    cost_per_class: templateData.cost_per_class ?? null,
    coach_pay: [...(templateData.coach_pay || [])],
    court_fee: templateData.court_fee ?? 0,
    no_class_dates: Array.isArray(templateData.no_class_dates)
      ? templateData.no_class_dates.join(', ')
      : (templateData.no_class_dates || ''),
    notes: templateData.notes || '',
    program_id: templateData.program_id || null,
    student_ids: Array.isArray(templateData.student_ids) ? templateData.student_ids : [],
  };
  data.templates = data.templates || [];
  data.templates.push(template);
  save(data);
  generateInstances(id);
  return template;
}

function updateTemplate(id, updateData, scope = 'template_only') {
  const data = load();
  const idx = (data.templates || []).findIndex(t => t.id === id);
  if (idx < 0) throw new Error('Template not found');
  const template = { ...data.templates[idx], ...updateData };
  data.templates[idx] = template;
  save(data);
  if (scope === 'all') {
    generateInstances(id);
  } else if (updateData.student_ids !== undefined && typeof loadStudents === 'function' && gcal && gcal.isConfigured()) {
    const students = loadStudents();
    const participant_names = (template.student_ids || [])
      .map(sid => students.find(s => s.id === sid))
      .filter(Boolean)
      .map(s => (s.name || '').trim())
      .filter(Boolean);
    const today = toDateStr(new Date());
    const instances = (data.instances || []).filter(i => i.template_id === id && i.date >= today);
    instances.forEach(inst => {
      inst.participant_names = [...participant_names];
      if (inst.gcal_event_id) {
        setImmediate(() => gcal.updateEvent(inst).catch(() => {}));
      }
    });
    save(data);
  }
  return template;
}

function deleteTemplate(id) {
  const data = load();
  const toRemove = (data.instances || []).filter(i => i.template_id === id);
  toRemove.forEach(i => {
    if (gcal && gcal.isConfigured() && i.gcal_event_id) {
      setImmediate(() => gcal.deleteEvent(i.gcal_event_id).catch(() => {}));
    }
  });
  data.templates = (data.templates || []).filter(t => t.id !== id);
  data.instances = (data.instances || []).filter(i => i.template_id !== id);
  save(data);
  return true;
}

function createInstance(instanceData) {
  const data = load();
  const id = genId('i_');
  const now = new Date().toISOString();
  const instance = {
    id,
    gcal_event_id: instanceData.gcal_event_id || null,
    template_id: instanceData.template_id || null,
    date: instanceData.date,
    start_time: instanceData.start_time,
    end_time: instanceData.end_time,
    delivery: instanceData.delivery || 'onsite',
    pickup_time: instanceData.pickup_time || null,
    lesson_start: instanceData.lesson_start || instanceData.start_time,
    lesson_end: instanceData.lesson_end || instanceData.end_time,
    program_name: instanceData.program_name || '',
    location: instanceData.location || '',
    type: instanceData.type || 'Club',
    age_group: instanceData.age_group || '',
    coaches: [...(instanceData.coaches || [])],
    original_coaches: instanceData.original_coaches ? [...instanceData.original_coaches] : [...(instanceData.coaches || [])],
    participants: instanceData.participants ?? 0,
    max_participants: instanceData.max_participants ?? 0,
    cost_per_class: instanceData.cost_per_class ?? null,
    coach_pay: [...(instanceData.coach_pay || [])],
    court_fee: instanceData.court_fee ?? 0,
    cancelled: instanceData.cancelled ?? false,
    notes: instanceData.notes || '',
    updated_at: now,
    gcal_updated_at: instanceData.gcal_updated_at || null,
  };
  if (instance.template_id && typeof loadStudents === 'function') {
    const template = (data.templates || []).find(t => t.id === instance.template_id);
    const students = loadStudents();
    const names = (template?.student_ids || [])
      .map(sid => students.find(s => s.id === sid))
      .filter(Boolean)
      .map(s => (s.name || '').trim())
      .filter(Boolean);
    instance.participant_names = names;
  } else {
    instance.participant_names = instanceData.participant_names || [];
  }
  data.instances = data.instances || [];
  data.instances.push(instance);
  data.instances.sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.start_time || '').localeCompare(b.start_time || ''));
  save(data);
  const fromGcal = instanceData.fromGcal || instanceData.skipGcalSync;
  if (!fromGcal && gcal && gcal.isConfigured()) {
    setImmediate(() => {
      gcal.createEvent(instance).then(eventId => {
        if (eventId) {
          const d = load();
          const i = (d.instances || []).find(x => x.id === instance.id);
          if (i) {
            i.gcal_event_id = eventId;
            i.gcal_updated_at = new Date().toISOString();
            save(d);
          }
        }
      }).catch(() => {});
    });
  }
  return instance;
}

function updateInstance(id, updateData) {
  const data = load();
  const idx = (data.instances || []).findIndex(i => i.id === id);
  if (idx < 0) throw new Error('Instance not found');
  const { skipGcalSync, ...rest } = updateData;
  const instance = { ...data.instances[idx], ...rest };
  instance.updated_at = new Date().toISOString();
  data.instances[idx] = instance;
  save(data);
  if (!skipGcalSync && gcal && gcal.isConfigured() && instance.gcal_event_id) {
    setImmediate(() => {
      gcal.updateEvent(instance).catch(() => {});
    });
  }
  return instance;
}

function deleteInstance(id, scope = 'one') {
  const data = load();
  const inst = (data.instances || []).find(i => i.id === id);
  if (!inst) throw new Error('Instance not found');

  if (scope === 'future' && inst.template_id) {
    const fromDate = inst.date || '';
    const toDelete = (data.instances || []).filter(
      i => i.template_id === inst.template_id && (i.date || '') >= fromDate
    );
    toDelete.forEach(i => {
      if (gcal && gcal.isConfigured() && i.gcal_event_id) {
        setImmediate(() => gcal.deleteEvent(i.gcal_event_id).catch(() => {}));
      }
    });
    data.instances = (data.instances || []).filter(
      i => !(i.template_id === inst.template_id && (i.date || '') >= fromDate)
    );
    save(data);
    return { deleted: toDelete.length };
  }

  const gcalEventId = inst.gcal_event_id;
  data.instances = (data.instances || []).filter(i => i.id !== id);
  save(data);
  if (gcal && gcal.isConfigured() && gcalEventId) {
    setImmediate(() => {
      gcal.deleteEvent(gcalEventId).catch(() => {});
    });
  }
  return true;
}

function getInstance(id) {
  const data = load();
  return (data.instances || []).find(i => i.id === id) || null;
}

function findInstanceByGcalEventId(gcalEventId) {
  if (!gcalEventId) return null;
  const data = load();
  return (data.instances || []).find(i => i.gcal_event_id === gcalEventId) || null;
}

function upsertInstanceFromGCal(instanceData) {
  const existing = instanceData.gcal_event_id
    ? findInstanceByGcalEventId(instanceData.gcal_event_id)
    : null;
  if (existing) {
    return updateInstance(existing.id, {
      ...instanceData,
      id: existing.id,
      skipGcalSync: true,
    });
  }
  return createInstance({ ...instanceData, fromGcal: true });
}

function markInstanceCancelled(gcalEventId) {
  const inst = findInstanceByGcalEventId(gcalEventId);
  if (!inst) return false;
  updateInstance(inst.id, { cancelled: true, skipGcalSync: true });
  return true;
}

function getTemplate(id) {
  const data = load();
  return (data.templates || []).find(t => t.id === id) || null;
}

function getClassesCompat(season) {
  const data = load();
  const templates = (data.templates || []).filter(t => t.season === season);
  const instances = (data.instances || []).filter(i => {
    const t = (data.templates || []).find(tm => tm.id === i.template_id);
    return t && t.season === season;
  });

  const byKey = new Map();
  templates.forEach((t, idx) => {
    const key = [t.season, t.day_of_week, t.start_time, t.end_time, t.location || '', (t.program_name || '').trim()].join('\0');
    const sessionCost = (t.cost_per_class || 0) * (countWeeksInSeason(t, data.seasons) || 1);
    const expenses = (t.coach_pay || []).reduce((s, p) => s + (p || 0), 0) + (t.court_fee || 0);
    byKey.set(key, {
      id: idx + 1,
      season: t.season,
      day: t.day_of_week,
      start_time: t.start_time,
      end_time: t.end_time,
      program_name: t.program_name,
      location: t.location,
      type: t.type,
      age_group: t.age_group,
      coaches: t.coaches || [],
      participants: 0,
      max_participants: t.max_participants || 0,
      cost_per_class: t.cost_per_class,
      weeks: countWeeksInSeason(t, data.seasons),
      session_cost: sessionCost,
      expenses,
      net_profit: sessionCost - expenses,
      income: sessionCost,
      coach_pay: t.coach_pay || [],
      coach_bonus: [],
      court_fee: t.court_fee || 0,
      no_class_dates: t.no_class_dates || '',
      cancelled: false,
      ready: true,
      notes: t.notes || '',
      date: null,
    });
  });

  instances.forEach(i => {
    const t = (data.templates || []).find(tm => tm.id === i.template_id);
    if (!t) return;
    const key = [t.season, t.day_of_week, t.start_time, t.end_time, t.location || '', (t.program_name || '').trim()].join('\0');
    const existing = byKey.get(key);
    if (existing) {
      existing.participants = Math.max(existing.participants || 0, i.participants || 0);
      existing.max_participants = Math.max(existing.max_participants || 0, i.max_participants || 0);
      if (i.cancelled) existing.cancelled = true;
    }
  });

  const list = Array.from(byKey.values());
  list.sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || (a.start_time || '').localeCompare(b.start_time || ''));
  list.forEach((c, i) => { c.id = i + 1; });
  return list;
}

function countWeeksInSeason(template, seasons) {
  const range = getTemplateDateRange(template, seasons);
  if (!range || !range.start || !range.end) return null;
  const start = new Date(range.start + 'T12:00:00');
  const end = new Date(range.end + 'T12:00:00');
  const targetDay = DAY_TO_NUM[template.day_of_week];
  if (targetDay == null) return null;
  let count = 0;
  const d = new Date(start);
  while (d <= end) {
    if (d.getDay() === targetDay) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

function reload() {
  return load();
}

// ── Students (separate JSON file) ─────────────────────────────────────────────
function loadStudents() {
  try {
    const raw = fs.readFileSync(STUDENTS_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

function saveStudents(students) {
  fs.writeFileSync(STUDENTS_PATH, JSON.stringify(students, null, 2) + '\n', 'utf8');
}

function getStudents(filters = {}) {
  let list = [...loadStudents()];
  if (filters.q) {
    const q = String(filters.q).toLowerCase().trim();
    if (q) {
      list = list.filter(s =>
        (s.name || '').toLowerCase().includes(q) ||
        (s.account_owner?.name || '').toLowerCase().includes(q) ||
        (s.account_owner?.email || '').toLowerCase().includes(q)
      );
    }
  }
  if (filters.school) {
    const sch = String(filters.school).toLowerCase().trim();
    if (sch) list = list.filter(s => (s.school || '').toLowerCase().includes(sch));
  }
  if (filters.status) {
    list = list.filter(s => (s.status || 'Active') === filters.status);
  }
  return list;
}

function getStudent(id) {
  const list = loadStudents();
  return list.find(s => s.id === id) || null;
}

function searchStudents(query, limit = 50) {
  const q = String(query || '').toLowerCase().trim();
  if (!q) return [];
  const list = loadStudents();
  return list
    .filter(s =>
      (s.name || '').toLowerCase().includes(q) ||
      (s.account_owner?.name || '').toLowerCase().includes(q) ||
      (s.account_owner?.email || '').toLowerCase().includes(q)
    )
    .slice(0, limit);
}

function createStudent(data) {
  const students = loadStudents();
  const id = 's_' + String(Date.now()).slice(-8) + Math.random().toString(36).slice(2, 6);
  const student = {
    id,
    name: (data.name || '').trim(),
    gender: (data.gender || '').trim(),
    level: (data.level || '').trim(),
    dob: (data.dob || '').trim(),
    school: (data.school || '').trim(),
    status: data.status || 'Active',
    classes_attended: Array.isArray(data.classes_attended) ? data.classes_attended : [],
    account_owner: data.account_owner || { name: '', email: '', phone: '' },
    guardian_2: data.guardian_2 || { name: '', email: '', phone: '' },
    address: data.address || { street: '', unit: '', city: '', state: '', zip: '' },
    triaz_membership: (data.triaz_membership || '').trim(),
  };
  students.push(student);
  saveStudents(students);
  return student;
}

function updateStudent(id, updateData) {
  const students = loadStudents();
  const idx = students.findIndex(s => s.id === id);
  if (idx < 0) throw new Error('Student not found');
  const allowed = ['name', 'gender', 'level', 'dob', 'school', 'status', 'classes_attended', 'account_owner', 'guardian_2', 'address', 'triaz_membership'];
  const updates = {};
  allowed.forEach(k => { if (updateData[k] !== undefined) updates[k] = updateData[k]; });
  students[idx] = { ...students[idx], ...updates };
  saveStudents(students);
  return students[idx];
}

function deleteStudent(id) {
  const students = loadStudents();
  const idx = students.findIndex(s => s.id === id);
  if (idx < 0) throw new Error('Student not found');
  students.splice(idx, 1);
  saveStudents(students);
  return true;
}

module.exports = {
  load,
  save,
  getSeasons,
  updateSeason,
  getTemplates,
  getInstances,
  getInstance,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  createInstance,
  updateInstance,
  deleteInstance,
  findInstanceByGcalEventId,
  upsertInstanceFromGCal,
  markInstanceCancelled,
  generateInstances,
  getClassesCompat,
  getPrograms,
  createProgram,
  updateProgram,
  deleteProgram,
  reload,
  getStudents,
  getStudent,
  searchStudents,
  createStudent,
  updateStudent,
  deleteStudent,
};
