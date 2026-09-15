# Book Club

A list of members. No dependencies — Node's standard library only.

## Run

```
node server.js
```

Then open http://localhost:3000

## Where the data lives

`members.json`, right next to `server.js`. Plain JSON, safe to edit by hand or
back up by copying the file.

## API

- `GET /api/members` — list everyone
- `POST /api/members` `{"name": "..."}` — add (rejects duplicate names)
- `DELETE /api/members/:id` — remove

## Notes

Removing a member takes two clicks: the `×` turns into "Remove?", which you
click to confirm (it resets itself after a few seconds).
