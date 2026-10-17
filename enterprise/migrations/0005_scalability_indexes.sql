-- Migration: 0005_scalability_indexes
-- Composite SQLite indexes for Enterprise Cloudflare D1 database.
-- Optimizes case status filtering with time-ordered pagination and idempotency lookups.

CREATE INDEX IF NOT EXISTS idx_enterprise_cases_status_created
  ON enterprise_cases (org_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_enterprise_create_requests_key_created
  ON enterprise_create_requests (org_id, requester_id, key_hash, created_at DESC);
