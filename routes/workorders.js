const express = require('express');
const pool = require('../src/db');
const { requireLogin, requireRole } = require('../src/auth');
const { generateCode, audit, notify } = require('../src/helpers');
const { upload, uploadedPath } = require('../src/upload');

const router = express.Router();

async function fetchWoOr404(id, res) {
  const [rows] = await pool.query('SELECT * FROM work_orders WHERE id = ?', [id]);
  if (!rows.length) { res.status(404).json({ error: 'Work order not found.' }); return null; }
  return rows[0];
}

router.get('/list', requireLogin, async (req, res) => {
  const user = req.session.user;
  const where = [];
  const params = [];

  if (user.role === 'technician') { where.push('wo.technician_id = ?'); params.push(user.id); }
  else if (user.role === 'officer') { where.push('c.department_id = ?'); params.push(user.department_id); }
  if (req.query.status) { where.push('wo.status = ?'); params.push(req.query.status); }

  let sql = `SELECT wo.*, c.complaint_code, c.category, c.description, c.priority,
                    c.department_id, d.name AS department_name,
                    b.name AS building_name, r.name AS room_name,
                    t.name AS technician_name
             FROM work_orders wo
             JOIN complaints c ON c.id = wo.complaint_id
             JOIN departments d ON d.id = c.department_id
             JOIN rooms r ON r.id = c.room_id
             JOIN buildings b ON b.id = r.building_id
             LEFT JOIN users t ON t.id = wo.technician_id`;
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY wo.created_at DESC';

  const [rows] = await pool.query(sql, params);
  res.json({ work_orders: rows });
});

router.get('/detail', requireLogin, async (req, res) => {
  const id = Number(req.query.id || 0);
  const [rows] = await pool.query(
    `SELECT wo.*, c.complaint_code, c.category, c.description, c.priority, c.user_id, c.department_id,
            d.name AS department_name, b.name AS building_name, r.name AS room_name,
            t.name AS technician_name
     FROM work_orders wo
     JOIN complaints c ON c.id = wo.complaint_id
     JOIN departments d ON d.id = c.department_id
     JOIN rooms r ON r.id = c.room_id
     JOIN buildings b ON b.id = r.building_id
     LEFT JOIN users t ON t.id = wo.technician_id
     WHERE wo.id = ?`, [id]
  );
  const wo = rows[0];
  if (!wo) return res.status(404).json({ error: 'Work order not found.' });

  const [materials] = await pool.query(
    `SELECT mi.*, i.name AS item_name, i.unit FROM material_issues mi
     JOIN inventory_items i ON i.id = mi.item_id WHERE mi.work_order_id = ? ORDER BY mi.created_at`, [id]
  );
  wo.materials = materials;
  res.json({ work_order: wo });
});

router.post('/create', requireRole('officer', 'admin'), async (req, res) => {
  const officer = req.session.user;
  const complaintId = Number(req.body.complaint_id || 0);
  const technicianId = Number(req.body.technician_id || 0);

  const [cRows] = await pool.query('SELECT * FROM complaints WHERE id = ?', [complaintId]);
  const complaint = cRows[0];
  if (!complaint) return res.status(404).json({ error: 'Complaint not found.' });
  if (!['Verified', 'Reopened'].includes(complaint.status)) {
    return res.status(409).json({ error: 'A work order can only be created from a Verified or Reopened complaint.' });
  }

  const [tRows] = await pool.query("SELECT * FROM users WHERE id = ? AND role = 'technician' AND is_active = true", [technicianId]);
  const tech = tRows[0];
  if (!tech) return res.status(422).json({ error: 'Invalid or inactive technician.' });
  if (tech.department_id !== complaint.department_id) {
    return res.status(422).json({ error: "Technician does not belong to the complaint's department." });
  }

  const code = generateCode('WO');
  const [result] = await pool.query(
    "INSERT INTO work_orders (wo_code, complaint_id, technician_id, status) VALUES (?,?,?,'Assigned')",
    [code, complaintId, technicianId]
  );
  const woId = result.insertId;

  await pool.query("UPDATE complaints SET status='WorkOrderCreated' WHERE id=?", [complaintId]);
  await audit(officer.id, 'create', 'work_order', woId, code);
  await notify(technicianId, `New work order ${code} assigned to you.`, `/technician/workorder_detail?id=${woId}`);
  await notify(complaint.user_id, `A technician has been assigned to your complaint ${complaint.complaint_code}.`, `/user/complaint_detail?id=${complaintId}`);

  res.status(201).json({ ok: true, id: woId, wo_code: code });
});

