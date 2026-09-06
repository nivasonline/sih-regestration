/* ═══════════════════════════════════════════════════════════════════════════
   SIH 2026 — MAIN APPLICATION LOGIC
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── State ───────────────────────────────────────────────────────────────────
let currentStep = 1;
let selectedSolution = '';
let registrationResult = null;

const formData = {
  members: [
    { fullName: '', rollNumber: '', email: '', department: '', yearOfStudy: '' },
    { fullName: '', rollNumber: '', email: '', department: '', yearOfStudy: '' },
    { fullName: '', rollNumber: '', email: '', department: '', yearOfStudy: '' }
  ],
  solutionField: '',
  transactionId: ''
};

// ─── Screen Navigation ──────────────────────────────────────────────────────

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(screenId);
  target.classList.add('active');
  window.scrollTo(0, 0);
}

function startRegistration() {
  currentStep = 1;
  updateProgressBar();
  showScreen('screen-register');
  showStep(1);
}

function goHome() {
  // Reset form
  currentStep = 1;
  selectedSolution = '';
  registrationResult = null;
  formData.members = [
    { fullName: '', rollNumber: '', email: '', department: '', yearOfStudy: '' },
    { fullName: '', rollNumber: '', email: '', department: '', yearOfStudy: '' },
    { fullName: '', rollNumber: '', email: '', department: '', yearOfStudy: '' }
  ];
  formData.solutionField = '';
  formData.transactionId = '';

  // Clear all inputs
  document.querySelectorAll('.form-input, .form-select').forEach(el => {
    if (el.tagName === 'SELECT') el.selectedIndex = 0;
    else el.value = '';
    el.classList.remove('error');
  });
  document.querySelectorAll('.form-error').forEach(e => {
    e.classList.remove('visible');
    e.textContent = '';
  });

  // Clear solution selection
  document.querySelectorAll('.solution-card').forEach(c => c.classList.remove('selected'));
  
  // Uncheck confirmation
  const confirmCheck = document.getElementById('confirm-check');
  if (confirmCheck) confirmCheck.checked = false;

  showScreen('screen-home');
}

// ─── Step Navigation ─────────────────────────────────────────────────────────

function showStep(step) {
  document.querySelectorAll('.form-step').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(`step-${step}`);
  target.classList.add('active');
  // Re-trigger animation
  target.style.animation = 'none';
  target.offsetHeight; // reflow
  target.style.animation = '';
  window.scrollTo(0, 0);
}

function updateProgressBar() {
  document.querySelectorAll('.progress-step').forEach(el => {
    const stepNum = parseInt(el.dataset.step);
    el.classList.remove('active', 'completed');
    if (stepNum === currentStep) el.classList.add('active');
    else if (stepNum < currentStep) el.classList.add('completed');
  });

  document.querySelectorAll('.progress-line-fill').forEach(el => {
    const afterStep = parseInt(el.dataset.after);
    if (afterStep < currentStep) el.classList.add('filled');
    else el.classList.remove('filled');
  });
}

function saveMemberData(memberIndex) {
  const prefix = `m${memberIndex}`;
  formData.members[memberIndex - 1] = {
    fullName: document.getElementById(`${prefix}-name`).value.trim(),
    rollNumber: document.getElementById(`${prefix}-roll`).value.trim(),
    email: document.getElementById(`${prefix}-email`).value.trim(),
    department: document.getElementById(`${prefix}-dept`).value,
    yearOfStudy: document.getElementById(`${prefix}-year`).value
  };
}

function validateMember(memberIndex) {
  const prefix = `m${memberIndex}`;
  const member = formData.members[memberIndex - 1];
  let valid = true;

  // Full Name
  if (!member.fullName) {
    showError(`${prefix}-name`, 'Full name is required');
    valid = false;
  } else {
    clearError(`${prefix}-name`);
  }

  // Roll Number
  if (!member.rollNumber) {
    showError(`${prefix}-roll`, 'Roll number is required');
    valid = false;
  } else {
    clearError(`${prefix}-roll`);
  }

  // Email
  if (!member.email) {
    showError(`${prefix}-email`, 'Email address is required');
    valid = false;
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(member.email)) {
    showError(`${prefix}-email`, 'Enter a valid email address');
    valid = false;
  } else {
    clearError(`${prefix}-email`);
  }

  // Department
  if (!member.department) {
    showError(`${prefix}-dept`, 'Select a department');
    valid = false;
  } else {
    clearError(`${prefix}-dept`);
  }

  // Year
  if (!member.yearOfStudy) {
    showError(`${prefix}-year`, 'Select year of study');
    valid = false;
  } else {
    clearError(`${prefix}-year`);
  }

  return valid;
}

function showError(fieldId, message) {
  const input = document.getElementById(fieldId);
  const error = document.getElementById(`${fieldId}-error`);
  input.classList.add('error');
  error.textContent = message;
  error.classList.add('visible');
}

function clearError(fieldId) {
  const input = document.getElementById(fieldId);
  const error = document.getElementById(`${fieldId}-error`);
  input.classList.remove('error');
  error.classList.remove('visible');
  error.textContent = '';
}

function nextStep(fromStep) {
  // Save data
  if (fromStep <= 3) {
    saveMemberData(fromStep);
    if (!validateMember(fromStep)) return;
  }

  currentStep = fromStep + 1;
  updateProgressBar();
  showStep(currentStep);
}

function prevStep(fromStep) {
  // Save current data without validation
  if (fromStep <= 3) saveMemberData(fromStep);

  currentStep = fromStep - 1;
  updateProgressBar();
  showStep(currentStep);
}

// ─── Solution Selection ──────────────────────────────────────────────────────

function selectSolution(card) {
  document.querySelectorAll('.solution-card').forEach(c => c.classList.remove('selected'));
  card.classList.add('selected');
  selectedSolution = card.dataset.field;
  formData.solutionField = selectedSolution;

  // Clear error
  const err = document.getElementById('solution-error');
  err.classList.remove('visible');
  err.textContent = '';
}

// ─── Review Screen ───────────────────────────────────────────────────────────

function goToReview() {
  if (!selectedSolution) {
    const err = document.getElementById('solution-error');
    err.textContent = 'Please select a solution field';
    err.classList.add('visible');
    return;
  }

  const txInput = document.getElementById('payment-tx').value.trim();
  if (!txInput) {
    showError('payment-tx', 'Transaction ID is required');
    return;
  }
  clearError('payment-tx');
  formData.transactionId = txInput;

  // Build review HTML
  const reviewMembers = document.getElementById('review-members');
  reviewMembers.innerHTML = formData.members.map((m, i) => `
    <div class="review-member-card">
      <div class="review-member-header">👤 Member ${i + 1}</div>
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
  `).join('');

  // Solution
  const reviewSolution = document.getElementById('review-solution');
  reviewSolution.innerHTML = `
    <div class="review-solution-label">💡 SELECTED SOLUTION FIELD</div>
    <div class="review-solution-value">${escapeHtml(formData.solutionField)}</div>
  `;

  // Payment
  document.getElementById('review-transaction').textContent = formData.transactionId;

  // Reset confirm
  document.getElementById('confirm-check').checked = false;
  const confirmErr = document.getElementById('confirm-error');
  confirmErr.classList.remove('visible');
  confirmErr.textContent = '';

  showScreen('screen-review');
}

function backToForm() {
  showScreen('screen-register');
  currentStep = 5;
  updateProgressBar();
  showStep(5);
}

// ─── Submit Registration ─────────────────────────────────────────────────────

async function submitRegistration() {
  const confirmCheck = document.getElementById('confirm-check');
  const confirmErr = document.getElementById('confirm-error');

  if (!confirmCheck.checked) {
    confirmErr.textContent = 'Please confirm that the information is correct';
    confirmErr.classList.add('visible');
    return;
  }
  confirmErr.classList.remove('visible');

  // Show loading
  showScreen('screen-loading');

  try {
    const response = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Registration failed');
    }

    registrationResult = result;

    // Artificial delay for UX
    await new Promise(resolve => setTimeout(resolve, 1800));

    showSuccessScreen(result);
  } catch (error) {
    alert(error.message || 'Something went wrong. Please try again.');
    showScreen('screen-review');
  }
}

function showSuccessScreen(result) {
  // Team number
  document.getElementById('success-team-number').textContent = result.teamNumber;

  // Members
  const membersContainer = document.getElementById('success-members');
  membersContainer.innerHTML = `
    <div class="success-members-title">👥 TEAM MEMBERS</div>
    ${formData.members.map((m, i) => `
      <div class="success-member-row">
        <span>👤</span>
        <div>
          <div class="success-member-name">${escapeHtml(m.fullName)}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${escapeHtml(m.department)} • ${escapeHtml(m.yearOfStudy)}</div>
        </div>
      </div>
    `).join('')}
  `;

  // Solution
  const solutionContainer = document.getElementById('success-solution');
  solutionContainer.innerHTML = `
    <div class="success-solution-label">💡 Solution Field</div>
    <div class="success-solution-value">${escapeHtml(formData.solutionField)}</div>
  `;

  showScreen('screen-success');
  launchConfetti();
}

// ─── Download Confirmation ───────────────────────────────────────────────────

function downloadConfirmation() {
  const content = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Registration Confirmation — ${registrationResult.teamNumber}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', sans-serif; background: #f8fafc; padding: 40px; }
    .card { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #0f172a, #1e3a5f); padding: 32px; text-align: center; color: white; }
    .header h1 { font-size: 14px; letter-spacing: 3px; color: #f97316; margin-bottom: 8px; }
    .header .year { font-size: 48px; font-weight: 900; }
    .header .sub { font-size: 12px; color: #94a3b8; letter-spacing: 2px; margin-top: 8px; }
    .team-num { text-align: center; padding: 24px; border-bottom: 1px solid #e2e8f0; }
    .team-num .label { font-size: 11px; color: #94a3b8; letter-spacing: 2px; text-transform: uppercase; }
    .team-num .value { font-size: 32px; font-weight: 900; color: #f97316; margin-top: 4px; }
    .content { padding: 24px; }
    .member { padding: 16px; background: #f8fafc; border-radius: 8px; margin-bottom: 12px; }
    .member h3 { font-size: 13px; color: #f97316; margin-bottom: 8px; }
    .member p { font-size: 13px; color: #334155; margin: 4px 0; }
    .field { text-align: center; padding: 16px; background: #eff6ff; border-radius: 8px; margin-top: 8px; }
    .field .label { font-size: 11px; color: #64748b; }
    .field .value { font-size: 16px; font-weight: 700; color: #1e40af; margin-top: 4px; }
    .footer { text-align: center; padding: 20px; background: #f8fafc; border-top: 1px solid #e2e8f0; }
    .footer p { font-size: 11px; color: #64748b; }
    .event-info { padding: 16px 24px; }
    .event-row { display: flex; align-items: center; gap: 10px; padding: 8px 0; font-size: 13px; color: #334155; }
    @media print { body { padding: 0; background: white; } .card { box-shadow: none; } }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>🇮🇳 SMART INDIA HACKATHON</h1>
      <div class="year">2026</div>
      <div class="sub">INTERNAL HACKATHON @ AITS, TIRUPATI</div>
    </div>
    <div class="team-num">
      <div class="label">Team Number</div>
      <div class="value">${registrationResult.teamNumber}</div>
    </div>
    <div class="content">
      ${formData.members.map((m, i) => `
        <div class="member">
          <h3>👤 Member ${i + 1}</h3>
          <p><strong>Name:</strong> ${escapeHtml(m.fullName)}</p>
          <p><strong>Roll Number:</strong> ${escapeHtml(m.rollNumber)}</p>
          <p><strong>Email:</strong> ${escapeHtml(m.email)}</p>
          <p><strong>Department:</strong> ${escapeHtml(m.department)}</p>
          <p><strong>Year:</strong> ${escapeHtml(m.yearOfStudy)}</p>
        </div>
      `).join('')}
      <div class="field">
        <div class="label">Solution Field</div>
        <div class="value">💡 ${escapeHtml(formData.solutionField)}</div>
      </div>
    </div>
    <div class="event-info">
      <div class="event-row">📅 7th – 12th September 2026</div>
      <div class="event-row">⏰ 11:00 AM</div>
      <div class="event-row">📍 MBA Seminar Hall / E-Classroom</div>
    </div>
    <div class="footer">
      <p>Institute Innovation Cell (IIC) & Entrepreneurship, Startup and Innovation Cell</p>
      <p style="margin-top:4px;">SPOC: DILIP KUMAR N</p>
      <p style="margin-top:8px;font-style:italic;">"Let's Innovate • Collaborate • Create • Transform!"</p>
    </div>
  </div>
  <script>window.onload = () => window.print();</script>
</body>
</html>`;

  const blob = new Blob([content], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (!win) {
    // Fallback: download as file
    const a = document.createElement('a');
    a.href = url;
    a.download = `SIH_2026_Confirmation_${registrationResult.teamNumber}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ─── Confetti Effect ─────────────────────────────────────────────────────────

function launchConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const particles = [];
  const colors = ['#f97316', '#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4'];
  const shapes = ['rect', 'circle'];

  for (let i = 0; i < 120; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      w: Math.random() * 8 + 4,
      h: Math.random() * 6 + 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      shape: shapes[Math.floor(Math.random() * shapes.length)],
      vx: (Math.random() - 0.5) * 3,
      vy: Math.random() * 3 + 2,
      rotation: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 8,
      opacity: 1
    });
  }

  let frame = 0;
  const maxFrames = 180;

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    frame++;

    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.04;
      p.rotation += p.rotSpeed;

      if (frame > maxFrames - 40) {
        p.opacity -= 0.025;
      }

      if (p.opacity <= 0) return;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.globalAlpha = Math.max(0, p.opacity);
      ctx.fillStyle = p.color;

      if (p.shape === 'rect') {
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    });

    if (frame < maxFrames) {
      requestAnimationFrame(animate);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  animate();
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ─── Input Live Validation (clear error on type) ────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.form-input, .form-select').forEach(el => {
    const eventType = el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(eventType, () => {
      el.classList.remove('error');
      const errEl = document.getElementById(`${el.id}-error`);
      if (errEl) {
        errEl.classList.remove('visible');
        errEl.textContent = '';
      }
    });
  });
});
