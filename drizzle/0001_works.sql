CREATE TABLE IF NOT EXISTS site_state (
    name TEXT PRIMARY KEY
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS works (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
    description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 3000),
    category TEXT NOT NULL CHECK (length(category) BETWEEN 1 AND 60),
    poster TEXT NOT NULL DEFAULT '',
    video TEXT NOT NULL CHECK (length(video) BETWEEN 1 AND 2048),
    sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 999999),
    published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0, 1)),
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS works_public_order
    ON works (published, sort_order, created_at, id);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS admin_login_attempts (
    scope TEXT PRIMARY KEY,
    window_start INTEGER NOT NULL,
    attempts INTEGER NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS admin_login_attempts_expiry
    ON admin_login_attempts (window_start);
