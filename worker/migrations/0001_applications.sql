-- Applications from the managed Project Zomboid server form (/zomboid/).
CREATE TABLE applications (
	id          INTEGER PRIMARY KEY AUTOINCREMENT,
	created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
	name        TEXT    NOT NULL,
	email       TEXT    NOT NULL,
	discord     TEXT,
	group_size  TEXT    NOT NULL,
	mods        TEXT    NOT NULL,
	schedule    TEXT,
	hosting     TEXT,
	pains       TEXT,
	country     TEXT,
	emailed     INTEGER NOT NULL DEFAULT 0
);
