const express = require('express');
const pool = require('../src/db');
const { requireLogin } = require('../src/auth');

const router = express.Router();
router.use(requireLogin);

router.get('/departments', async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM departments ORDER BY name');
  res.json({ departments: rows });
});

router.get('/technicians', async (req, res) => {
  const departmentId = Number(req.query.department_id || 0);
  const [rows] = await pool.query(
    "SELECT id, name FROM users WHERE role='technician' AND is_active=true AND department_id = ? ORDER BY name",
    [departmentId]
  );
  res.json({ technicians: rows });
});

router.get('/inventory_items', async (req, res) => {
  const [rows] = await pool.query('SELECT id, name, unit, quantity_on_hand FROM inventory_items ORDER BY name');
  res.json({ items: rows });
});

module.exports = router;
