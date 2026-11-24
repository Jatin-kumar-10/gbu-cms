const express = require('express');
const pool = require('../src/db');
const { requireLogin, requireRole } = require('../src/auth');
const { generateCode, slaTargetHours, audit, notify, categoryToDepartment, departmentIdByName } = require('../src/helpers');
const { upload, uploadedPath } = require('../src/upload');

const router = express.Router();

async function fetchComplaintOr404(id, res) {
  const [rows] = await pool.query('SELECT * FROM complaints WHERE id = ?', [id]);
  if (!rows.length) { res.status(404).json({ error: 'Complaint not found.' }); return null; }
  return rows[0];
}

// GET list (filterable)
router.get('/list', requireLogin, async (req, res) => {
  const user = req.session.user;
  const where = [];
  const params = [];

  if (user.role === 'user') { where.push('c.user_id = ?'); params.push(user.id); }
  else if (user.role === 'officer') { where.push('c.department_id = ?'); params.push(user.department_id); }

  if (req.query.status) { where.push('c.status = ?'); params.push(req.query.status); }
  if (req.query.department_id) { where.push('c.department_id = ?'); params.push(req.query.department_id); }

  let sql = `SELECT c.*, u.name AS user_name, d.name AS department_name,
                    b.name AS building_name, r.name AS room_name
             FROM complaints c
             JOIN users u ON u.id = c.user_id
             JOIN departments d ON d.id = c.department_id
             JOIN rooms r ON r.id = c.room_id
             JOIN buildings b ON b.id = r.building_id`;
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY c.created_at DESC';

  const [rows] = await pool.query(sql, params);
  res.json({ complaints: rows });
});

// GET detail
router.get('/detail', requireLogin, async (req, res) => {
  const user = req.session.user;
  const id = Number(req.query.id || 0);
  const [rows] = await pool.query(
    `SELECT c.*, u.name AS user_name, u.email AS user_email, d.name AS department_name,
            b.name AS building_name, r.name AS room_name
     FROM complaints c
     JOIN users u ON u.id = c.user_id
     JOIN departments d ON d.id = c.department_id
     JOIN rooms r ON r.id = c.room_id
     JOIN buildings b ON b.id = r.building_id
     WHERE c.id = ?`, [id]
  );
  const complaint = rows[0];
  if (!complaint) return res.status(404).json({ error: 'Complaint not found.' });
  if (user.role === 'user' && complaint.user_id !== user.id) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  const [workOrders] = await pool.query(
    `SELECT wo.*, t.name AS technician_name FROM work_orders wo
     LEFT JOIN users t ON t.id = wo.technician_id
     WHERE wo.complaint_id = ? ORDER BY wo.created_at DESC`, [id]
  );
  complaint.work_orders = workOrders;

  const [feedback] = await pool.query('SELECT * FROM feedback WHERE complaint_id = ? ORDER BY created_at DESC', [id]);
  complaint.feedback = feedback;

  res.json({ complaint });
});

// POST create (multipart form with optional photo)
router.post('/create', requireRole('user'), upload.single('photo'), async (req, res) => {
  const user = req.session.user;
  const roomId = Number(req.body.room_id || 0);
  const category = (req.body.category || '').trim();
  const description = (req.body.description || '').trim();
  const priorityIn = req.body.priority || 'Medium';

  if (!roomId || !category || !description) {
    return res.status(422).json({ error: 'Room, category and description are required.' });
  }
  const [roomRows] = await pool.query('SELECT building_id FROM rooms WHERE id = ?', [roomId]);
  if (!roomRows.length) return res.status(422).json({ error: 'Invalid room.' });

  const deptName = categoryToDepartment(category);
  const departmentId = await departmentIdByName(deptName);
  const photoPath = uploadedPath(req.file);
  const code = generateCode('CMP');
  const priority = ['Low', 'Medium', 'High'].includes(priorityIn) ? priorityIn : 'Medium';

  const [result] = await pool.query(
    `INSERT INTO complaints (complaint_code, user_id, room_id, department_id, category, description,
                              photo_path, priority, status, sla_target_hours)
     VALUES (?,?,?,?,?,?,?,?,'Submitted',?)`,
    [code, user.id, roomId, departmentId, category, description, photoPath, priority, slaTargetHours(priority)]
  );
  const id = result.insertId;
  await audit(user.id, 'create', 'complaint', id, code);

  const [officers] = await pool.query("SELECT id FROM users WHERE role = 'officer' AND department_id = ?", [departmentId]);
  for (const o of officers) await notify(o.id, `New complaint ${code} awaiting verification.`, '/officer/complaints');

  res.status(201).json({ ok: true, id, complaint_code: code });
});