router.post('/start', requireRole('technician'), upload.single('before_photo'), async (req, res) => {
  const tech = req.session.user;
  const id = Number(req.query.id || 0);
  const wo = await fetchWoOr404(id, res);
  if (!wo) return;
  if (wo.technician_id !== tech.id) return res.status(403).json({ error: 'This work order is not assigned to you.' });
  if (wo.status !== 'Assigned') return res.status(409).json({ error: 'Only an Assigned work order can be started.' });

  const beforePhoto = uploadedPath(req.file);
  await pool.query("UPDATE work_orders SET status='Started', before_photo_path=? WHERE id=?", [beforePhoto, id]);
  await pool.query("UPDATE complaints SET status='InProgress' WHERE id=?", [wo.complaint_id]);
  await audit(tech.id, 'start', 'work_order', id);

  res.json({ ok: true });
});

router.post('/progress', requireRole('technician'), async (req, res) => {
  const tech = req.session.user;
  const id = Number(req.query.id || 0);
  const wo = await fetchWoOr404(id, res);
  if (!wo) return;
  if (wo.technician_id !== tech.id) return res.status(403).json({ error: 'This work order is not assigned to you.' });
  if (!['Started', 'InProgress'].includes(wo.status)) {
    return res.status(409).json({ error: 'Work order is not in a startable state.' });
  }
  await pool.query("UPDATE work_orders SET status='InProgress' WHERE id=?", [id]);
  await audit(tech.id, 'progress', 'work_order', id);
  res.json({ ok: true });
});

router.post('/complete', requireRole('technician'), upload.single('after_photo'), async (req, res) => {
  const tech = req.session.user;
  const id = Number(req.query.id || 0);
  const wo = await fetchWoOr404(id, res);
  if (!wo) return;
  if (wo.technician_id !== tech.id) return res.status(403).json({ error: 'This work order is not assigned to you.' });
  if (!['Started', 'InProgress'].includes(wo.status)) {
    return res.status(409).json({ error: 'Work order must be Started/InProgress before it can be completed.' });
  }

  const afterPhoto = uploadedPath(req.file);
  await pool.query("UPDATE work_orders SET status='Completed', after_photo_path=?, completed_at=NOW() WHERE id=?", [afterPhoto, id]);
  await pool.query("UPDATE complaints SET status='CompletedByTechnician' WHERE id=?", [wo.complaint_id]);
  await audit(tech.id, 'complete', 'work_order', id);

  const [[{ department_id: deptId }]] = await pool.query('SELECT department_id FROM complaints WHERE id=?', [wo.complaint_id]);
  const [officers] = await pool.query("SELECT id FROM users WHERE role='officer' AND department_id=?", [deptId]);
  for (const o of officers) await notify(o.id, `Work order ${wo.wo_code} completed — ready for inspection.`, `/officer/workorder_detail?id=${id}`);

  res.json({ ok: true });
});

router.post('/inspect', requireRole('officer', 'admin'), async (req, res) => {
  const officer = req.session.user;
  const id = Number(req.query.id || 0);
  const decision = req.body.decision;
  const note = (req.body.note || '').trim();

  const wo = await fetchWoOr404(id, res);
  if (!wo) return;
  if (wo.status !== 'Completed') return res.status(409).json({ error: 'Only a Completed work order can be inspected.' });

  if (decision === 'close') {
    await pool.query("UPDATE work_orders SET status='Closed', inspection_note=? WHERE id=?", [note, id]);
    await pool.query("UPDATE complaints SET status='Closed', closed_at=NOW() WHERE id=?", [wo.complaint_id]);
    await audit(officer.id, 'inspect_close', 'work_order', id, note);

    const [[c]] = await pool.query('SELECT user_id, complaint_code FROM complaints WHERE id=?', [wo.complaint_id]);
    await notify(c.user_id, `Your complaint ${c.complaint_code} has been closed. Please share your feedback.`, `/user/complaint_detail?id=${wo.complaint_id}`);
    return res.json({ ok: true, status: 'Closed' });
  }

  if (decision === 'reject') {
    if (!note) return res.status(422).json({ error: 'A note is required when rejecting work for rework.' });
    await pool.query("UPDATE work_orders SET status='Assigned', inspection_note=? WHERE id=?", [note, id]);
    await pool.query("UPDATE complaints SET status='InProgress' WHERE id=?", [wo.complaint_id]);
    await audit(officer.id, 'inspect_reject', 'work_order', id, note);
    await notify(wo.technician_id, `Work order ${wo.wo_code} was rejected at inspection: ${note}`, `/technician/workorder_detail?id=${id}`);
    return res.json({ ok: true, status: 'Assigned' });
  }

  res.status(422).json({ error: 'Decision must be "close" or "reject".' });
});

module.exports = router;
