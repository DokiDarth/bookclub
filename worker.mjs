// Arsenal Fan Club members — Cloudflare Worker + D1.
// The local Node version (server.js) speaks the same HTTP API; this file is
// the deployed one. Static files come from public/ via the assets binding.

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// Constant-time-ish compare so a wrong passcode doesn't leak its length by timing.
function passcodeMatches(given, expected) {
  if (typeof given !== 'string' || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }

    // The passcode gate only exists if you set one:
    //   npx wrangler secret put CLUB_PASSCODE
    // With no secret set, the app is open to anyone with the link.
    if (env.CLUB_PASSCODE) {
      const given = request.headers.get('X-Club-Passcode') || '';
      if (!passcodeMatches(given, env.CLUB_PASSCODE)) {
        return json({ error: 'passcode required' }, 401);
      }
    }

    if (request.method === 'GET' && url.pathname === '/api/members') {
      const { results } = await env.DB
        .prepare('SELECT id, name, joined FROM members ORDER BY joined')
        .all();
      return json(results ?? []);
    }

    if (request.method === 'POST' && url.pathname === '/api/members') {
      let payload;
      try {
        payload = await request.json();
      } catch {
        return json({ error: 'invalid JSON' }, 400);
      }
      const name = String(payload?.name || '').trim();
      if (!name) return json({ error: 'name is required' }, 400);

      const member = { id: newId(), name, joined: new Date().toISOString() };
      try {
        await env.DB
          .prepare('INSERT INTO members (id, name, joined) VALUES (?, ?, ?)')
          .bind(member.id, member.name, member.joined)
          .run();
      } catch (err) {
        if (String(err.message).includes('UNIQUE constraint failed')) {
          return json({ error: 'that name is already on the list' }, 409);
        }
        throw err;
      }
      return json(member, 201);
    }

    const del = url.pathname.match(/^\/api\/members\/([^/]+)$/);
    if (request.method === 'DELETE' && del) {
      const { meta } = await env.DB
        .prepare('DELETE FROM members WHERE id = ?')
        .bind(decodeURIComponent(del[1]))
        .run();
      if (!meta.changes) return json({ error: 'not found' }, 404);
      return json({ ok: true });
    }

    return json({ error: 'not found' }, 404);
  },
};
