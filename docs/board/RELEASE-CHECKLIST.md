# Final Release Checklist

Before marking the product ready for external consumer release, all items must be verified:

- [ ] **1. Supported capabilities honesty**: Only supported capabilities appear in customer-facing claims; no claims of live AI or automated scanning until implemented.
- [ ] **2. Isolation & persistence**: Cases persist across page reloads and each customer's data is strictly isolated on the server.
- [ ] **3. Guided fallback**: Guided recommendations remain fully usable if an AI model is unavailable or encounters errors.
- [ ] **4. Self-reported vs measured**: Evidence and outcomes distinguish self-reports from automated measurements.
- [ ] **5. Credential security**: No model API keys, secret tokens, or private internal notes are exposed to client payloads.
- [ ] **6. Support & payment promises**: Payment terms and support SLAs match actual implemented operations.
- [ ] **7. Meaningful regression & recovery**: Regression checks pass and database backup/rollback instructions exist and have been tested.
- [ ] **8. Documentation of limits**: Known limitations and unresolved case escalation procedures are documented.
