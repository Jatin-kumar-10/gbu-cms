const express = require('express');
const pool = require('../src/db');
const { requireLogin, requireRole } = require('../src/auth');
const { audit, notify } = require('../src/helpers');

const router = express.Router();

router.get('/items', requireLogin, async (req, res) => {
  const [rows] = await pool.query(
    'SELECT *, (quantity_on_hand <= low_stock_threshold) AS low_stock FROM inventory_items ORDER BY name'
  );
  res.json({ items: rows });
});

router.get('/requests', requireLogin, async (req, res) => {
  const where = [];
  const params = [];
  if (req.query.status) { where.push('mi.status = ?'); params.push(req.query.status); }
  if (req.query.work_order_id) { where.push('mi.work_order_id = ?'); params.push(req.query.work_order_id); }

  let sql = `SELECT mi.*, i.name AS item_name, i.unit, wo.wo_code, c.complaint_code
             FROM material_issues mi
             JOIN inventory_items i ON i.id = mi.item_id
             JOIN work_orders wo ON wo.id = mi.work_order_id
             JOIN complaints c ON c.id = wo.complaint_id`;
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY mi.created_at DESC';

  const [rows] = await pool.query(sql, params);
  res.json({ requests: rows });
});

router.post('/request', requireRole('technician'), async (req, res) => {
  const tech = req.session.user;
  const woId = Number(req.body.work_order_id || 0);
  const itemId = Number(req.body.item_id || 0);
  const qty = Number(req.body.quantity || 0);
  if (qty <= 0) return res.status(422).json({ error: 'Quantity must be greater than zero.' });

  const [woRows] = await pool.query('SELECT * FROM work_orders WHERE id = ? AND technician_id = ?', [woId, tech.id]);
  const wo = woRows[0];
  if (!wo) return res.status(404).json({ error: 'Work order not found or not assigned to you.' });

  const [itemRows] = await pool.query('SELECT * FROM inventory_items WHERE id = ?', [itemId]);
  if (!itemRows.length) return res.status(422).json({ error: 'Invalid inventory item.' });

  const [result] = await pool.query(
    "INSERT INTO material_issues (work_order_id, item_id, quantity_requested, status, requested_by) VALUES (?,?,?,'Requested',?)",
    [woId, itemId, qty, tech.id]
  );
  const id = result.insertId;
  await audit(tech.id, 'request_material', 'material_issue', id);

  const [stores] = await pool.query("SELECT id FROM users WHERE role = 'store'");
  for (const s of stores) await notify(s.id, `Material request for work order ${wo.wo_code} awaiting issue.`, '/store/inventory');

  res.status(201).json({ ok: true, id });
});

router.post('/issue', requireRole('store', 'admin'), async (req, res) => {
  const store = req.session.user;
  const id = Number(req.query.id || 0);
  let qty = Number(req.body.quantity || 0);

  const conn = await pool.getConnection();
  let mi, item;
  try {
    await conn.beginTransaction();
    const [miRows] = await conn.query('SELECT * FROM material_issues WHERE id = ? FOR UPDATE', [id]);
    mi = miRows[0];
    if (!mi) throw new Error('Material request not found.');
    if (mi.status !== 'Requested') throw new Error('Only a Requested item can be issued.');
    if (qty <= 0) qty = Number(mi.quantity_requested);

    const [itemRows] = await conn.query('SELECT * FROM inventory_items WHERE id = ? FOR UPDATE', [mi.item_id]);
    item = itemRows[0];
    if (Number(item.quantity_on_hand) < qty) throw new Error('Insufficient stock on hand.');

    await conn.query('UPDATE inventory_items SET quantity_on_hand = quantity_on_hand - ? WHERE id = ?', [qty, item.id]);
    await conn.query(
      "UPDATE material_issues SET quantity_issued = ?, status='Issued', issued_by=?, issued_at=NOW() WHERE id = ?",
      [qty, store.id, id]
    );
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    conn.release();
    return res.status(409).json({ error: e.message });
  }
  conn.release();

  await audit(store.id, 'issue_material', 'material_issue', id, `qty=${qty}`);

  const [[updatedItem]] = await pool.query('SELECT * FROM inventory_items WHERE id = ?', [mi.item_id]);
  if (Number(updatedItem.quantity_on_hand) <= Number(updatedItem.low_stock_threshold)) {
    const [admins] = await pool.query("SELECT id FROM users WHERE role = 'admin'");
    for (const a of admins) {
      await notify(a.id, `Low stock alert: ${updatedItem.name} (${updatedItem.quantity_on_hand} ${updatedItem.unit} left).`, '/admin/inventory');
    }
  }

  await notify(mi.requested_by, 'Material issued for your work order request.', `/technician/workorder_detail?id=${mi.work_order_id}`);

  res.json({ ok: true, quantity_issued: qty });
});

router.post('/consume', requireRole('technician'), async (req, res) => {
  const tech = req.session.user;
  const id = Number(req.query.id || 0);
  const qty = Number(req.body.quantity || 0);

  const [miRows] = await pool.query('SELECT * FROM material_issues WHERE id = ?', [id]);
  const mi = miRows[0];
  if (!mi) return res.status(404).json({ error: 'Material request not found.' });
  if (mi.status !== 'Issued') return res.status(409).json({ error: 'Only Issued material can be recorded as consumed.' });
  if (mi.requested_by !== tech.id) return res.status(403).json({ error: 'This material request was not raised by you.' });
  if (qty <= 0 || qty > Number(mi.quantity_issued)) {
    return res.status(422).json({ error: 'Consumed quantity must be between 0 and the quantity issued.' });
  }

  await pool.query("UPDATE material_issues SET quantity_consumed = ?, status='Consumed' WHERE id = ?", [qty, id]);
  await audit(tech.id, 'consume_material', 'material_issue', id, `qty=${qty}`);

  res.json({ ok: true });
});

module.exports = router;
