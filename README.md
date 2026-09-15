# Book Club

A list of members. No dependencies — Node's standard library only.

## Run

```
node server.js
```

Then open http://localhost:3000

## Where the data lives

`members.db`, a SQLite database next to `server.js`. Back it up by copying that
file, or inspect it with any SQLite tool:

```
sqlite3 members.db "SELECT name, joined FROM members ORDER BY joined"
```

SQLite is used through Node's built-in `node:sqlite` module, so there is still
nothing to install.

If an older `members.json` is present, the server imports it on first start and
renames it to `members.json.backup`. That import runs only while the table is
empty, so restarting never duplicates anyone.

## Deploying it for the club (Cloudflare, free tier)

One-time setup, from this folder:

```
npx wrangler login                      # opens a browser, no token pasting
npx wrangler d1 create bookclub         # prints a database_id
```

Paste that `database_id` into `wrangler.toml`, then create the table and deploy:

```
npx wrangler d1 execute bookclub --remote --file=schema.sql
npx wrangler deploy
```

That prints your URL — something like `https://bookclub.<your-subdomain>.workers.dev`.

### Bring your existing members along

```
node export-seed.mjs
npx wrangler d1 execute bookclub --remote --file=seed.sql
```

`seed.sql` holds real names, so it is gitignored. The inserts use
`INSERT OR IGNORE`, so running it twice will not duplicate anyone.

### Set a passcode

Without one, anyone with the link can add and remove members.

```
npx wrangler secret put CLUB_PASSCODE
```

Share that passcode with the club. Each person enters it once and their
browser remembers it; "Lock this device" forgets it again. To remove the
passcode and make the app open, run `npx wrangler secret delete CLUB_PASSCODE`.

The local server honours the same passcode via an environment variable:

```
CLUB_PASSCODE=whatever node server.js
```

## Tests

```
node test.mjs
```

Covers the deployed Worker's routes against a stand-in for D1: adding,
duplicate rejection, validation, deletion, and every passcode case. No
dependencies.

## API

- `GET /api/members` — list everyone
- `POST /api/members` `{"name": "..."}` — add (rejects duplicate names)
- `DELETE /api/members/:id` — remove

## Notes

Removing a member takes two clicks: the `×` turns into "Remove?", which you
click to confirm (it resets itself after a few seconds).
