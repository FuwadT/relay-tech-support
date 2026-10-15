-- Independent enterprise database lineage. Never apply to the guided MVP DB.
-- The repository must enable foreign_keys on every SQLite connection; D1 does
-- so by default. Membership/org activity and session validity are server policy.
CREATE TABLE organizations (
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id) BETWEEN 1 AND 128),
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 160),
  status TEXT NOT NULL CHECK(status IN ('active', 'suspended'))
);
CREATE TABLE enterprise_users (
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id) BETWEEN 1 AND 128)
);
CREATE TABLE external_identities (
  user_id TEXT NOT NULL REFERENCES enterprise_users(id) ON DELETE RESTRICT,
  issuer TEXT NOT NULL CHECK(length(trim(issuer)) BETWEEN 1 AND 512),
  subject TEXT NOT NULL CHECK(length(trim(subject)) BETWEEN 1 AND 512),
  PRIMARY KEY(issuer, subject)
);
CREATE INDEX external_identities_user ON external_identities(user_id);
CREATE TABLE memberships (
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  user_id TEXT NOT NULL REFERENCES enterprise_users(id) ON DELETE RESTRICT,
  role TEXT NOT NULL CHECK(role IN ('requester', 'technician', 'administrator')),
  status TEXT NOT NULL CHECK(status IN ('active', 'revoked')),
  PRIMARY KEY(org_id, user_id)
);
CREATE INDEX memberships_user_status ON memberships(user_id, status);
CREATE TABLE sessions (
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id) BETWEEN 1 AND 128),
  token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash) = 64 AND token_hash NOT GLOB '*[^0-9a-f]*'),
  user_id TEXT NOT NULL REFERENCES enterprise_users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL CHECK(length(created_at) = 24 AND created_at GLOB '????-??-??T??:??:??.???Z' AND julianday(created_at) IS NOT NULL),
  expires_at TEXT NOT NULL CHECK(length(expires_at) = 24 AND expires_at GLOB '????-??-??T??:??:??.???Z' AND julianday(expires_at) IS NOT NULL AND expires_at > created_at),
  revoked_at TEXT CHECK(revoked_at IS NULL OR (length(revoked_at) = 24 AND revoked_at GLOB '????-??-??T??:??:??.???Z' AND julianday(revoked_at) IS NOT NULL AND revoked_at >= created_at))
);
CREATE INDEX sessions_user_expiry ON sessions(user_id, expires_at);
CREATE TABLE enterprise_cases (
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id) = 36),
  org_id TEXT NOT NULL,
  requester_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 3 AND 120),
  description TEXT NOT NULL CHECK(length(trim(description)) BETWEEN 10 AND 4000),
  platform TEXT NOT NULL CHECK(platform IN ('windows', 'macos', 'ubuntu')),
  status TEXT NOT NULL CHECK(status IN ('open', 'investigating', 'awaiting_user', 'escalated', 'resolved', 'closed')),
  device_authorized_at TEXT NOT NULL CHECK(length(device_authorized_at) = 24 AND device_authorized_at GLOB '????-??-??T??:??:??.???Z' AND julianday(device_authorized_at) IS NOT NULL),
  consent_at TEXT NOT NULL CHECK(length(consent_at) = 24 AND consent_at GLOB '????-??-??T??:??:??.???Z' AND julianday(consent_at) IS NOT NULL),
  created_at TEXT NOT NULL CHECK(length(created_at) = 24 AND created_at GLOB '????-??-??T??:??:??.???Z' AND julianday(created_at) IS NOT NULL),
  updated_at TEXT NOT NULL CHECK(length(updated_at) = 24 AND updated_at GLOB '????-??-??T??:??:??.???Z' AND julianday(updated_at) IS NOT NULL AND updated_at >= created_at),
  FOREIGN KEY(org_id, requester_id) REFERENCES memberships(org_id, user_id) ON DELETE RESTRICT,
  UNIQUE(org_id, id)
);
CREATE INDEX enterprise_cases_requester_updated ON enterprise_cases(org_id, requester_id, updated_at);
CREATE INDEX enterprise_cases_org_status_updated ON enterprise_cases(org_id, status, updated_at);
CREATE TABLE audit_events (
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id) BETWEEN 1 AND 128),
  org_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK(length(trim(action)) BETWEEN 1 AND 100),
  case_id TEXT,
  created_at TEXT NOT NULL CHECK(length(created_at) = 24 AND created_at GLOB '????-??-??T??:??:??.???Z' AND julianday(created_at) IS NOT NULL),
  FOREIGN KEY(org_id, actor_id) REFERENCES memberships(org_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY(org_id, case_id) REFERENCES enterprise_cases(org_id, id) ON DELETE RESTRICT
);
CREATE INDEX audit_events_org_created ON audit_events(org_id, created_at);
CREATE INDEX audit_events_case_created ON audit_events(org_id, case_id, created_at);
CREATE TABLE enterprise_create_requests (
  org_id TEXT NOT NULL,
  requester_id TEXT NOT NULL,
  key_hash TEXT NOT NULL CHECK(length(key_hash) = 64 AND key_hash NOT GLOB '*[^0-9a-f]*'),
  payload_hash TEXT NOT NULL CHECK(length(payload_hash) = 64 AND payload_hash NOT GLOB '*[^0-9a-f]*'),
  case_id TEXT NOT NULL CHECK(length(case_id) = 36),
  created_at TEXT NOT NULL CHECK(length(created_at) = 24 AND created_at GLOB '????-??-??T??:??:??.???Z' AND julianday(created_at) IS NOT NULL),
  PRIMARY KEY(org_id, requester_id, key_hash),
  FOREIGN KEY(org_id, requester_id) REFERENCES memberships(org_id, user_id) ON DELETE RESTRICT
);
-- No case FK or automatic expiry: deleting a case cannot free an old retry key.
