-- Migration: 0005_scalability_indexes
-- Adds composite indexes for pagination, telemetry queries, and idempotency key lookups.
-- Applied to both the Next.js app DB (drizzle/) and the enterprise Cloudflare Worker DB.

-- Composite index for case list queries (status + time-ordered pagination)
-- Speeds up GET /api/cases?scope=queue ordered by status and updated_at DESC
CREATE INDEX IF NOT EXISTS idx_support_cases_status_created
  ON support_cases (status, created_at DESC);

-- Composite index for idempotency key lookup
-- Speeds up createIdempotentCase reservation checks
CREATE INDEX IF NOT EXISTS idx_case_create_requests_key_owner
  ON case_create_requests (key_hash, owner_id, created_at DESC);
