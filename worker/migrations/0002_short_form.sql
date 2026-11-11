-- The form now asks only for email, group size and an optional Workshop link.
-- SQLite cannot drop NOT NULL in place, so rebuild the table and keep any rows.
CREATE TABLE applications_new (
	id          INTEGER PRIMARY KEY AUTOINCREMENT,
	created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
	name        TEXT,
	email       TEXT    NOT NULL,
	discord     TEXT,
	group_size  TEXT    NOT NULL,
	mods        TEXT,
	schedule    TEXT,
	hosting     TEXT,
	pains       TEXT,
	country     TEXT,
	emailed     INTEGER NOT NULL DEFAULT 0
);
INSERT INTO applications_new (id, created_at, name, email, discord, group_size, mods, schedule, hosting, pains, country, emailed)
SELECT id, created_at, name, email, discord, group_size, mods, schedule, hosting, pains, country, emailed FROM applications;
-- Keep the id counter where it was, so ids (and Resend idempotency keys) are never reused.
UPDATE sqlite_sequence SET seq = MAX(seq, COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'applications'), 0))
WHERE name = 'applications_new';
DROP TABLE applications;
ALTER TABLE applications_new RENAME TO applications;
