require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
require('express-async-errors'); // lets async route handlers' rejections reach the error middleware below, instead of crashing the process
const session = require('express-session');

const { requireLoginPage, requireRolePage, dashboardFor } = require('./src/auth');

const app = express();

// Ensure uploads dir exists
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 }, // 8 hours
}));

// --------------------------------------------------------------------------
// API routes
// --------------------------------------------------------------------------
app.use('/api/auth', require('./routes/auth'));
app.use('/api/complaints', require('./routes/complaints'));
app.use('/api/workorders', require('./routes/workorders'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/feedback', require('./routes/feedback'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/admin_users', require('./routes/adminUsers'));
app.use('/api/admin_locations', require('./routes/adminLocations'));
app.use('/api/lookups', require('./routes/lookups'));

app.use((req, res, next) => { res.locals.currentPath = req.path; next(); });

// --------------------------------------------------------------------------
// Page routes
// --------------------------------------------------------------------------
app.get('/', (req, res) => {
  res.redirect(req.session.user ? dashboardFor(req.session.user.role) : '/login');
});

app.get('/login', (req, res) => {
  if (req.session.user) return res.redirect(dashboardFor(req.session.user.role));
  res.render('login', { pageTitle: 'Login — GBU-CMS', user: null });
});

app.get('/register', (req, res) => {
  if (req.session.user) return res.redirect(dashboardFor(req.session.user.role));
  res.render('register', { pageTitle: 'Register — GBU-CMS', user: null });
});

// ---- User pages ----
app.get('/user/dashboard', requireRolePage('user'), (req, res) =>
  res.render('user/dashboard', { pageTitle: 'My Dashboard — GBU-CMS', user: req.session.user }));
app.get('/user/complaint_new', requireRolePage('user'), (req, res) =>
  res.render('user/complaint_new', { pageTitle: 'Register Complaint — GBU-CMS', user: req.session.user }));
app.get('/user/complaint_list', requireRolePage('user'), (req, res) =>
  res.render('user/complaint_list', { pageTitle: 'My Complaints — GBU-CMS', user: req.session.user }));
app.get('/user/complaint_detail', requireRolePage('user'), (req, res) =>
  res.render('user/complaint_detail', { pageTitle: 'Complaint Detail — GBU-CMS', user: req.session.user, id: Number(req.query.id || 0) }));

// ---- Officer pages ----
app.get('/officer/dashboard', requireRolePage('officer', 'admin'), (req, res) =>
  res.render('officer/dashboard', { pageTitle: 'Officer Dashboard — GBU-CMS', user: req.session.user }));
app.get('/officer/complaints', requireRolePage('officer', 'admin'), (req, res) =>
  res.render('officer/complaints', { pageTitle: 'Complaints — GBU-CMS', user: req.session.user, initialStatus: req.query.status || '' }));
app.get('/officer/complaint_detail', requireRolePage('officer', 'admin'), (req, res) =>
  res.render('officer/complaint_detail', { pageTitle: 'Review Complaint — GBU-CMS', user: req.session.user, id: Number(req.query.id || 0) }));
app.get('/officer/workorders', requireRolePage('officer', 'admin'), (req, res) =>
  res.render('officer/workorders', { pageTitle: 'Work Orders — GBU-CMS', user: req.session.user }));
app.get('/officer/workorder_detail', requireRolePage('officer', 'admin'), (req, res) =>
  res.render('officer/workorder_detail', { pageTitle: 'Work Order — GBU-CMS', user: req.session.user, id: Number(req.query.id || 0) }));
app.get('/officer/reports', requireRolePage('officer', 'admin', 'store'), (req, res) =>
  res.render('officer/reports', { pageTitle: 'Reports — GBU-CMS', user: req.session.user }));

// ---- Technician pages ----
app.get('/technician/dashboard', requireRolePage('technician'), (req, res) =>
  res.render('technician/dashboard', { pageTitle: 'My Jobs — GBU-CMS', user: req.session.user }));
app.get('/technician/workorder_detail', requireRolePage('technician'), (req, res) =>
  res.render('technician/workorder_detail', { pageTitle: 'Work Order — GBU-CMS', user: req.session.user, id: Number(req.query.id || 0) }));

// ---- Store pages ----
app.get('/store/dashboard', requireRolePage('store', 'admin'), (req, res) =>
  res.render('store/dashboard', { pageTitle: 'Store Dashboard — GBU-CMS', user: req.session.user }));
app.get('/store/inventory', requireRolePage('store', 'admin'), (req, res) =>
  res.render('store/inventory', { pageTitle: 'Inventory — GBU-CMS', user: req.session.user }));

// ---- Admin pages ----
app.get('/admin/dashboard', requireRolePage('admin'), (req, res) =>
  res.render('admin/dashboard', { pageTitle: 'Admin Dashboard — GBU-CMS', user: req.session.user }));
app.get('/admin/users', requireRolePage('admin'), (req, res) =>
  res.render('admin/users', { pageTitle: 'Manage Users — GBU-CMS', user: req.session.user }));
app.get('/admin/locations', requireRolePage('admin'), (req, res) =>
  res.render('admin/locations', { pageTitle: 'Manage Locations — GBU-CMS', user: req.session.user }));
app.get('/admin/inventory', requireRolePage('admin'), (req, res) =>
  res.render('admin/inventory', { pageTitle: 'Inventory — GBU-CMS', user: req.session.user }));

// --------------------------------------------------------------------------
app.use((req, res) => res.status(404).send('<h1>404 — Not Found</h1><p><a href="/">Home</a></p>'));

app.use((err, req, res, next) => {
  console.error(err);
  if (req.path.startsWith('/api/')) return res.status(500).json({ error: err.message || 'Server error.' });
  res.status(500).send('<h1>500 — Server Error</h1><pre>' + (err.message || '') + '</pre>');
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`GBU-CMS (Node) listening on http://localhost:${PORT}`));
