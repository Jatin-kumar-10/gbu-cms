const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../src/db');
const { attempt, dashboardFor } = require('../src/auth');
const { audit } = require('../src/helpers');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(422).json({ error: 'Email and password are required.' });
  const user = await attempt(email.trim(), password);
  if (!user) return res.status(401).json({ error: 'Invalid credentials or inactive account.' });
  req.session.user = user;
  await audit(user.id, 'login', 'user', user.id);
  res.json({ user, redirect: dashboardFor(user.role) });
});

router.post('/logout', async (req, res) => {
  const user = req.session.user;
  if (user) await audit(user.id, 'logout', 'user', user.id);
  req.session.destroy(() => res.json({ ok: true }));
});

router.post('/register', async (req, res) => {
  const name = (req.body.name || '').trim();
  const email = (req.body.email || '').trim();
  const password = req.body.password || '';
  if (!name || !email || password.length < 6) {
    return res.status(422).json({ error: 'Name, email and a password of at least 6 characters are required.' });
  }
  const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
  if (existing.length) return res.status(409).json({ error: 'An account with this email already exists.' });

  const hash = await bcrypt.hash(password, 10);
  const [result] = await pool.query(
    "INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,'user')",
    [name, email, hash]
  );
  await audit(result.insertId, 'register', 'user', result.insertId);
  res.status(201).json({ ok: true, id: result.insertId });
});

router.get('/me', (req, res) => {
  res.json({ user: req.session.user || null });
});

module.exports = router;
