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

## API

- `GET /api/members` — list everyone
- `POST /api/members` `{"name": "..."}` — add (rejects duplicate names)
- `DELETE /api/members/:id` — remove

## Notes

Removing a member takes two clicks: the `×` turns into "Remove?", which you
click to confirm (it resets itself after a few seconds).
