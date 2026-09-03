require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api', apiRoutes);

// SPA fallback — serve index.html for non-API, non-file requests
app.get('*', (req, res) => {
  if (req.path.startsWith('/admin')) {
    return res.sendFile(path.join(__dirname, 'public', 'admin.html'));
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize DB (async) then start server (if not on Vercel)
(async () => {
  try {
    await db.getDb();
    console.log('✅ Database initialized.');

    if (process.env.VERCEL) {
      console.log('Running on Vercel serverless environment.');
    } else {
      app.listen(PORT, () => {
        console.log('');
        console.log('╔══════════════════════════════════════════════════╗');
        console.log('║   🚀 SIH 2026 Registration Portal is LIVE!     ║');
        console.log('╠══════════════════════════════════════════════════╣');
        console.log(`║   🌐 App:    http://localhost:${PORT}              ║`);
        console.log(`║   🔧 Admin:  http://localhost:${PORT}/admin        ║`);
        console.log(`║   📧 Email:  ${process.env.EMAIL_ENABLED === 'true' ? 'SMTP Active ✅' : 'Console Mode 📋'}              ║`);
        console.log('╚══════════════════════════════════════════════════╝');
        console.log('');
      });
    }
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
})();

module.exports = app;
