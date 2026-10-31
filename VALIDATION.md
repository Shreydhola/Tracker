# Validation record

Validated in the managed cloud workspace on 2026-10-31. This record distinguishes local fixture/demo checks from live provider behavior.

## Passed

- PostgreSQL 17: initial Prisma migration plus raw-webhook retention migration applied; repeat deploy reported no pending migrations.
- `npm run typecheck`: application, worker, tooling and tests compile.
- `npm test`: 13 unit tests passed, including 5,000-row parsing, CSV aliases, tracking-only imports, XLSX round-trip, dates, duplicate detection, spreadsheet formula escaping, exception severity thresholds, delivery terminal handling and signature tampering rejection.
- Disposable `tracker_test` database: import retry idempotency, row validation errors, event retention/deduplication, out-of-order updates, incident notification deduplication, automatic delivery resolution, webhook inbox deduplication, 40-item registration batches with mocked acceptance/rejection/recovery, and 5,000-row permanent persistence.
- Chromium end-to-end: login protection, sign-in, upload preview/mapping/confirmation, search, CSV and XLSX downloads (including parsed XLSX content), shipment details, incident acknowledgement, settings save and CSRF rejection. Desktop and 390px mobile screenshots inspected; no browser page errors.
- `npm run build`: optimized Next.js production build passed.
- Real web/worker processes: `/api/health` confirmed database and current worker heartbeat; unauthenticated shipment API returned 401; unconfigured webhook returned 503.
- Docker image: frozen dependency installation, application build, non-root web startup, migration deploy, login page and database/worker health checks passed.
- `docker compose config --quiet`: deployment configuration parses.
- `npm audit`: zero known vulnerabilities after replacing the starter spreadsheet dependency stack. This is a point-in-time package advisory check, not a security certification.

## Pending live acceptance

- Official 17TRACK documentation was inaccessible because the managed egress proxy rejected `api.17track.net`. The domain requirement is saved in the environment draft and must be applied in environment settings. No API account key/version was supplied.
- The v2.4 provider adapter and signing contract are starter-derived and explicitly unverified. Production calls and webhook acceptance remain gated by `TRACK17_CONTRACT_VERIFIED=true`, `APP_MODE=live`, and a configured key. Do not enable the gate without checking official endpoints, limits, response structures, signature/acknowledgement rules, duplicate-registration semantics, carrier identifiers, account version, and any external registration ID fields.
- Real registration, carrier detection, provider credits, missed-update recovery and a real signed webhook round-trip have not been validated. Fixture tests are not evidence of current provider compatibility.
- SMTP/Resend delivery requires actual transport credentials, sender/recipient configuration and an approved live test. No external email was sent during development.
- HTTPS termination, public domain routing, production backups/restores, multi-worker registration concurrency, long-running outage recovery and sustained production load remain deployment acceptance work. The 5,000-row test validates an import, not long-term throughput or availability.
- The Docker image and individual runtime components were tested; a fresh production Compose deployment, published cloud snapshot and fresh-task restoration have not been independently verified.

See README.md for setup, deployment, data isolation, operational limits and acceptance steps.
