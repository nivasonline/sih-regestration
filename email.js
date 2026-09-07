const nodemailer = require('nodemailer');

/**
 * Create the email transporter based on environment configuration.
 */
function createTransporter() {
  const isEnabled = String(process.env.EMAIL_ENABLED || '').toLowerCase() === 'true';
  if (isEnabled && process.env.SMTP_USER && process.env.SMTP_PASS) {
    const host = process.env.SMTP_HOST || 'smtp.gmail.com';
    const port = parseInt(process.env.SMTP_PORT || '465', 10);
    const isGmail = host.toLowerCase().includes('gmail');

    // For Gmail on cloud platforms (Railway/Render), port 465 with secure: true bypasses blocked 587 ports
    return nodemailer.createTransport({
      host: isGmail ? 'smtp.gmail.com' : host,
      port: isGmail ? 465 : port,
      secure: isGmail ? true : (port === 465),
      auth: {
        user: process.env.SMTP_USER.trim(),
        pass: process.env.SMTP_PASS.trim()
      },
      tls: {
        rejectUnauthorized: false
      },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000
    });
  }
  return null;
}

/**
 * Generate the HTML email template.
 */
function generateEmailHTML(teamData) {
  const { teamNumber, members, solutionField } = teamData;

  const memberRows = members.map((m, i) => `
    <tr>
      <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #475569; font-size: 14px;">${i + 1}</td>
      <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #1e293b; font-weight: 600; font-size: 14px;">${m.fullName}</td>
      <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #475569; font-size: 14px;">${m.rollNumber}</td>
      <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #475569; font-size: 14px;">${m.department}</td>
      <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #475569; font-size: 14px;">${m.yearOfStudy}</td>
    </tr>
  `).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f172a 100%); padding: 40px 24px; text-align: center;">
      <div style="font-size: 14px; color: #3b82f6; font-weight: 700; letter-spacing: 3px; margin-bottom: 8px;">💻 CSIT DEPARTMENT HACKATHON</div>
      <div style="font-size: 42px; font-weight: 800; color: #ffffff; line-height: 1;">2026</div>
      <div style="font-size: 13px; color: #94a3b8; letter-spacing: 2px; margin-top: 12px;">DEPARTMENT OF COMPUTER SCIENCE & INFORMATION TECHNOLOGY @ AITS, TIRUPATI</div>
    </div>

    <!-- Success Banner -->
    <div style="background: linear-gradient(135deg, #059669, #10b981); padding: 24px; text-align: center;">
      <div style="font-size: 28px; margin-bottom: 4px;">✅</div>
      <div style="font-size: 18px; font-weight: 700; color: #ffffff;">Registration Successful</div>
    </div>

    <!-- Team Number -->
    <div style="padding: 32px 24px; text-align: center; border-bottom: 1px solid #e2e8f0;">
      <div style="font-size: 12px; color: #94a3b8; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 8px;">Your Team Number</div>
      <div style="font-size: 32px; font-weight: 800; color: #0f172a; letter-spacing: 2px;">${teamNumber}</div>
      <div style="font-size: 13px; color: #64748b; margin-top: 8px;">Please save this number for future communication</div>
    </div>

    <!-- Team Members -->
    <div style="padding: 24px;">
      <div style="font-size: 16px; font-weight: 700; color: #0f172a; margin-bottom: 16px;">👥 Team Members</div>
      <table style="width: 100%; border-collapse: collapse; border: 1px solid #e2e8f0; border-radius: 8px;">
        <thead>
          <tr style="background-color: #f8fafc;">
            <th style="padding: 12px 16px; text-align: left; font-size: 12px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; border-bottom: 2px solid #e2e8f0;">#</th>
            <th style="padding: 12px 16px; text-align: left; font-size: 12px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; border-bottom: 2px solid #e2e8f0;">Name</th>
            <th style="padding: 12px 16px; text-align: left; font-size: 12px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; border-bottom: 2px solid #e2e8f0;">Roll No.</th>
            <th style="padding: 12px 16px; text-align: left; font-size: 12px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; border-bottom: 2px solid #e2e8f0;">Dept</th>
            <th style="padding: 12px 16px; text-align: left; font-size: 12px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; border-bottom: 2px solid #e2e8f0;">Year</th>
          </tr>
        </thead>
        <tbody>
          ${memberRows}
        </tbody>
      </table>
    </div>

    <!-- Solution Field -->
    <div style="padding: 0 24px 24px;">
      <div style="background: linear-gradient(135deg, #eff6ff, #f0f9ff); border: 1px solid #bfdbfe; border-radius: 12px; padding: 20px; text-align: center;">
        <div style="font-size: 12px; color: #64748b; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 8px;">Solution Field</div>
        <div style="font-size: 16px; font-weight: 700; color: #1e40af;">💡 ${solutionField}</div>
      </div>
    </div>

    <!-- Event Details -->
    <div style="padding: 24px; background-color: #f8fafc; border-top: 1px solid #e2e8f0;">
      <div style="font-size: 16px; font-weight: 700; color: #0f172a; margin-bottom: 16px;">📋 Event Details</div>
      <div style="display: flex; margin-bottom: 12px;">
        <span style="font-size: 14px; margin-right: 10px;">📅</span>
        <div>
          <div style="font-size: 14px; font-weight: 600; color: #1e293b;">7th – 12th September 2026</div>
        </div>
      </div>
      <div style="display: flex; margin-bottom: 12px;">
        <span style="font-size: 14px; margin-right: 10px;">⏰</span>
        <div>
          <div style="font-size: 14px; font-weight: 600; color: #1e293b;">11:00 AM</div>
        </div>
      </div>
      <div style="display: flex;">
        <span style="font-size: 14px; margin-right: 10px;">📍</span>
        <div>
          <div style="font-size: 14px; font-weight: 600; color: #1e293b;">MBA Seminar Hall / E-Classroom</div>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div style="background-color: #0f172a; padding: 24px; text-align: center;">
      <div style="font-size: 13px; color: #ffffff; font-weight: 700; letter-spacing: 1px; margin-bottom: 4px;">Department of Computer Science & Information Technology (CSIT)</div>
      <div style="font-size: 11px; color: #94a3b8; margin-bottom: 12px;">Annamacharya Institute of Technology and Sciences (AITS), Tirupati</div>
      <div style="font-size: 12px; color: #3b82f6; font-weight: 600;">Head of Department: Mr. V. Samba Siva</div>
      <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #1e293b;">
        <div style="font-size: 11px; color: #64748b; font-style: italic;">"Let's Innovate • Collaborate • Create • Transform!"</div>
      </div>
    </div>

  </div>
