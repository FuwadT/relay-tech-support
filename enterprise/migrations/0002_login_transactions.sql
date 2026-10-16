-- Additive enterprise authentication lineage. Login data expires after ten minutes.
-- Consumed rows remain until expiry so a duplicate state cannot reopen a transaction.
CREATE TABLE login_transactions (
  state_hash TEXT PRIMARY KEY NOT NULL CHECK(length(state_hash) = 64 AND state_hash NOT GLOB '*[^0-9a-f]*'),
  provider TEXT NOT NULL CHECK(provider IN ('entra', 'google')),
  browser_hash TEXT NOT NULL CHECK(length(browser_hash) = 64 AND browser_hash NOT GLOB '*[^0-9a-f]*'),
  created_at TEXT NOT NULL CHECK(length(created_at) = 24 AND created_at GLOB '????-??-??T??:??:??.???Z' AND julianday(created_at) IS NOT NULL),
  expires_at TEXT NOT NULL CHECK(length(expires_at) = 24 AND expires_at GLOB '????-??-??T??:??:??.???Z' AND julianday(expires_at) IS NOT NULL AND expires_at > created_at AND (julianday(expires_at) - julianday(created_at)) * 86400 <= 600.001),
  iv TEXT NOT NULL CHECK(length(iv) = 16 AND iv NOT GLOB '*[^A-Za-z0-9_-]*'),
  encrypted_payload TEXT NOT NULL CHECK(length(encrypted_payload) BETWEEN 32 AND 4096 AND encrypted_payload NOT GLOB '*[^A-Za-z0-9_-]*'),
  consumed_at TEXT CHECK(consumed_at IS NULL OR (length(consumed_at) = 24 AND consumed_at GLOB '????-??-??T??:??:??.???Z' AND julianday(consumed_at) IS NOT NULL AND consumed_at >= created_at AND consumed_at < expires_at))
);
CREATE INDEX login_transactions_expiry ON login_transactions(expires_at);
