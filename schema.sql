CREATE TABLE IF NOT EXISTS members (
  id     TEXT PRIMARY KEY,
  name   TEXT NOT NULL,
  joined TEXT NOT NULL
);

-- Same rule as the local version: no two members with the same name,
-- compared case-insensitively.
CREATE UNIQUE INDEX IF NOT EXISTS members_name_unique ON members (lower(name));
