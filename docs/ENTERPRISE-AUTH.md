# Enterprise sign-in implementation

This API belongs to the separate enterprise Worker and D1 database. It never accepts Sites identity headers, client roles, email-domain membership, or legacy Relay cookies. Login is disabled by default. Local fixtures are verification evidence, not a live Entra/Google acceptance result.

## Server configuration

Apply the enterprise migration lineage in order to an independent ENTERPRISE_DB. Never apply these files to the Sites DB or change the existing drizzle migrations. Configure APP_ORIGIN to the exact HTTPS application origin. OIDC currently requires the standard HTTPS port and fixed callback paths.

Enable only after configuring ENTERPRISE_LOGIN_ENABLED=true, LOGIN_ENCRYPTION_KEY (32 random bytes encoded as canonical unpadded base64url), and one or both provider configurations:

- Google: GOOGLE_OIDC_CLIENT_ID and GOOGLE_OIDC_CLIENT_SECRET. Register the exact redirect URI `APP_ORIGIN/api/v2/auth/google/callback`.
- Entra: ENTRA_OIDC_CLIENT_ID, ENTRA_OIDC_CLIENT_SECRET and the organization's UUID ENTRA_TENANT_ID. Register `APP_ORIGIN/api/v2/auth/entra/callback`. Common/consumer tenant endpoints are not accepted.

Use server-side secret management for the encryption key and provider secrets. Never paste real values into source, test fixtures, browser configuration, logs, or handoffs. Replacing the encryption key invalidates pending login attempts. Provider configuration is selected by the server, never supplied by the request.

Provision enterprise_users, exact verified issuer/subject external_identities, and explicit active memberships through controlled administration before testing sign-in. This release does not implement invitations or an administration provisioning UI. Matching email addresses do not establish a membership or role. A suspended organization or revoked membership cannot authorize a session or subsequent case operation.

## Browser contract

1. POST `{}` as application/json to `/api/v2/auth/google/start` or `/api/v2/auth/entra/start` from APP_ORIGIN. The response sets a Secure, HttpOnly, SameSite=Lax, Path=/ `__Host-relay_login` cookie and returns `{authorizationUrl}`. Navigate to that URL. A deliberate second attempt cancels the previous browser-bound attempt.
2. The provider returns to its fixed GET callback. The server atomically consumes the ten-minute state/browser/provider transaction before exchanging the authorization code. State and browser tokens are hashed at rest; nonce/PKCE verifier are AES-GCM encrypted with transaction context bound as authenticated data. Token signature, issuer, audience/authorized party, nonce, expiry and PKCE are checked by the existing OIDC adapter.
3. For an active pre-provisioned identity, session issuance and login finalization occur in one database transaction. The opaque session token is hashed at rest; the browser receives only a Secure, HttpOnly, SameSite=Lax, Path=/ `__Host-relay_session` cookie lasting eight hours. Successful sign-in rotates the previous session. Logout cancellation is rechecked during issuance to close the in-flight callback race.
4. The callback redirects to the fixed `/api/v2/auth/session` endpoint, avoiding callback codes in the resulting page URL. This returns the user ID and up to 200 active organization memberships. The authenticated UI destination is a later Gemini integration task; the current API does not pretend to render a signed-in workspace.
5. POST `{}` to `/api/v2/auth/logout` from APP_ORIGIN. It revokes the supplied session and any session linked to the browser's outstanding login, cancels that login, and clears both cookies. Sign-out is idempotent. GET logout and cross-origin mutations are refused.

Provider denial, expired/replayed state, wrong browser, or failed validation requires a fresh attempt. Tokens, codes, raw provider errors and SQL are not returned in error payloads or general logs. Active memberships and organization status are checked again on case reads/writes; a cookie cannot freeze an old role grant.

## Remaining release gates

Real application registration, production D1/secrets, Entra and Google hosted callback acceptance, two-organization access checks, sign-in UI integration, controlled provisioning, edge request throttling and scheduled authentication-data cleanup remain required. Cleanup during login is bounded; it is not a scheduled deletion service. Completed/cancelled transaction secrets are erased, while the minimal session link remains until revocation/expiry to support concurrent sign-out correctly.

No live model calls, assistant authorization, ticket delivery, telemetry upload or device execution is enabled by these authentication endpoints.
