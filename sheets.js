/**
 * Google Sheets Integration via Apps Script Web App
 * Sends registration data to a Google Sheet via POST request.
 */

const SHEETS_URL = process.env.GOOGLE_SHEETS_URL || '';

/**
 * Push a registration to Google Sheets.
 * @param {Object} teamData - { teamNumber, solutionField, createdAt, members: [{fullName, rollNumber, email, department, yearOfStudy}] }
 */
async function pushToGoogleSheets(teamData) {
  if (!SHEETS_URL) {
    console.log('⚠️  Google Sheets URL not configured. Skipping sheet sync.');
    return { success: false, reason: 'GOOGLE_SHEETS_URL not set in .env' };
  }

  const payload = {
    teamNumber: teamData.teamNumber,
    transactionId: teamData.transactionId,
    solutionField: teamData.solutionField,
    registeredAt: teamData.createdAt || new Date().toISOString(),
    members: teamData.members.map(m => ({
      fullName: m.fullName,
      rollNumber: m.rollNumber,
      email: m.email,
      department: m.department,
      yearOfStudy: m.yearOfStudy
    }))
  };

  try {
    const response = await fetch(SHEETS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      redirect: 'follow'
    });

    // Apps Script redirects (302) on success — fetch with redirect:'follow' handles it
    if (response.ok) {
      const result = await response.json().catch(() => ({ status: 'ok' }));
      console.log(`📊 Google Sheets: Team ${teamData.teamNumber} synced successfully.`);
      return { success: true, result };
    } else {
      const text = await response.text().catch(() => '');
      console.error(`❌ Google Sheets error (${response.status}): ${text}`);
      return { success: false, reason: `HTTP ${response.status}` };
    }
  } catch (error) {
    console.error('❌ Google Sheets sync failed:', error.message);
    return { success: false, reason: error.message };
  }
}

module.exports = { pushToGoogleSheets };
