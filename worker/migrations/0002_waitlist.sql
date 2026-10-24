-- Agent Garden launch waitlist and daily gift box.
CREATE TABLE IF NOT EXISTS waitlist_users (
  id TEXT PRIMARY KEY,
  subject_ref TEXT NOT NULL UNIQUE,
  email_ref TEXT,
  points INTEGER NOT NULL DEFAULT 0,
  unlocked_at TEXT,
  last_gift_opened_at TEXT,
  streak INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','unlocked','frozen')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_waitlist_rank ON waitlist_users(status, points DESC, created_at ASC);
CREATE TABLE IF NOT EXISTS waitlist_gifts (
  id TEXT PRIMARY KEY,
  waitlist_user_id TEXT NOT NULL REFERENCES waitlist_users(id) ON DELETE CASCADE,
  local_day TEXT NOT NULL,
  points_awarded INTEGER NOT NULL,
  streak_after INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(waitlist_user_id, local_day)
);
CREATE INDEX IF NOT EXISTS idx_waitlist_gifts_user_day ON waitlist_gifts(waitlist_user_id, local_day);
CREATE TABLE IF NOT EXISTS waitlist_admit_audit (
  id TEXT PRIMARY KEY,
  admin_subject_ref TEXT NOT NULL,
  target_user_id TEXT,
  action TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
