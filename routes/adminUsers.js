const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../src/db');
const { requireRole } = require('../src/auth');
const { audit } = require('../src/helpers');

const router = express.Router();
router.use(requireRole('admin'));

router.get('/list', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT u.id, u.name, u.email, u.role, u.department_id, d.name AS department_name, u.is_active, u.created_at
     FROM users u LEFT JOIN departments d ON d.id = u.department_id ORDER BY u.created_at DESC`
  );
  res.json({ users: rows });
});

router.post('/create', async (req, res) => {
  const name = (req.body.name || '').trim();
  const email = (req.body.email || '').trim();
  const role = req.body.role;
  const departmentId = req.body.department_id || null;
  const password = req.body.password || '';

  const validRoles = ['user', 'officer', 'technician', 'store', 'admin'];
  if (!name || !email || !validRoles.includes(role) || password.length < 6) {
    return res.status(422).json({ error: 'Name, email, a valid role and a password of at least 6 characters are required.' });
  }
  if (['officer', 'technician'].includes(role) && !departmentId) {
    return res.status(422).json({ error: 'Officer and Technician accounts must have a department.' });
  }

  const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
  if (existing.length) return res.status(409).json({ error: 'A user with this email already exists.' });

  const hash = await bcrypt.hash(password, 10);
  const [result] = await pool.query(
    'INSERT INTO users (name, email, password_hash, role, department_id) VALUES (?,?,?,?,?)',
    [name, email, hash, role, departmentId]
  );
  await audit(req.session.user.id, 'create', 'user', result.insertId, role);

  res.status(201).json({ ok: true, id: result.insertId });
});

router.post('/toggle_active', async (req, res) => {
  const id = Number(req.query.id || 0);
  await pool.query('UPDATE users SET is_active = NOT is_active WHERE id = ?', [id]);
  await audit(req.session.user.id, 'toggle_active', 'user', id);
  res.json({ ok: true });
});

module.exports = router;
