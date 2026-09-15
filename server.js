// Book club members — zero dependencies, Node stdlib only (node:sqlite).
// Run: node server.js   (then open http://localhost:3000)

const http = require('http');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'members.db');
const LEGACY_FILE = path.join(__dirname, 'members.json');
const INDEX_FILE = path.join(__dirname, 'index.html');

const db = new DatabaseSync(DB_FILE);

// WAL keeps reads from blocking the write that's in flight, and survives a crash.
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS members (
    id     TEXT PRIMARY KEY,
    name   TEXT NOT NULL,
    joined TEXT NOT NULL
  )
`);
// The no-duplicates rule lives in the schema, so it holds even if two requests
// race or someone edits the db by hand.
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS members_name_unique ON members (lower(name))');

const selectAll = db.prepare('SELECT id, name, joined FROM members ORDER BY joined');
const insertOne = db.prepare('INSERT INTO members (id, name, joined) VALUES (?, ?, ?)');
const deleteOne = db.prepare('DELETE FROM members WHERE id = ?');
const countAll = db.prepare('SELECT COUNT(*) AS n FROM members');

// One-time lift of the old JSON list into the database. Runs only when the
// table is empty, so it can't duplicate rows or clobber newer data.
function migrateLegacyFile() {
  if (!fs.existsSync(LEGACY_FILE) || countAll.get().n > 0) return;

  let rows;
  try {
    rows = JSON.parse(fs.readFileSync(LEGACY_FILE, 'utf8'));
  } catch {
    console.warn('members.json is not valid JSON — skipping migration');
    return;
  }
  if (!Array.isArray(rows) || rows.length === 0) return;

  db.exec('BEGIN');
  try {
    for (const r of rows) {
      if (r && typeof r.name === 'string' && r.name.trim()) {
        insertOne.run(r.id || newId(), r.name.trim(), r.joined || new Date().toISOString());
      }
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('Migration failed, members.json left untouched:', err.message);
    return;
  }

  // Keep the old file as a backup rather than deleting it.
  fs.renameSync(LEGACY_FILE, LEGACY_FILE + '.backup');
  console.log(`Migrated ${countAll.get().n} member(s) from members.json (kept as members.json.backup)`);
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': type });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 1e5) reject(new Error('body too large'));
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    return send(res, 200, fs.readFileSync(INDEX_FILE, 'utf8'), 'text/html; charset=utf-8');
  }

  if (req.method === 'GET' && url.pathname === '/api/members') {
    return send(res, 200, selectAll.all());
  }

  if (req.method === 'POST' && url.pathname === '/api/members') {
    let payload;
    try {
      payload = JSON.parse(await readBody(req));
    } catch {
      return send(res, 400, { error: 'invalid JSON' });
    }
    const name = String(payload.name || '').trim();
    if (!name) return send(res, 400, { error: 'name is required' });

    const member = { id: newId(), name, joined: new Date().toISOString() };
    try {
      insertOne.run(member.id, member.name, member.joined);
    } catch (err) {
      if (String(err.message).includes('UNIQUE constraint failed')) {
        return send(res, 409, { error: 'that name is already on the list' });
      }
      throw err;
    }
    return send(res, 201, member);
  }

  const del = url.pathname.match(/^\/api\/members\/([^/]+)$/);
  if (req.method === 'DELETE' && del) {
    const { changes } = deleteOne.run(decodeURIComponent(del[1]));
    if (changes === 0) return send(res, 404, { error: 'not found' });
    return send(res, 200, { ok: true });
  }

  send(res, 404, { error: 'not found' });
});

migrateLegacyFile();

server.listen(PORT, () => {
  console.log(`Book club running at http://localhost:${PORT} (${countAll.get().n} member(s))`);
});
