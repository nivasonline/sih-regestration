const mysql = require('mysql2/promise');
require('dotenv').config();

const DB_HOST = process.env.DB_HOST || process.env.MYSQLHOST || process.env.MYSQL_HOST || 'localhost';
const DB_PORT = parseInt(process.env.DB_PORT || process.env.MYSQLPORT || process.env.MYSQL_PORT || '3306', 10);
const DB_USER = process.env.DB_USER || process.env.MYSQLUSER || process.env.MYSQL_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || process.env.MYSQL_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || process.env.MYSQLDATABASE || process.env.MYSQL_DATABASE || 'sih_registration';
const DB_SSL = process.env.DB_SSL === 'true' || process.env.MYSQL_SSL === 'true';

let pool = null;
let dbReadyPromise = null;

/**
 * Initialize MySQL database connection and ensure tables exist.
 */
async function initDb() {
  if (pool) return pool;

  const sslOption = DB_SSL ? { rejectUnauthorized: false } : undefined;

  // 1. Ensure the database exists
  let tempConn;
  try {
    tempConn = await mysql.createConnection({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
      ssl: sslOption
    });
  } catch (err) {
    if (err.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('\n❌ [MySQL Error] Access Denied: Invalid password or username in .env');
      console.error(`👉 Please open your .env file and set DB_PASSWORD=your_mysql_password (currently user: "${DB_USER}")\n`);
    } else if (err.code === 'ECONNREFUSED') {
      console.error(`\n❌ [MySQL Error] Could not connect to MySQL at ${DB_HOST}:${DB_PORT}`);
      console.error('👉 Make sure MySQL Server is running.\n');
    }
    throw err;
  }

  await tempConn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
  await tempConn.end();

  // 2. Create connection pool
  pool = mysql.createPool({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    ssl: sslOption,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
  });

  // 2.5 Ensure table schema matches SIH requirements
  try {
    const [cols] = await pool.query("SHOW COLUMNS FROM `teams` LIKE 'solution_field'");
    if (!cols || cols.length === 0) {
      console.log('🔄 Outdated table schema detected. Recreating tables for SIH portal...');
      await pool.query('SET FOREIGN_KEY_CHECKS = 0');
      await pool.query('DROP TABLE IF EXISTS `members`');
      await pool.query('DROP TABLE IF EXISTS `teams`');
      await pool.query('SET FOREIGN_KEY_CHECKS = 1');
    }
  } catch (err) {
    // If teams doesn't exist yet, this is expected
  }

  // 3. Create tables if they do not exist
  await pool.query(`
    CREATE TABLE IF NOT EXISTS teams (
      id INT AUTO_INCREMENT PRIMARY KEY,
      team_number VARCHAR(50) NOT NULL UNIQUE,
      solution_field VARCHAR(150) NOT NULL,
      transaction_id VARCHAR(150),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_team_number (team_number),
      INDEX idx_teams_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS members (
      id INT AUTO_INCREMENT PRIMARY KEY,
      team_id INT NOT NULL,
      member_order TINYINT NOT NULL,
      full_name VARCHAR(150) NOT NULL,
      roll_number VARCHAR(50) NOT NULL,
      email VARCHAR(150) NOT NULL,
      department VARCHAR(100) NOT NULL,
      year_of_study VARCHAR(50) NOT NULL,
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
      UNIQUE KEY uq_team_member (team_id, member_order),
      INDEX idx_member_roll (roll_number),
      INDEX idx_member_email (email),
      INDEX idx_member_name (full_name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  return pool;
}

/**
 * Get the database pool instance (must be initialized first).
 */
function getDb() {
  if (!dbReadyPromise) {
    dbReadyPromise = initDb();
  }
  return dbReadyPromise;
}

/**
 * Generate the next sequential team number: SIH-AITS-001, SIH-AITS-002, ...
 */
async function generateTeamNumber(executor) {
  const conn = executor || pool;
  const [rows] = await conn.query('SELECT MAX(id) AS maxId FROM teams');
  const maxId = rows[0]?.maxId || 0;
  const nextNum = maxId + 1;
  return `SIH-AITS-${String(nextNum).padStart(3, '0')}`;
}

/**
 * Register a new team with 3 members inside a transaction.
 */
async function registerTeam(data) {
  const { members, solutionField, transactionId } = data;

  if (!members || members.length !== 3) {
    throw new Error('Exactly 3 team members are required.');
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const teamNumber = await generateTeamNumber(conn);

    const [teamResult] = await conn.query(
      'INSERT INTO teams (team_number, solution_field, transaction_id) VALUES (?, ?, ?)',
      [teamNumber, solutionField, transactionId || 'N/A']
    );

    const teamId = teamResult.insertId;

    for (let i = 0; i < members.length; i++) {
      const m = members[i];
      await conn.query(
        'INSERT INTO members (team_id, member_order, full_name, roll_number, email, department, year_of_study) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [teamId, i + 1, m.fullName, m.rollNumber, m.email, m.department, m.yearOfStudy]
      );
    }

    await conn.commit();
    return { teamNumber, teamId };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

/**
 * Get all teams with optional filters.
 */
async function getTeams(filters = {}) {
  let query = `
    SELECT t.id, t.team_number, t.solution_field, t.transaction_id, t.created_at,
           GROUP_CONCAT(m.full_name ORDER BY m.member_order SEPARATOR '|||') as member_names,
           GROUP_CONCAT(m.department ORDER BY m.member_order SEPARATOR '|||') as member_departments,
           GROUP_CONCAT(m.year_of_study ORDER BY m.member_order SEPARATOR '|||') as member_years
    FROM teams t
    LEFT JOIN members m ON m.team_id = t.id
  `;

  const conditions = [];
  const params = [];

  if (filters.search) {
    conditions.push(`(
      t.team_number LIKE ? OR
      m.full_name LIKE ? OR
      m.roll_number LIKE ? OR
      m.email LIKE ?
    )`);
    const searchTerm = `%${filters.search}%`;
    params.push(searchTerm, searchTerm, searchTerm, searchTerm);
  }

  if (filters.department) {
    conditions.push('m.department = ?');
    params.push(filters.department);
  }

  if (filters.year) {
    conditions.push('m.year_of_study = ?');
    params.push(filters.year);
  }

  if (filters.solutionField) {
    conditions.push('t.solution_field = ?');
    params.push(filters.solutionField);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' GROUP BY t.id, t.team_number, t.solution_field, t.transaction_id, t.created_at ORDER BY t.created_at DESC';

  const [rows] = await pool.query(query, params);

  return rows.map(row => ({
    id: row.id,
    teamNumber: row.team_number,
    solutionField: row.solution_field,
    transactionId: row.transaction_id,
    createdAt: row.created_at,
    memberNames: row.member_names ? row.member_names.split('|||') : [],
    memberDepartments: row.member_departments ? row.member_departments.split('|||') : [],
    memberYears: row.member_years ? row.member_years.split('|||') : []
  }));
}

/**
 * Get full team details by ID.
 */
async function getTeamById(teamId) {
  const [teamRows] = await pool.query('SELECT * FROM teams WHERE id = ?', [teamId]);
  if (!teamRows || teamRows.length === 0) return null;

  const team = teamRows[0];

  const [memberRows] = await pool.query(
    'SELECT * FROM members WHERE team_id = ? ORDER BY member_order ASC',
    [teamId]
  );

  const members = memberRows.map(m => ({
    order: m.member_order,
    fullName: m.full_name,
    rollNumber: m.roll_number,
    email: m.email,
    department: m.department,
    yearOfStudy: m.year_of_study
  }));

  return {
    id: team.id,
    teamNumber: team.team_number,
    solutionField: team.solution_field,
    transactionId: team.transaction_id,
    createdAt: team.created_at,
    members
  };
}

/**
 * Get dashboard statistics.
 */
async function getStats() {
  const [[{ totalTeams }]] = await pool.query('SELECT COUNT(*) AS totalTeams FROM teams');
  const [[{ todayRegistrations }]] = await pool.query(
    'SELECT COUNT(*) AS todayRegistrations FROM teams WHERE DATE(created_at) = CURDATE()'
  );

  const [fieldRows] = await pool.query(
    'SELECT solution_field, COUNT(*) as count FROM teams GROUP BY solution_field ORDER BY count DESC LIMIT 1'
  );

  const mostSelectedField = fieldRows.length > 0 ? fieldRows[0].solution_field : 'N/A';
  const mostSelectedCount = fieldRows.length > 0 ? fieldRows[0].count : 0;

  return {
    totalTeams: Number(totalTeams) || 0,
    totalStudents: (Number(totalTeams) || 0) * 3,
    todayRegistrations: Number(todayRegistrations) || 0,
    mostSelectedField,
    mostSelectedCount: Number(mostSelectedCount) || 0
  };
}

/**
 * Get all registrations in flat format for CSV export.
 */
async function getAllForExport() {
  const [rows] = await pool.query(`
    SELECT
      t.team_number AS 'Team Number',
      t.transaction_id AS 'Transaction ID',
      t.solution_field AS 'Solution Field',
      t.created_at AS 'Registered At',
      m.member_order AS 'Member #',
      m.full_name AS 'Full Name',
      m.roll_number AS 'Roll Number',
      m.email AS 'Email',
      m.department AS 'Department',
      m.year_of_study AS 'Year of Study'
    FROM teams t
    JOIN members m ON m.team_id = t.id
    ORDER BY t.id ASC, m.member_order ASC
  `);

  return rows;
}

module.exports = {
  getDb,
  registerTeam,
  getTeams,
  getTeamById,
  getStats,
  getAllForExport
};
