// Dumps the local members.db into seed.sql so it can be loaded into D1:
//   node export-seed.mjs
//   npx wrangler d1 execute bookclub --remote --file=seed.sql
//
// seed.sql contains real member names, so it is gitignored.

import { DatabaseSync } from 'node:sqlite';
import { writeFileSync } from 'node:fs';

const db = new DatabaseSync('members.db');
const rows = db.prepare('SELECT id, name, joined FROM members ORDER BY joined').all();

const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const lines = rows.map(
  (r) => `INSERT OR IGNORE INTO members (id, name, joined) VALUES (${q(r.id)}, ${q(r.name)}, ${q(r.joined)});`
);

writeFileSync('seed.sql', lines.join('\n') + (lines.length ? '\n' : ''));
console.log(`Wrote seed.sql with ${rows.length} member(s)`);
