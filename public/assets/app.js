/**
 * Thin fetch wrapper shared by every page. Session cookie carries auth,
 * so every call is same-origin and needs no token handling.
 */
const Api = {
  async get(url) {
    const res = await fetch(url, { credentials: 'same-origin' });
    return Api._handle(res);
  },
  async post(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    return Api._handle(res);
  },
  async postForm(url, formData) {
    const res = await fetch(url, { method: 'POST', credentials: 'same-origin', body: formData });
    return Api._handle(res);
  },
  async _handle(res) {
    let data = null;
    try { data = await res.json(); } catch (e) { /* non-JSON response (e.g. CSV) */ }
    if (!res.ok) {
      const msg = (data && data.error) ? data.error : `Request failed (${res.status})`;
      throw new Error(msg);
    }
    return data;
  },
};

function showAlert(container, message, type = 'danger') {
  container.innerHTML = `<div class="alert alert-${type} py-2 mb-3">${escapeHtml(message)}</div>`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function fmtDate(s) {
  if (!s) return '—';
  return new Date(s.replace(' ', 'T')).toLocaleString();
}

function badge(status) {
  const map = {
    Submitted: 'secondary', Verified: 'info', Invalid: 'dark', WorkOrderCreated: 'primary',
    InProgress: 'primary', CompletedByTechnician: 'warning', Inspected: 'warning',
    Rejected: 'danger', Closed: 'success', Reopened: 'danger',
    Assigned: 'secondary', Started: 'primary',
  };
  const cls = map[status] || 'secondary';
  return `<span class="badge text-bg-${cls}">${escapeHtml(status)}</span>`;
}

function priorityBadge(p) {
  const map = { High: 'danger', Medium: 'warning', Low: 'secondary' };
  return `<span class="badge text-bg-${map[p] || 'secondary'}">${escapeHtml(p)}</span>`;
}

async function logout() {
  await Api.post('/api/auth/logout');
  window.location.href = '/login';
}

// Notification bell — polled every 20s on any logged-in page.
async function refreshNotifications() {
  const bell = document.getElementById('notifBell');
  if (!bell) return;
  try {
    const data = await Api.get('/api/notifications/list');
    const countEl = document.getElementById('notifCount');
    const listEl = document.getElementById('notifList');
    if (countEl) countEl.textContent = data.unread > 0 ? data.unread : '';
    if (countEl) countEl.style.display = data.unread > 0 ? 'inline-block' : 'none';
    if (listEl) {
      listEl.innerHTML = data.notifications.length
        ? data.notifications.map(n => `<li><a class="dropdown-item small ${n.is_read ? '' : 'fw-bold'}" href="${n.link || '#'}">${escapeHtml(n.message)}<br><span class="text-muted">${fmtDate(n.created_at)}</span></a></li>`).join('')
        : '<li><span class="dropdown-item small text-muted">No notifications</span></li>';
    }
  } catch (e) { /* ignore polling errors */ }
}

document.addEventListener('DOMContentLoaded', () => {
  refreshNotifications();
  setInterval(refreshNotifications, 20000);
  const bell = document.getElementById('notifBell');
  if (bell) {
    bell.addEventListener('click', () => Api.post('/api/notifications/mark_read').then(refreshNotifications));
  }
});
