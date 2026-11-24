const pool = require('./db');

function generateCode(prefix) {
  const year = new Date().getFullYear();
  const num = Math.floor(Math.random() * 999999) + 1;
  return `${prefix}-${year}-${String(num).padStart(6, '0')}`;
}

function slaTargetHours(priority) {
  switch (priority) {
    case 'High': return 24;
    case 'Medium': return 72;
    case 'Low': return 168;
    default: return 72;
  }
}

async function audit(userId, action, entity, entityId = null, details = null) {
  await pool.query(
    'INSERT INTO audit_log (user_id, action, entity, entity_id, details) VALUES (?,?,?,?,?)',
    [userId, action, entity, entityId, details]
  );
}

async function notify(userId, message, link = null) {
  await pool.query(
    'INSERT INTO notifications (user_id, message, link) VALUES (?,?,?)',
    [userId, message, link]
  );
}

function categoryToDepartment(category) {
  const map = {
    plumbing: 'Civil', carpentry: 'Civil', masonry: 'Civil', painting: 'Civil',
    flooring: 'Civil', furniture: 'Civil', sanitary: 'Civil', civil: 'Civil',
    fan: 'Electrical', light: 'Electrical', switch: 'Electrical', wiring: 'Electrical',
    power: 'Electrical', electrical: 'Electrical',
    garden: 'Horticulture', tree: 'Horticulture', lawn: 'Horticulture', horticulture: 'Horticulture',
  };
  const cat = (category || '').toLowerCase();
  let deptName = 'Civil';
  for (const [needle, dept] of Object.entries(map)) {
    if (cat.includes(needle)) { deptName = dept; break; }
  }
  return deptName;
}

async function departmentIdByName(name) {
  const [rows] = await pool.query('SELECT id FROM departments WHERE name = ?', [name]);
  return rows.length ? rows[0].id : 1;
}

module.exports = { generateCode, slaTargetHours, audit, notify, categoryToDepartment, departmentIdByName };
