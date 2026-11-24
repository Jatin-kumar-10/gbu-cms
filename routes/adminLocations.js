const express = require('express');
const pool = require('../src/db');
const { requireLogin, requireRole } = require('../src/auth');
const { audit } = require('../src/helpers');

const router = express.Router();
router.use(requireLogin); // reads open to all logged-in roles; writes re-checked per route

router.get('/buildings', async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM buildings ORDER BY name');
  res.json({ buildings: rows });
});

router.get('/rooms', async (req, res) => {
  const buildingId = Number(req.query.building_id || 0);
  let rows;
  if (buildingId) {
    [rows] = await pool.query('SELECT * FROM rooms WHERE building_id = ? ORDER BY name', [buildingId]);
  } else {
    [rows] = await pool.query(
      'SELECT r.*, b.name AS building_name FROM rooms r JOIN buildings b ON b.id=r.building_id ORDER BY b.name, r.name'
    );
  }
  res.json({ rooms: rows });
});

router.post('/add_building', requireRole('admin'), async (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(422).json({ error: 'Building name is required.' });
  const [result] = await pool.query('INSERT INTO buildings (name) VALUES (?)', [name]);
  await audit(req.session.user.id, 'create', 'building', result.insertId, name);
  res.status(201).json({ ok: true, id: result.insertId });
});

router.post('/add_room', requireRole('admin'), async (req, res) => {
  const buildingId = Number(req.body.building_id || 0);
  const name = (req.body.name || '').trim();
  if (!buildingId || !name) return res.status(422).json({ error: 'Building and room name are required.' });
  const [result] = await pool.query('INSERT INTO rooms (building_id, name) VALUES (?,?)', [buildingId, name]);
  await audit(req.session.user.id, 'create', 'room', result.insertId, name);
  res.status(201).json({ ok: true, id: result.insertId });
});

module.exports = router;
