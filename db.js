const mysql = require('mysql2/promise');
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const os = require('os');
require('dotenv').config();

const DB_HOST_RAW = process.env.DB_HOST;
const DB_HOST = (DB_HOST_RAW && DB_HOST_RAW !== 'localhost') ? DB_HOST_RAW : (process.env.MYSQLHOST || process.env.MYSQL_HOST || DB_HOST_RAW || 'localhost');
const DB_PORT = parseInt(process.env.MYSQLPORT || process.env.MYSQL_PORT || process.env.DB_PORT || '3306', 10);
const DB_USER_RAW = process.env.DB_USER;
const DB_USER = (DB_USER_RAW && DB_USER_RAW !== 'root') ? DB_USER_RAW : (process.env.MYSQLUSER || process.env.MYSQL_USER || DB_USER_RAW || 'root');
const DB_PASSWORD = process.env.MYSQLPASSWORD || process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD || '';
const DB_NAME = process.env.MYSQLDATABASE || process.env.MYSQL_DATABASE || process.env.DB_NAME || 'sih_registration';
const DB_SSL = process.env.DB_SSL === 'true' || process.env.MYSQL_SSL === 'true';

let dbEngine = 'mysql'; // 'mysql' | 'sqlite'
let pool = null;
let sqliteDb = null;
let sqliteDbPath = null;
let dbReadyPromise = null;

// Determine writable path for SQLite database
function getSqliteFilePath() {
  const localPath = path.join(__dirname, 'registrations.db');
  try {
    // Check if current dir is writable
    const testFile = path.join(__dirname, '.write_test');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    return localPath;
  } catch (e) {
    // Fall back to OS temp directory if project dir is read-only (e.g. serverless/container environment)
    return path.join(os.tmpdir(), 'registrations.db');
  }
}

/**
 * Save in-memory SQLite database to disk.
 */
function saveSqliteDb() {
  if (!sqliteDb || !sqliteDbPath) return;
  try {
    const data = sqliteDb.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(sqliteDbPath, buffer);
  } catch (e) {
    console.error('⚠️ [SQLite] Failed to persist database to disk:', e.message);
  }
}

/**
 * Initialize SQLite database via sql.js fallback.
 */
