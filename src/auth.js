const pool = require('./db');
const bcrypt = require('bcryptjs');

async function attempt(email, password) {
  const [rows] = await pool.query('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
  const user = rows[0];
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return null;
  if (!user.is_active) return null;
  delete user.password_hash;
  return user;
}

function dashboardFor(role) {
  switch (role) {
    case 'user': return '/user/dashboard';
    case 'officer': return '/officer/dashboard';
    case 'technician': return '/technician/dashboard';
    case 'store': return '/store/dashboard';
    case 'admin': return '/admin/dashboard';
    default: return '/login';
  }
}

// --- API middleware (JSON 401/403) ---
function requireLogin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated. Please log in.' });
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.user) return res.status(401).json({ error: 'Not authenticated. Please log in.' });
    if (!roles.includes(req.session.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    }
    next();
  };
}

// --- Page middleware (redirects / 403 HTML) ---
function requireLoginPage(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

function requireRolePage(...roles) {
  return (req, res, next) => {
    if (!req.session.user) return res.redirect('/login');
    if (!roles.includes(req.session.user.role)) {
      return res.status(403).send('<h1>403 — Forbidden</h1><p>Your role does not have access to this page.</p><p><a href="/">Back to dashboard</a></p>');
    }
    next();
  };
}

module.exports = { attempt, dashboardFor, requireLogin, requireRole, requireLoginPage, requireRolePage };
