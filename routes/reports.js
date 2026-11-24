const express = require('express');
const { Parser } = require('./_csv');
const pool = require('../src/db');
const { requireRole } = require('../src/auth');

const router = express.Router();

router.get('/summary', requireRole('officer', 'admin', 'store'), async (req, res) => {
  const user = req.session.user;

  // COUNT(*) comes back as a string from Postgres (bigint precision safety) — normalize to a number.
  const [byStatusRaw] = await pool.query('SELECT status, COUNT(*) AS total FROM complaints GROUP BY status');
  const byStatus = byStatusRaw.map((r) => ({ ...r, total: Number(r.total) }));

  let byDeptSql = 'SELECT d.name AS department, COUNT(*) AS total FROM complaints c JOIN departments d ON d.id=c.department_id';
  const params = [];
  if (user.role === 'officer') { byDeptSql += ' WHERE c.department_id = ?'; params.push(user.department_id); }
  byDeptSql += ' GROUP BY d.name';
  const [byDepartmentRaw] = await pool.query(byDeptSql, params);
  const byDepartment = byDepartmentRaw.map((r) => ({ ...r, total: Number(r.total) }));

  const [slaRows] = await pool.query(
    `SELECT complaint_code, priority, status, created_at, sla_target_hours,
            EXTRACT(EPOCH FROM (COALESCE(closed_at, NOW()) - created_at)) / 3600 AS hours_elapsed
     FROM complaints
     WHERE status NOT IN ('Closed','Invalid')
     ORDER BY created_at ASC`
  );
  const breaches = slaRows.filter((r) => Number(r.hours_elapsed) > Number(r.sla_target_hours)).length;

  const [inventoryLow] = await pool.query(
    'SELECT name, quantity_on_hand, unit, low_stock_threshold FROM inventory_items WHERE quantity_on_hand <= low_stock_threshold'
  );

  const [[{ avg_hours: avgResolutionHours }]] = await pool.query(
    `SELECT AVG(EXTRACT(EPOCH FROM (closed_at - created_at)) / 3600) AS avg_hours
     FROM complaints WHERE status = 'Closed'`
  );

  res.json({
    by_status: byStatus,
    by_department: byDepartment,
    sla_breaches: breaches,
    open_tracked: slaRows.length,
    low_stock_items: inventoryLow,
    avg_resolution_hours: avgResolutionHours !== null ? Math.round(Number(avgResolutionHours) * 10) / 10 : null,
  });
});

router.get('/export_csv', requireRole('officer', 'admin', 'store'), async (req, res) => {
  const [rows] = await pool.query(
    `SELECT c.complaint_code, d.name AS department, c.category, c.priority, c.status,
            c.created_at, c.closed_at
     FROM complaints c JOIN departments d ON d.id = c.department_id
     ORDER BY c.created_at DESC`
  );
  const fmt = (d) => (d ? new Date(d).toISOString().slice(0, 19).replace('T', ' ') : '');
  const header = ['Complaint Code', 'Department', 'Category', 'Priority', 'Status', 'Created At', 'Closed At'];
  const csv = new Parser().toCsv(header, rows.map((r) => [
    r.complaint_code, r.department, r.category, r.priority, r.status, fmt(r.created_at), fmt(r.closed_at),
  ]));
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="gbu_cms_complaints.csv"');
  res.send(csv);
});

module.exports = router;
