const express = require('express');
const pool = require('../src/db');
const { requireRole } = require('../src/auth');
const { audit } = require('../src/helpers');

const router = express.Router();

router.post('/submit', requireRole('user'), async (req, res) => {
  const user = req.session.user;
  const complaintId = Number(req.body.complaint_id || 0);
  const rating = Number(req.body.rating || 0);
  const comment = (req.body.comment || '').trim();

  if (rating < 1 || rating > 5) return res.status(422).json({ error: 'Rating must be between 1 and 5.' });

  const [rows] = await pool.query('SELECT * FROM complaints WHERE id = ?', [complaintId]);
  const complaint = rows[0];
  if (!complaint || complaint.user_id !== user.id) return res.status(404).json({ error: 'Complaint not found.' });
  if (complaint.status !== 'Closed') {
    return res.status(409).json({ error: 'Feedback can only be submitted once the complaint is Closed.' });
  }

  await pool.query('INSERT INTO feedback (complaint_id, rating, comment) VALUES (?,?,?)', [complaintId, rating, comment]);
  await audit(user.id, 'feedback', 'complaint', complaintId, `rating=${rating}`);

  res.status(201).json({ ok: true });
});

module.exports = router;
