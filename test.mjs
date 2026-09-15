// Tests for the deployed Worker, against a stand-in for D1.
// Run: node test.mjs   (no dependencies)

const { default: worker } = await import('./worker.mjs');

// Minimal D1 stand-in: enough to exercise routing, the gate, and status codes.
function makeDB(seed = []) {
  const rows = [...seed];
  return {
    prepare(sql) {
      const st = { sql, args: [] };
      st.bind = (...a) => { st.args = a; return st; };
      st.all = async () => ({ results: [...rows].sort((a, b) => a.joined.localeCompare(b.joined)) });
      st.run = async () => {
        if (/^INSERT/.test(sql)) {
          const [id, name, joined] = st.args;
          if (rows.some(r => r.name.toLowerCase() === name.toLowerCase())) {
            throw new Error('D1_ERROR: UNIQUE constraint failed: index \'members_name_unique\'');
          }
          rows.push({ id, name, joined });
          return { meta: { changes: 1 } };
        }
        if (/^DELETE/.test(sql)) {
          const before = rows.length;
          const i = rows.findIndex(r => r.id === st.args[0]);
          if (i >= 0) rows.splice(i, 1);
          return { meta: { changes: before - rows.length } };
        }
        return { meta: { changes: 0 } };
      };
      return st;
    },
    _rows: rows,
  };
}

const ASSETS = { fetch: async () => new Response('<html>index</html>', { headers: { 'Content-Type': 'text/html' } }) };
const req = (path, opts = {}) => new Request('https://example.com' + path, opts);
const hit = (env, path, opts) => worker.fetch(req(path, opts), env);

let pass = 0, fail = 0;
const check = (label, got, want) => {
  const ok = got === want;
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  (got ${got}, want ${want})`);
};

// ---- ungated deployment -------------------------------------------------
{
  const env = { DB: makeDB(), ASSETS };
  check('GET  /            -> asset', (await hit(env, '/')).status, 200);
  check('GET  /api/members -> empty list', (await hit(env, '/api/members')).status, 200);

  const add = await hit(env, '/api/members', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Govind Kumar' }),
  });
  check('POST new member', add.status, 201);
  const created = await add.json();

  const dup = await hit(env, '/api/members', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'gOvInD kUmAr' }),
  });
  check('POST duplicate (diff case)', dup.status, 409);

  const blank = await hit(env, '/api/members', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '   ' }),
  });
  check('POST blank name', blank.status, 400);

  const bad = await hit(env, '/api/members', { method: 'POST', body: 'not json' });
  check('POST malformed JSON', bad.status, 400);

  check('DELETE unknown id', (await hit(env, '/api/members/nope', { method: 'DELETE' })).status, 404);
  check('DELETE real id', (await hit(env, '/api/members/' + created.id, { method: 'DELETE' })).status, 200);
  check('rows left after delete', env.DB._rows.length, 0);
  check('unknown route', (await hit(env, '/api/nonsense')).status, 404);
}

// ---- passcode-gated deployment -----------------------------------------
{
  const env = { DB: makeDB([{ id: 'a', name: 'Govind Kumar', joined: '2026-01-01' }]), ASSETS, CLUB_PASSCODE: 'chapter-one' };
  const P = (code) => ({ 'X-Club-Passcode': code });

  check('gated: no passcode   -> 401', (await hit(env, '/api/members')).status, 401);
  check('gated: wrong passcode-> 401', (await hit(env, '/api/members', { headers: P('nope') })).status, 401);
  check('gated: wrong length  -> 401', (await hit(env, '/api/members', { headers: P('chapter-one-longer') })).status, 401);
  check('gated: right passcode-> 200', (await hit(env, '/api/members', { headers: P('chapter-one') })).status, 200);

  const leak = await hit(env, '/api/members');
  const body = await leak.text();
  check('gated: 401 leaks no names', /Govind/.test(body), false);

  check('gated: index.html still served', (await hit(env, '/')).status, 200);

  check('gated: POST without passcode -> 401', (await hit(env, '/api/members', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'X' }),
  })).status, 401);

  check('gated: DELETE without passcode -> 401',
    (await hit(env, '/api/members/a', { method: 'DELETE' })).status, 401);
  check('gated: member survived blocked delete', env.DB._rows.length, 1);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
