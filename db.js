const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const isVercel = !!process.env.VERCEL;
const DB_PATH = isVercel 
  ? path.join('/tmp', 'registrations.db') 
  : path.join(__dirname, 'registrations.db');

let db = null;
let dbReady = null;

/**
 * Initialize sql.js and open/create the database.
 */
async function initDb() {
  if (db) return db;

  const SQL = await initSqlJs();

  // Load existing database if present
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_number TEXT UNIQUE NOT NULL,
      solution_field TEXT NOT NULL,
      transaction_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Attempt to add transaction_id column to existing DB (fails silently if it already exists)
  try {
    db.run("ALTER TABLE teams ADD COLUMN transaction_id TEXT");
  } catch (e) {
    // Column likely already exists
  }

  db.run(`
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
    )
  `);

  // Create indexes (ignore if already exist)
  try { db.run('CREATE INDEX idx_team_number ON teams(team_number)'); } catch(e) {}
  try { db.run('CREATE INDEX idx_member_roll ON members(roll_number)'); } catch(e) {}
  try { db.run('CREATE INDEX idx_member_email ON members(email)'); } catch(e) {}
  try { db.run('CREATE INDEX idx_member_name ON members(full_name)'); } catch(e) {}
  try { db.run('CREATE INDEX idx_teams_created ON teams(created_at)'); } catch(e) {}

  saveDb();
  return db;
}

/**
 * Persist the in-memory database to disk.
 */
function saveDb() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

/**
 * Get the database instance (must be initialized first).
 */
function getDb() {
  if (!dbReady) {
    dbReady = initDb();
  }
  return dbReady;
}

/**
 * Generate the next sequential team number: SIH-AITS-001, SIH-AITS-002, ...
 */
function generateTeamNumber() {
  const result = db.exec('SELECT MAX(id) as maxId FROM teams');
  let maxId = 0;
  if (result.length > 0 && result[0].values.length > 0 && result[0].values[0][0] !== null) {
    maxId = result[0].values[0][0];
  }
  const nextNum = maxId + 1;
  return `SIH-AITS-${String(nextNum).padStart(3, '0')}`;
}

/**
 * Register a new team with 3 members.
 */
function registerTeam(data) {
  const { members, solutionField, transactionId } = data;

  if (!members || members.length !== 3) {
    throw new Error('Exactly 3 team members are required.');
  }

  const teamNumber = generateTeamNumber();

  db.run('BEGIN TRANSACTION');
  try {
    db.run(
      'INSERT INTO teams (team_number, solution_field, transaction_id) VALUES (?, ?, ?)',
      [teamNumber, solutionField, transactionId || 'N/A']
    );

    const teamIdResult = db.exec('SELECT last_insert_rowid()');
    const teamId = teamIdResult[0].values[0][0];

    members.forEach((member, index) => {
      db.run(
        'INSERT INTO members (team_id, member_order, full_name, roll_number, email, department, year_of_study) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [teamId, index + 1, member.fullName, member.rollNumber, member.email, member.department, member.yearOfStudy]
      );
    });

    db.run('COMMIT');
    saveDb();

    return { teamNumber, teamId: Number(teamId) };
  } catch (error) {
    db.run('ROLLBACK');
    throw error;
  }
}

/**
 * Get all teams with optional filters.
 */
function getTeams(filters = {}) {
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

  query += ' GROUP BY t.id ORDER BY t.created_at DESC';

  const result = db.exec(query, params);

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

/**
 * Get full team details by ID.
 */
function getTeamById(teamId) {
  const teamResult = db.exec('SELECT * FROM teams WHERE id = ?', [teamId]);
  if (teamResult.length === 0 || teamResult[0].values.length === 0) return null;

  const teamCols = teamResult[0].columns;
  const teamRow = teamResult[0].values[0];
  const team = {};
  teamCols.forEach((col, i) => team[col] = teamRow[i]);

  const memberResult = db.exec(
    'SELECT * FROM members WHERE team_id = ? ORDER BY member_order', [teamId]
  );

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

/**
 * Get dashboard statistics.
 */
function getStats() {
  const totalResult = db.exec('SELECT COUNT(*) as count FROM teams');
  const totalTeams = totalResult.length > 0 ? totalResult[0].values[0][0] : 0;

  const today = new Date().toISOString().split('T')[0];
  const todayResult = db.exec(
    "SELECT COUNT(*) as count FROM teams WHERE DATE(created_at) = DATE(?)", [today]
  );
  const todayTeams = todayResult.length > 0 ? todayResult[0].values[0][0] : 0;

  const fieldResult = db.exec(
    'SELECT solution_field, COUNT(*) as count FROM teams GROUP BY solution_field ORDER BY count DESC LIMIT 1'
  );

  let mostSelectedField = 'N/A';
  let mostSelectedCount = 0;
  if (fieldResult.length > 0 && fieldResult[0].values.length > 0) {
    mostSelectedField = fieldResult[0].values[0][0];
    mostSelectedCount = fieldResult[0].values[0][1];
  }

  return {
    totalTeams,
    totalStudents: totalTeams * 3,
    todayRegistrations: todayTeams,
    mostSelectedField,
    mostSelectedCount
  };
}

/**
 * Get all registrations in flat format for CSV export.
 */
function getAllForExport() {
  const result = db.exec(`
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

module.exports = {
  getDb,
  registerTeam,
  getTeams,
  getTeamById,
  getStats,
  getAllForExport
};
