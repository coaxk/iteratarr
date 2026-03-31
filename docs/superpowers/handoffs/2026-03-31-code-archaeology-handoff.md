# Code Archaeology Handoff — 2026-03-31

## Objective
Build durable repo memory so future sessions do not depend on transient model context.

## Completed This Pass
- Reviewed core docs:
  - [ROADMAP.md](C:/Projects/iteratarr/docs/ROADMAP.md)
  - [architecture-decisions-2026-03-24.md](C:/Projects/iteratarr/docs/architecture-decisions-2026-03-24.md)
  - [TELEMETRY_VISION.md](C:/Projects/iteratarr/docs/TELEMETRY_VISION.md)
  - [METHODOLOGY.md](C:/Projects/iteratarr/docs/METHODOLOGY.md)
- Enumerated backend route surface and verified current runtime wiring from [server.js](C:/Projects/iteratarr/backend/server.js)
- Verified shared frontend query architecture in [useQueries.js](C:/Projects/iteratarr/frontend/src/hooks/useQueries.js)
- Added durable memory docs:
  - [CODEBASE_OPERATIONAL_MAP.md](C:/Projects/iteratarr/docs/superpowers/handoffs/CODEBASE_OPERATIONAL_MAP.md)
  - [SESSION_HANDOFF_TEMPLATE.md](C:/Projects/iteratarr/docs/superpowers/handoffs/SESSION_HANDOFF_TEMPLATE.md)

## Current Architecture Snapshot
- Clip-first UX remains primary
- Branch-per-seed model is core iteration structure
- Analytics and seed intelligence are live (`/api/analytics/overview`, `/api/analytics/seeds`, `/api/analytics/seeds/:seed`)
- Disk-growth strategy (#26) is implemented and pushed (`1c57dd8`)
- Storage management API/UI is live

## Where Knowledge Drift Still Happens
- Non-FK joins (`clips.characters` as strings) can cause silent analytics splits
- Process-local async job state can reset on backend restart
- Mixed legacy/new media assets (PNG/WebP) require transitional compatibility awareness

## Operating Rule Going Forward
Every session closes with a dated handoff doc using:
- [SESSION_HANDOFF_TEMPLATE.md](C:/Projects/iteratarr/docs/superpowers/handoffs/SESSION_HANDOFF_TEMPLATE.md)

Every new feature kickoff starts with:
- [CODEBASE_OPERATIONAL_MAP.md](C:/Projects/iteratarr/docs/superpowers/handoffs/CODEBASE_OPERATIONAL_MAP.md)
- latest dated handoff doc in `docs/superpowers/handoffs/`

