/* ═══════════════════════════════════════════════════════════════════════════
   SIH 2026 — ADMIN PANEL LOGIC
   ═══════════════════════════════════════════════════════════════════════════ */

let adminToken = sessionStorage.getItem('adminToken') || '';
let searchTimeout = null;

// Auto-login if token exists
document.addEventListener('DOMContentLoaded', () => {
  if (adminToken) {
    showDashboard();
  }

  // Enter key on password field
  document.getElementById('admin-password').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') adminLogin();
  });
});

// ─── Login ───────────────────────────────────────────────────────────────────

async function adminLogin() {
  const password = document.getElementById('admin-password').value;
  const errorEl = document.getElementById('admin-password-error');

  if (!password) {
    errorEl.textContent = 'Password is required';
    errorEl.classList.add('visible');
    document.getElementById('admin-password').classList.add('error');
    return;
  }

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });

    const data = await res.json();

    if (!res.ok) {
      errorEl.textContent = data.error || 'Invalid password';
      errorEl.classList.add('visible');
      document.getElementById('admin-password').classList.add('error');
      return;
    }

    adminToken = data.token;
    sessionStorage.setItem('adminToken', adminToken);
    showDashboard();
  } catch (err) {
    errorEl.textContent = 'Connection error. Please try again.';
    errorEl.classList.add('visible');
  }
}

function adminLogout() {
  adminToken = '';
  sessionStorage.removeItem('adminToken');
  document.getElementById('admin-password').value = '';
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('admin-login-screen').classList.add('active');
}

function showDashboard() {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('admin-dashboard-screen').classList.add('active');
  loadStats();
  loadTeams();
}

// ─── API Helper ──────────────────────────────────────────────────────────────

async function adminFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'X-Admin-Token': adminToken
    }
  });

  if (res.status === 401) {
    adminLogout();
    throw new Error('Session expired. Please login again.');
  }

  return res;
}

// ─── Stats ───────────────────────────────────────────────────────────────────

async function loadStats() {
  try {
    const res = await adminFetch('/api/admin/stats');
    const stats = await res.json();

    document.getElementById('stat-teams').textContent = stats.totalTeams;
    document.getElementById('stat-students').textContent = stats.totalStudents;
    document.getElementById('stat-today').textContent = stats.todayRegistrations;
    document.getElementById('stat-field').textContent = stats.mostSelectedField;
  } catch (err) {
    console.error('Failed to load stats:', err);
  }
}

// ─── Teams List ──────────────────────────────────────────────────────────────

async function loadTeams() {
  const search = document.getElementById('admin-search-input').value;
  const department = document.getElementById('filter-dept').value;
  const year = document.getElementById('filter-year').value;
  const solutionField = document.getElementById('filter-field').value;

  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (department) params.set('department', department);
  if (year) params.set('year', year);
  if (solutionField) params.set('solutionField', solutionField);

  try {
    const res = await adminFetch(`/api/admin/teams?${params}`);
    const teams = await res.json();

    const container = document.getElementById('admin-teams-list');

    if (teams.length === 0) {
      container.innerHTML = '<div class="admin-no-teams">No registrations found.</div>';
      return;
    }

    container.innerHTML = teams.map(team => `
      <div class="admin-team-card" onclick="viewTeam(${team.id})">
        <div class="admin-team-top">
          <div class="admin-team-num">${escapeHtml(team.teamNumber)}</div>
          <div class="admin-team-date">${formatDate(team.createdAt)}</div>
        </div>
        <div class="admin-team-members">
          ${team.memberNames.map((name, i) => `
            <div>👤 ${escapeHtml(name)} <span style="color:var(--text-muted);font-size:11px;">(${escapeHtml(team.memberDepartments[i] || '')})</span></div>
          `).join('')}
        </div>
        <div class="admin-team-field">${escapeHtml(team.solutionField)}</div>
        <div style="font-family:monospace;font-size:12px;color:var(--text-muted);margin-top:8px;">TX: ${escapeHtml(team.transactionId || 'N/A')}</div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Failed to load teams:', err);
  }
}

function debounceSearch() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(loadTeams, 350);
}

// ─── Team Detail ─────────────────────────────────────────────────────────────

async function viewTeam(teamId) {
  try {
    const res = await adminFetch(`/api/admin/teams/${teamId}`);
    const team = await res.json();

    const modalContent = document.getElementById('modal-content');
    modalContent.innerHTML = `
      <div style="text-align:center;margin-bottom:20px;">
        <div style="font-size:12px;color:var(--text-muted);letter-spacing:2px;text-transform:uppercase;margin-bottom:4px;">Team Number</div>
        <div style="font-family:var(--font-display);font-size:24px;font-weight:900;color:var(--accent-orange);letter-spacing:2px;">${escapeHtml(team.teamNumber)}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Registered: ${formatDate(team.createdAt)}</div>
      </div>

      ${team.members.map(m => `
        <div class="review-member-card">
          <div class="review-member-header">👤 Member ${m.order}</div>
          <div class="review-field">
            <span class="review-field-label">Name</span>
            <span class="review-field-value">${escapeHtml(m.fullName)}</span>
          </div>
          <div class="review-field">
            <span class="review-field-label">Roll No.</span>
            <span class="review-field-value">${escapeHtml(m.rollNumber)}</span>
          </div>
          <div class="review-field">
            <span class="review-field-label">Email</span>
            <span class="review-field-value">${escapeHtml(m.email)}</span>
          </div>
          <div class="review-field">
            <span class="review-field-label">Department</span>
            <span class="review-field-value">${escapeHtml(m.department)}</span>
          </div>
          <div class="review-field">
            <span class="review-field-label">Year</span>
            <span class="review-field-value">${escapeHtml(m.yearOfStudy)}</span>
          </div>
        </div>
      `).join('')}

      <div class="review-solution">
        <div class="review-solution-label">💡 SOLUTION FIELD</div>
        <div class="review-solution-value">${escapeHtml(team.solutionField)}</div>
      </div>
      
      <div class="review-payment" style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.1); padding:16px; border-radius:12px; margin-top:16px;">
        <div style="font-size:12px; color:var(--text-muted); text-transform:uppercase; letter-spacing:1px; margin-bottom:4px;">Transaction ID</div>
        <div style="font-family:monospace; font-size:16px; color:var(--primary); font-weight:600; word-break:break-all;">${escapeHtml(team.transactionId || 'N/A')}</div>
      </div>
    `;

    document.getElementById('team-modal').classList.add('active');
  } catch (err) {
    console.error('Failed to load team:', err);
    alert('Failed to load team details.');
  }
}

function closeModal(event) {
  if (event.target.id === 'team-modal') {
    document.getElementById('team-modal').classList.remove('active');
  }
}

// ─── CSV Export ──────────────────────────────────────────────────────────────

async function exportCSV() {
  try {
    const res = await adminFetch('/api/admin/export');

    if (!res.ok) {
      const data = await res.json();
      alert(data.error || 'Export failed.');
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'SIH_2026_Registrations.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Export error:', err);
    alert('Failed to export. Please try again.');
  }
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}
