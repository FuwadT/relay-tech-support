-- Additive cancellation/finalization metadata; never rewrite migration 0002.
ALTER TABLE login_transactions ADD COLUMN cancelled_at TEXT
  CHECK(cancelled_at IS NULL OR (length(cancelled_at) = 24 AND cancelled_at GLOB '????-??-??T??:??:??.???Z' AND julianday(cancelled_at) IS NOT NULL AND cancelled_at >= created_at));
ALTER TABLE login_transactions ADD COLUMN session_id TEXT REFERENCES sessions(id) ON DELETE RESTRICT;
CREATE INDEX login_transactions_browser ON login_transactions(browser_hash);
CREATE UNIQUE INDEX login_transactions_session ON login_transactions(session_id) WHERE session_id IS NOT NULL;
