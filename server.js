// Book club members — zero dependencies, Node stdlib only.
// Run: node server.js   (then open http://localhost:3000)

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'members.json');
const INDEX_FILE = path.join(__dirname, 'index.html');

function readMembers() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeMembers(members) {
  // write-then-rename so an interrupted save can't truncate the list
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(members, null, 2));
  fs.renameSync(tmp, DATA_FILE);
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
    return send(res, 200, readMembers());
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

    const members = readMembers();
    if (members.some(m => m.name.toLowerCase() === name.toLowerCase())) {
      return send(res, 409, { error: 'that name is already on the list' });
    }
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const member = { id, name, joined: new Date().toISOString() };
    members.push(member);
    writeMembers(members);
    return send(res, 201, member);
  }

  const del = url.pathname.match(/^\/api\/members\/([^/]+)$/);
  if (req.method === 'DELETE' && del) {
    const id = decodeURIComponent(del[1]);
    const members = readMembers();
    const next = members.filter(m => m.id !== id);
    if (next.length === members.length) return send(res, 404, { error: 'not found' });
    writeMembers(next);
    return send(res, 200, { ok: true });
  }

  send(res, 404, { error: 'not found' });
});

server.listen(PORT, () => {
  console.log(`Book club running at http://localhost:${PORT}`);
});
