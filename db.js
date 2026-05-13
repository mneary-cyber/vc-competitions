'use strict';

const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'db', 'competitions.sqlite'));

db.exec(`
  CREATE TABLE IF NOT EXISTS entries (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    competition TEXT NOT NULL,
    email       TEXT NOT NULL,
    firstname   TEXT,
    utm_source  TEXT,
    utm_medium  TEXT,
    utm_campaign TEXT,
    ip          TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(competition, email)
  );
`);

function insertEntry({ competition, email, firstname, utmSource, utmMedium, utmCampaign, ip }) {
  const stmt = db.prepare(`
    INSERT INTO entries (competition, email, firstname, utm_source, utm_medium, utm_campaign, ip)
    VALUES (@competition, @email, @firstname, @utmSource, @utmMedium, @utmCampaign, @ip)
  `);
  try {
    stmt.run({ competition, email, firstname: firstname || null, utmSource: utmSource || null, utmMedium: utmMedium || null, utmCampaign: utmCampaign || null, ip: ip || null });
    return true;
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return false; // duplicate
    throw e;
  }
}

function getEntryCount(competition) {
  return db.prepare('SELECT COUNT(*) as count FROM entries WHERE competition = ?').get(competition).count;
}

function getAllEntries(competition) {
  return db.prepare('SELECT * FROM entries WHERE competition = ? ORDER BY created_at ASC').all(competition);
}

module.exports = { insertEntry, getEntryCount, getAllEntries };
