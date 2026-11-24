const express = require('express');
const pool = require('../src/db');
const { requireLogin } = require('../src/auth');

const router = express.Router();

router.get('/list', requireLogin, async (req, res) => {
  const user = req.session.user;
  const [rows] = await pool.query(
    'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 30', [user.id]
  );
  const unread = rows.filter((n) => !n.is_read).length;
  res.json({ notifications: rows, unread });
});

router.post('/mark_read', requireLogin, async (req, res) => {
  await pool.query('UPDATE notifications SET is_read = true WHERE user_id = ?', [req.session.user.id]);
  res.json({ ok: true });
});

module.exports = router;