</body>
</html>`;
}

/**
 * Send confirmation emails to all team members.
 */
async function sendConfirmationEmails(teamData) {
  const transporter = createTransporter();
  const html = generateEmailHTML(teamData);

  const emails = teamData.members.map(m => m.email);
  const subject = `✅ Registration Confirmed — ${teamData.teamNumber} | CSIT Department Hackathon 2026 @ AITS`;

  if (!transporter) {
    console.log('\n📧 ═══════════════════════════════════════');
    console.log('   EMAIL (console mode - SMTP not configured)');
    console.log('═══════════════════════════════════════');
    console.log(`   To: ${emails.join(', ')}`);
    console.log(`   Subject: ${subject}`);
    console.log(`   Team: ${teamData.teamNumber}`);
    console.log(`   Field: ${teamData.solutionField}`);
    teamData.members.forEach((m, i) => {
      console.log(`   Member ${i + 1}: ${m.fullName} (${m.rollNumber})`);
    });
    console.log('═══════════════════════════════════════\n');
    return { success: true, mode: 'console' };
  }

  try {
    await transporter.sendMail({
      from: `"CSIT Hackathon 2026 @ AITS" <${process.env.SMTP_USER}>`,
      to: emails.join(', '),
      subject,
      html
    });
    console.log(`📧 Confirmation email sent to: ${emails.join(', ')}`);
    return { success: true, mode: 'smtp' };
  } catch (error) {
    console.error('❌ Failed to send email:', error.message);
    return { success: false, mode: 'smtp', error: error.message };
  }
}

module.exports = { sendConfirmationEmails };
