const express = require('express');
const router = express.Router();
const db = require('../db');
const { sendConfirmationEmails } = require('../email');
const { pushToGoogleSheets } = require('../sheets');

// ─── Registration ──────────────────────────────────────────────────────────────

router.post('/register', async (req, res) => {
  try {
    const { members, solutionField, transactionId } = req.body;

    // Validation
    if (!members || !Array.isArray(members) || members.length !== 3) {
      return res.status(400).json({ error: 'Exactly 3 team members are required.' });
    }

    if (!solutionField || solutionField.trim() === '') {
      return res.status(400).json({ error: 'Solution field is required.' });
    }

    if (!transactionId || transactionId.trim() === '') {
      return res.status(400).json({ error: 'Payment Transaction ID is required.' });
    }

    for (let i = 0; i < members.length; i++) {
      const m = members[i];
      if (!m.fullName || !m.rollNumber || !m.email || !m.department || !m.yearOfStudy) {
        return res.status(400).json({ error: `All fields are required for Member ${i + 1}.` });
      }
      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(m.email)) {
        return res.status(400).json({ error: `Invalid email address for Member ${i + 1}.` });
      }
    }

    // Check for duplicate roll numbers within the team
    const rollNumbers = members.map(m => m.rollNumber.trim().toUpperCase());
    if (new Set(rollNumbers).size !== 3) {
      return res.status(400).json({ error: 'All three members must have different roll numbers.' });
    }

    // Check for duplicate emails within the team
    const emails = members.map(m => m.email.trim().toLowerCase());
    if (new Set(emails).size !== 3) {
      return res.status(400).json({ error: 'All three members must have different email addresses.' });
    }

    // Register the team in MySQL database
    const result = await db.registerTeam({ members, solutionField, transactionId });

    // Get full team data for email & sheets
    const teamData = await db.getTeamById(result.teamId);

    // Send confirmation emails + sync to Google Sheets (both non-blocking)
    Promise.all([
      sendConfirmationEmails(teamData).catch(err => {
        console.error('📧 Email sending failed:', err.message || err);
      }),
      pushToGoogleSheets(teamData).catch(err => {
        console.error('📊 Google Sheets sync failed:', err.message || err);
      })
    ]);

    res.json({
      success: true,
      teamNumber: result.teamNumber,
      teamId: result.teamId
    });

  } catch (error) {
    console.error('Registration error:', error);
    if (error.code === 'ER_DUP_ENTRY' || (error.message && error.message.includes('Duplicate entry')) || (error.message && error.message.includes('UNIQUE constraint failed'))) {
      return res.status(409).json({ error: 'A team or member with these unique details is already registered.' });
    }
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// ─── Admin Authentication ──────────────────────────────────────────────────────

router.post('/admin/login', (req, res) => {
  const { password } = req.body;
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

  if (password === adminPassword) {
    res.json({ success: true, token: Buffer.from(`admin:${Date.now()}`).toString('base64') });
  } else {
    res.status(401).json({ error: 'Invalid password.' });
  }
});

// Simple admin auth middleware
function adminAuth(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (token) {
    try {
      const decoded = Buffer.from(token, 'base64').toString();
      if (decoded.startsWith('admin:')) {
        return next();
      }
    } catch (e) { /* fall through */ }
  }
  res.status(401).json({ error: 'Unauthorized. Please log in.' });
}

// ─── Admin Dashboard ───────────────────────────────────────────────────────────

router.get('/admin/stats', adminAuth, async (req, res) => {
  try {
    const stats = await db.getStats();
    res.json(stats);
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats.' });
  }
});

router.get('/admin/teams', adminAuth, async (req, res) => {
  try {
    const filters = {
      search: req.query.search || '',
      department: req.query.department || '',
      year: req.query.year || '',
      solutionField: req.query.solutionField || ''
    };
    const teams = await db.getTeams(filters);
    res.json(teams);
  } catch (error) {
    console.error('Teams list error:', error);
    res.status(500).json({ error: 'Failed to fetch teams.' });
  }
});

router.get('/admin/teams/:id', adminAuth, async (req, res) => {
  try {
    const team = await db.getTeamById(parseInt(req.params.id));
    if (!team) {
      return res.status(404).json({ error: 'Team not found.' });
    }
    res.json(team);
  } catch (error) {
    console.error('Team detail error:', error);
    res.status(500).json({ error: 'Failed to fetch team details.' });
  }
});

router.get('/admin/export', adminAuth, async (req, res) => {
  try {
    const { Parser } = require('json2csv');
    const data = await db.getAllForExport();

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'No registrations to export.' });
    }

    const parser = new Parser({
      fields: ['Team Number', 'Solution Field', 'Registered At', 'Member #', 'Full Name', 'Roll Number', 'Email', 'Department', 'Year of Study']
    });
    const csv = parser.parse(data);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=CSIT_2026_Registrations.csv');
    res.send(csv);
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: 'Failed to export data.' });
  }
});

module.exports = router;