// POST verify
router.post('/verify', requireRole('officer', 'admin'), async (req, res) => {
  const officer = req.session.user;
  const id = Number(req.query.id || 0);
  const complaint = await fetchComplaintOr404(id, res);
  if (!complaint) return;
  if (complaint.status !== 'Submitted') {
    return res.status(409).json({ error: 'Only complaints in Submitted status can be verified.' });
  }

  const departmentId = Number(req.body.department_id || complaint.department_id);
  const category = (req.body.category || complaint.category).trim();
  const priority = ['Low', 'Medium', 'High'].includes(req.body.priority) ? req.body.priority : complaint.priority;

  await pool.query(
    `UPDATE complaints SET department_id=?, category=?, priority=?, sla_target_hours=?,
                            status='Verified', verified_at = NOW() WHERE id = ?`,
    [departmentId, category, priority, slaTargetHours(priority), id]
  );
  await audit(officer.id, 'verify', 'complaint', id);
  await notify(complaint.user_id, `Your complaint ${complaint.complaint_code} has been verified.`, `/user/complaint_detail?id=${id}`);

  res.json({ ok: true });
});

// POST invalid
router.post('/invalid', requireRole('officer', 'admin'), async (req, res) => {
  const officer = req.session.user;
  const id = Number(req.query.id || 0);
  const reason = (req.body.reason || '').trim();
  if (!reason) return res.status(422).json({ error: 'A reason is required to mark a complaint invalid/duplicate.' });

  const complaint = await fetchComplaintOr404(id, res);
  if (!complaint) return;
  if (complaint.status !== 'Submitted') {
    return res.status(409).json({ error: 'Only complaints in Submitted status can be marked invalid.' });
  }
  await pool.query("UPDATE complaints SET status='Invalid', invalid_reason=? WHERE id=?", [reason, id]);
  await audit(officer.id, 'mark_invalid', 'complaint', id, reason);
  await notify(complaint.user_id, `Your complaint ${complaint.complaint_code} was marked invalid/duplicate: ${reason}`, `/user/complaint_detail?id=${id}`);

  res.json({ ok: true });
});

// POST reopen
router.post('/reopen', requireRole('user', 'officer', 'admin'), async (req, res) => {
  const user = req.session.user;
  const id = Number(req.query.id || 0);
  const complaint = await fetchComplaintOr404(id, res);
  if (!complaint) return;

  if (user.role === 'user' && complaint.user_id !== user.id) {
    return res.status(403).json({ error: 'Forbidden.' });
  }
  if (complaint.status !== 'Closed') {
    return res.status(409).json({ error: 'Only closed complaints can be reopened.' });
  }
  const windowDays = 7;
  if (complaint.closed_at && (Date.now() - new Date(complaint.closed_at).getTime()) > windowDays * 86400000) {
    return res.status(409).json({ error: `Reopen window of ${windowDays} days has passed.` });
  }

  await pool.query("UPDATE complaints SET status='Reopened', reopen_count = reopen_count + 1 WHERE id=?", [id]);
  await audit(user.id, 'reopen', 'complaint', id);

  const [officers] = await pool.query("SELECT id FROM users WHERE role='officer' AND department_id=?", [complaint.department_id]);
  for (const o of officers) await notify(o.id, `Complaint ${complaint.complaint_code} was reopened by the user.`, '/officer/complaints');

  res.json({ ok: true });
});

module.exports = router;
