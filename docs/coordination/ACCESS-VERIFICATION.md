# Local API access regression

Run against a built Worker in an isolated checkout and local D1 database:

1. Install pinned dependencies, run `npm test`, `pnpm exec tsc --noEmit`, and `npm run build`.
2. Apply each `drizzle/*.sql` in filename order to a **fresh local database** using `node --import ./scripts/sites-env.mjs node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file <migration>`. Do not reapply SQL to an existing database.
3. Run `npm start -- --port 8789`.
4. Run `node tests/runtime-access.mjs` from another terminal in the same checkout.

`RELAY_TEST_URL` may select another loopback HTTP port. The test refuses hosted URLs and redirects. It creates uniquely named synthetic owners and cases, and deletes only its own fixtures in cleanup. It verifies denied cross-owner reads/writes/deletion, forged browser roles, owner save/read persistence, list isolation and metadata redaction.

For an integrated S4 build, explicitly configure a support email on the local server and set the **same** `RELAY_TEST_SUPPORT_EMAIL` in the test process. This additionally checks queue denial, support-only notes, customer response redaction, denied staff deletion and preservation of customer outcome timestamps. Omitting this variable explicitly skips support coverage; a baseline pass is not S4 acceptance.

Evidence, October 15, 2026: the committed baseline initially returned a Worker restart/503 immediately after a cross-owner PATCH. Reading the bounded JSON body before returning the denial fixed the observed sequence. The rebuilt Codex branch passes 19 HTTP assertions plus response checks, all 18 unit tests and strict TypeScript. Production build passes. CI now runs the local owner-access regression after its build; check the remote run before claiming CI success for this addition.

These tests simulate trusted platform identity headers locally. They do not establish that the hosted ingress strips client identity headers, or replace real sign-in, browser accessibility, reload journeys, or hosted two-user acceptance. No live Site was deployed by this verification.