async function initSqliteDb() {
  sqliteDbPath = getSqliteFilePath();
  const SQL = await initSqlJs();

  let fileBuffer = null;
  if (fs.existsSync(sqliteDbPath)) {
    try {
      fileBuffer = fs.readFileSync(sqliteDbPath);
    } catch (e) {
      console.warn('⚠️ Could not read existing SQLite database file:', e.message);
    }
  }

  sqliteDb = fileBuffer ? new SQL.Database(fileBuffer) : new SQL.Database();

  // Create tables for SQLite
  sqliteDb.run(`
    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_number TEXT NOT NULL UNIQUE,
      solution_field TEXT NOT NULL,
      transaction_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  sqliteDb.run(`
    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id INTEGER NOT NULL,
      member_order INTEGER NOT NULL CHECK(member_order IN (1, 2, 3)),
      full_name TEXT NOT NULL,
      roll_number TEXT NOT NULL,
      email TEXT NOT NULL,
      department TEXT NOT NULL,
      year_of_study TEXT NOT NULL,
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
      UNIQUE(team_id, member_order)
    );
  `);

  try { sqliteDb.run('CREATE INDEX IF NOT EXISTS idx_team_number ON teams(team_number)'); } catch (e) {}
  try { sqliteDb.run('CREATE INDEX IF NOT EXISTS idx_member_roll ON members(roll_number)'); } catch (e) {}
  try { sqliteDb.run('CREATE INDEX IF NOT EXISTS idx_member_email ON members(email)'); } catch (e) {}
  try { sqliteDb.run('CREATE INDEX IF NOT EXISTS idx_member_name ON members(full_name)'); } catch (e) {}

  saveSqliteDb();
  dbEngine = 'sqlite';
  console.log(`✅ Database initialized: SQLite Mode (Storage: ${sqliteDbPath})`);
}

/**
 * Initialize MySQL database connection or fallback to SQLite.
 */
async function initDb() {
  if (pool || sqliteDb) return dbEngine;

  const sslOption = DB_SSL ? { rejectUnauthorized: false } : undefined;

  try {
    const tempConn = await mysql.createConnection({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
      ssl: sslOption,
      connectTimeout: 5000
    });

    await tempConn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    await tempConn.end();

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

    // Ensure table schema
    try {
      const [cols] = await pool.query("SHOW COLUMNS FROM `teams` LIKE 'solution_field'");
      if (!cols || cols.length === 0) {
        console.log('🔄 Outdated table schema detected. Recreating MySQL tables...');
        await pool.query('SET FOREIGN_KEY_CHECKS = 0');
        await pool.query('DROP TABLE IF EXISTS `members`');
        await pool.query('DROP TABLE IF EXISTS `teams`');
        await pool.query('SET FOREIGN_KEY_CHECKS = 1');
      }
    } catch (err) {}

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

    dbEngine = 'mysql';
    console.log(`✅ Database initialized: MySQL Mode (${DB_HOST}:${DB_PORT}/${DB_NAME})`);
    return dbEngine;

  } catch (err) {
    console.warn(`\n⚠️ [MySQL Connection Warning] ${err.message || err}`);
    console.warn('👉 Switching to SQLite (sql.js) database fallback for seamless deployment...\n');
    await initSqliteDb();
    return dbEngine;
  }
}

/**
 * Get DB readiness promise.
 */
function getDb() {
  if (!dbReadyPromise) {
    dbReadyPromise = initDb();
  }
  return dbReadyPromise;
}

/**
 * Generate sequential team number.
 */
async function generateTeamNumber(executor) {
  if (dbEngine === 'mysql') {
    const conn = executor || pool;
    const [rows] = await conn.query('SELECT MAX(id) AS maxId FROM teams');
    const maxId = rows[0]?.maxId || 0;
    return `SIH-AITS-${String(maxId + 1).padStart(3, '0')}`;
  } else {
    const res = sqliteDb.exec('SELECT MAX(id) as maxId FROM teams');
    let maxId = 0;
    if (res.length > 0 && res[0].values.length > 0 && res[0].values[0][0] !== null) {
      maxId = res[0].values[0][0];
    }
    return `SIH-AITS-${String(maxId + 1).padStart(3, '0')}`;
  }
}

/**
 * Register a team with 3 members.
 */
async function registerTeam(data) {
  await getDb();
  const { members, solutionField, transactionId } = data;

  if (!members || members.length !== 3) {
    throw new Error('Exactly 3 team members are required.');
  }

  if (dbEngine === 'mysql') {
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
  } else {
    // SQLite Mode
    const teamNumber = await generateTeamNumber();
    sqliteDb.run('BEGIN TRANSACTION');
    try {
      sqliteDb.run(
        'INSERT INTO teams (team_number, solution_field, transaction_id) VALUES (?, ?, ?)',
        [teamNumber, solutionField, transactionId || 'N/A']
      );
      const teamIdResult = sqliteDb.exec('SELECT last_insert_rowid()');
      const teamId = Number(teamIdResult[0].values[0][0]);

      members.forEach((m, index) => {
        sqliteDb.run(
          'INSERT INTO members (team_id, member_order, full_name, roll_number, email, department, year_of_study) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [teamId, index + 1, m.fullName, m.rollNumber, m.email, m.department, m.yearOfStudy]
        );
      });

      sqliteDb.run('COMMIT');
      saveSqliteDb();
      return { teamNumber, teamId };
    } catch (error) {
      try { sqliteDb.run('ROLLBACK'); } catch (e) {}
      throw error;
    }
  }
}

/**
 * Get all teams with optional filters.
 */
async function getTeams(filters = {}) {
  await getDb();

  if (dbEngine === 'mysql') {
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
      conditions.push(`(t.team_number LIKE ? OR m.full_name LIKE ? OR m.roll_number LIKE ? OR m.email LIKE ?)`);
      const term = `%${filters.search}%`;
      params.push(term, term, term, term);
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
  } else {
    // SQLite Mode
    let query = `
      SELECT t.id, t.team_number, t.solution_field, t.transaction_id, t.created_at,
             GROUP_CONCAT(m.full_name, '|||') as member_names,
             GROUP_CONCAT(m.department, '|||') as member_departments,
             GROUP_CONCAT(m.year_of_study, '|||') as member_years
      FROM teams t
      LEFT JOIN members m ON m.team_id = t.id
    `;
    const conditions = [];
    const params = [];

    if (filters.search) {
      conditions.push(`(t.team_number LIKE ? OR m.full_name LIKE ? OR m.roll_number LIKE ? OR m.email LIKE ?)`);
      const term = `%${filters.search}%`;
      params.push(term, term, term, term);
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

    query += ' GROUP BY t.id ORDER BY t.created_at DESC';

    const result = sqliteDb.exec(query, params);
    if (result.length === 0) return [];

    const columns = result[0].columns;
    return result[0].values.map(row => {
      const obj = {};
      columns.forEach((col, i) => obj[col] = row[i]);
      return {
        id: obj.id,
        teamNumber: obj.team_number,
        solutionField: obj.solution_field,
        transactionId: obj.transaction_id,
        createdAt: obj.created_at,
        memberNames: obj.member_names ? obj.member_names.split('|||') : [],
        memberDepartments: obj.member_departments ? obj.member_departments.split('|||') : [],
        memberYears: obj.member_years ? obj.member_years.split('|||') : []
      };
    });
  }
}

/**
 * Get team by ID.
 */
async function getTeamById(teamId) {
  await getDb();

  if (dbEngine === 'mysql') {
    const [teamRows] = await pool.query('SELECT * FROM teams WHERE id = ?', [teamId]);
    if (!teamRows || teamRows.length === 0) return null;
    const team = teamRows[0];

    const [memberRows] = await pool.query('SELECT * FROM members WHERE team_id = ? ORDER BY member_order ASC', [teamId]);
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
  } else {
    const teamResult = sqliteDb.exec('SELECT * FROM teams WHERE id = ?', [teamId]);
    if (teamResult.length === 0 || teamResult[0].values.length === 0) return null;

    const teamCols = teamResult[0].columns;
    const teamRow = teamResult[0].values[0];
    const team = {};
    teamCols.forEach((col, i) => team[col] = teamRow[i]);

    const memberResult = sqliteDb.exec('SELECT * FROM members WHERE team_id = ? ORDER BY member_order', [teamId]);
    let members = [];
    if (memberResult.length > 0) {
      const memberCols = memberResult[0].columns;
      members = memberResult[0].values.map(row => {
        const obj = {};
        memberCols.forEach((col, i) => obj[col] = row[i]);
        return {
          order: obj.member_order,
          fullName: obj.full_name,
          rollNumber: obj.roll_number,
          email: obj.email,
          department: obj.department,
          yearOfStudy: obj.year_of_study
        };
      });
    }

    return {
      id: team.id,
      teamNumber: team.team_number,
      solutionField: team.solution_field,
      transactionId: team.transaction_id,
      createdAt: team.created_at,
      members
    };
  }
}

/**
 * Get dashboard statistics.
 */
async function getStats() {
  await getDb();

  if (dbEngine === 'mysql') {
    const [[{ totalTeams }]] = await pool.query('SELECT COUNT(*) AS totalTeams FROM teams');
    const [[{ todayRegistrations }]] = await pool.query('SELECT COUNT(*) AS todayRegistrations FROM teams WHERE DATE(created_at) = CURDATE()');
    const [fieldRows] = await pool.query('SELECT solution_field, COUNT(*) as count FROM teams GROUP BY solution_field ORDER BY count DESC LIMIT 1');

    return {
      totalTeams: Number(totalTeams) || 0,
      totalStudents: (Number(totalTeams) || 0) * 3,
      todayRegistrations: Number(todayRegistrations) || 0,
      mostSelectedField: fieldRows.length > 0 ? fieldRows[0].solution_field : 'N/A',
      mostSelectedCount: fieldRows.length > 0 ? Number(fieldRows[0].count) : 0
    };
  } else {
    const totalResult = sqliteDb.exec('SELECT COUNT(*) as count FROM teams');
    const totalTeams = totalResult.length > 0 ? totalResult[0].values[0][0] : 0;

    const today = new Date().toISOString().split('T')[0];
    const todayResult = sqliteDb.exec("SELECT COUNT(*) as count FROM teams WHERE DATE(created_at) = DATE(?)", [today]);
    const todayTeams = todayResult.length > 0 ? todayResult[0].values[0][0] : 0;

    const fieldResult = sqliteDb.exec('SELECT solution_field, COUNT(*) as count FROM teams GROUP BY solution_field ORDER BY count DESC LIMIT 1');
    let mostSelectedField = 'N/A';
    let mostSelectedCount = 0;
    if (fieldResult.length > 0 && fieldResult[0].values.length > 0) {
      mostSelectedField = fieldResult[0].values[0][0];
      mostSelectedCount = fieldResult[0].values[0][1];
    }

    return {
      totalTeams: Number(totalTeams) || 0,
      totalStudents: (Number(totalTeams) || 0) * 3,
      todayRegistrations: Number(todayTeams) || 0,
      mostSelectedField,
      mostSelectedCount: Number(mostSelectedCount) || 0
    };
  }
}

/**
 * Get all registrations for CSV export.
 */
async function getAllForExport() {
  await getDb();

  if (dbEngine === 'mysql') {
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
  } else {
    const result = sqliteDb.exec(`
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
      ORDER BY t.id, m.member_order
    `);
    if (result.length === 0) return [];
    const columns = result[0].columns;
    return result[0].values.map(row => {
      const obj = {};
      columns.forEach((col, i) => obj[col] = row[i]);
      return obj;
    });
  }
}

module.exports = {
  getDb,
  registerTeam,
  getTeams,
  getTeamById,
  getStats,
  getAllForExport
};
