# Account-owned Buddy Actions Implementation Plan

**Goal:** Let Buddy safely create and update account-owned care records after review and confirmation.

**Architecture:** Authenticated SQLite state, typed tools, stored proposals and transactional server commands. Existing domain rules run on the server; browser snapshot uploads are removed.

**Tech stack:** Express, Node crypto/scrypt, SQLite, Zod, React, native TokenHub fetch, Vitest, Playwright browser verification.

## Tasks

- [ ] Shared domain and strict schemas: add `createAppointment`, `updateChecklist`, `updateBenefitNote`; optional stable checklist items; authenticated actor argument; `backend/src/commands.ts`. Write failing domain/schema tests, implement and build shared code.
- [ ] Account backend: new auth/store/app modules, secure cookie and CSRF, owned state, direct commands, persisted proposals, replay/stale/expiry protections, audit and closed legacy APIs. Tests in isolated SQLite databases.
- [ ] TokenHub tools: validate tool responses against AI-only schemas, scope to the selected owned profile, retain multi-turn history, return a read-only action proposal, and revise the system prompt to explain review/confirmation rather than refusing to help save.
- [ ] Frontend: account gate, session/CSRF API client, server command queue, authoritative state application, server-backed proposal confirmation, before/after preview, sign-out cache cleanup, and custom checklist rendering.
- [ ] Reviewed migration: administrator preview/confirm script; no public legacy claim API and no automatic legacy-to-account mapping.
- [ ] Independent specification and quality review; fix findings. Build shared/frontend/backend and run unit/API/browser/live provider tests.
- [ ] Back up and deploy verified code; keep legacy source data intact. Prepare an ownership mapping preview once the destination account is available.
