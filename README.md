# ParcelOps — Shipment Control Center

A private Next.js/React/TypeScript shipment operations application for Amazon US and Canada, with PostgreSQL, Prisma, persistent pg-boss workers, import preview, historical tracking events, delivery incidents, and notifications. The uploaded Flask starter supplied the workflow reference; this implementation replaces its runtime and SQLite storage.

## Important integration status

**The live 17TRACK integration is gated and not production-validated.** The onboarding network blocked the official documentation at <https://api.17track.net/en/doc>. The adapter in `src/lib/provider.ts` is carried forward from the uploaded Flask starter (v2.4, 40-item batches, `17token`, SHA-256 raw-body/key webhook signature). It is explicitly **unverified**, not a claim about the current provider contract. No carrier IDs are invented. The carrier reference table is intentionally empty until an official catalog is obtained. Do not enable `TRACK17_CONTRACT_VERIFIED` until the current documentation and your account version have been checked, fixtures updated, and a real registration/webhook round-trip tested.

Demo mode uses clearly marked fictitious records and blocks all provider calls and mail delivery. Use separate PostgreSQL databases for demo and live data. The app and worker refuse a database containing records from the other mode. This code is a substantial functional implementation, not a claim of production readiness while the integration gate and live acceptance checks remain outstanding.

## Quick start for development

Prerequisites: Node.js 24, npm, Docker/Compose, and Git. Each cloud task already runs in an isolated environment: use the existing checkout; do not create a worktree unless explicitly requested.

1. Open a terminal in the repository and run `npm ci`.
2. Copy `.env.example` to `.env`. Keep it private; it is ignored by Git.
3. Choose `APP_MODE=demo`. Set a strong `POSTGRES_PASSWORD`, `ADMIN_EMAIL`, and a unique `ADMIN_PASSWORD` of at least 14 characters. For host development set `DATABASE_URL=postgresql://tracker:YOUR_URL_ENCODED_PASSWORD@localhost:5432/tracker_demo` and `APP_URL=http://localhost:3000`.
4. Start PostgreSQL, for example:
   ```sh
   docker run -d --name tracker-postgres -p 127.0.0.1:5432:5432 \
     -e POSTGRES_USER=tracker -e POSTGRES_DB=tracker_demo \
     -e POSTGRES_PASSWORD -v tracker-pgdata:/var/lib/postgresql/data postgres:17-alpine
   ```
   Export `POSTGRES_PASSWORD` securely before this command; Docker cannot read it from `.env` automatically. Alternatively use Compose (below).
5. Run `npm run db:generate`, `npm run db:migrate`, and `npm run admin:create`. The administrator command will not overwrite an existing password. Remove `ADMIN_PASSWORD` from persistent environment configuration after creating the account.
6. Optional: `npm run demo:seed` creates 32 labeled fake records, only in a demo database outside production.
7. In separate terminals run `npm run dev` and `npm run worker`. The worker must stay running even when nobody is logged in.
8. Open the application in your deployment/browser, sign in, and upload the included `samples/shipments.csv`. Review the column mapping and confirm.

`GET /api/health` checks the database and a worker heartbeat (updated every minute). It returns 503 if the heartbeat is missing or older than three minutes. Do not treat a running web process as proof the worker is healthy.

## Daily workflow

- Import CSV, XLSX or TXT (up to 10,000 rows / 10 MB); one-number-per-line files are supported. The first XLSX worksheet is used. Use YYYY-MM-DD dates.
- Headings are detected, with manual mapping for every supported field. The preview shows the first 50 rows. Every original row remains in import history. Final validation returns created, duplicate, invalid and pending counts plus row errors.
- Re-imports update supplied metadata and retain checkpoints, incidents and registration history. Tracking numbers normalize spaces/case and must contain 5–50 alphanumeric characters or hyphens. Carriers requiring additional provider fields (such as destination postal code) need a separately verified extension.
- The worker scans pending registration every two minutes; batches contain at most 40 records. Transport failures use bounded pg-boss retries with exponential backoff; per-shipment registration attempts stop at five. A failed/rejected registration creates an incident. Use the selection action to retry after fixing the cause.
- Webhooks are verified before persistence, deduplicated by exact payload hash, stored in a restricted database inbox, and processed by the worker. A periodic outbox scan recovers persisted inbox rows if enqueueing failed. Duplicate event fingerprints do not duplicate checkpoints. Older payloads append history without rolling the latest status backward.
- Recovery polls up to 40 active shipments every five minutes when their last successful update is older than 12 hours. Delivered shipments are not routinely polled. This is a recovery mechanism, not a promise of carrier scan frequency.
- Rules run every 15 minutes even without carrier updates. Warnings escalate at configurable thresholds; elapsed time alone never labels a package lost/damaged. Acknowledgement retains an active incident. Resolution is recorded in follow-up history; if its underlying condition persists, the next audit can open a new incident.
- Notifications deduplicate by incident and severity. Urgent mail is attempted on the next five-minute worker cycle if enabled. Daily summaries are prepared during the configured UTC hour. Mail failures remain visible and retry up to five attempts. SMTP delivery cannot guarantee exactly-once mail if a process stops after sending but before recording success.
- Exports respect current filters and are capped at 10,000 records. Formula-like spreadsheet cells are escaped. Save named filter views for later use.

## Production deployment with Docker Compose

1. Use a separate, empty live database. Set `APP_MODE=live`, `APP_URL=https://your-domain.example`, and `DATABASE_URL=postgresql://tracker:URL_ENCODED_PASSWORD@db:5432/tracker` in `.env`. Set `POSTGRES_PASSWORD` to the same raw database password. Keep `.env` mode 0600.
2. Verify the 17TRACK contract/account version as described above; set `TRACK17_API_KEY`, `TRACK17_API_VERSION` and only then the verification gate. Configure the provider webhook URL `https://your-domain.example/api/webhooks/17track` and test authentication, retries and acceptance with your account.
3. Configure SMTP with TLS (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, optionally `SMTP_USER`/`SMTP_PASSWORD`) and `EMAIL_FROM`, or configure `RESEND_API_KEY` and `EMAIL_FROM`. Set administrator recipients in Settings. No customer messaging is implemented.
4. Run `docker compose up -d --build`. The migration service must complete before web/worker start.
5. Create the administrator: `docker compose run --rm web npm run admin:create`. Remove `ADMIN_PASSWORD` after account creation and recreate services.
6. Put Caddy, nginx, or your host's TLS reverse proxy in front of `127.0.0.1:3000`. Forward the original host, configure HTTPS redirects, set request body limit to 10 MB and request timeout sufficient for imports. Set HSTS after HTTPS is verified. Do not expose PostgreSQL publicly. The application enforces same-origin mutation requests using `APP_URL`.
7. Check `docker compose logs worker`, `/api/health`, signed webhook acceptance and outbound email. Test a real shipment and confirm its checkpoints, exception notification and recovery flow. Monitor provider credits in your provider account; remaining credits are displayed as unavailable rather than fabricated.

For this managed cloud's Docker build proxy, provide the public session CA as a BuildKit secret: `docker build --secret id=proxy_ca,src="$CODEX_PROXY_CERT" -t parcelops:local .`. The Dockerfile uses it only during npm installation and keeps TLS verification enabled. For Compose, use an override defining the build secret; never bake session CA paths or credentials into the image. Dockerized runtime processes needing managed outbound HTTPS also require a read-only CA mount and `NODE_EXTRA_CA_CERTS` per the cloud runtime guidance.

## Security and operational limits

Passwords use bcrypt (cost 12); random opaque session tokens are hashed in PostgreSQL and expire after eight hours. Cookies are HttpOnly, SameSite=Lax, and Secure when APP_URL uses HTTPS. Mutating authenticated routes check Origin. Login and authenticated operations have database-backed rate limits; put additional source-IP limits on the reverse proxy. Account password changes invalidate all sessions. API secrets stay server-side; no browser API-key editor is provided. Admin routes require authentication, webhook routes require signatures. Do not log keys, session cookies or complete raw webhook payloads.

Registration outcomes, imports, webhook inbox, jobs and audit logs persist in PostgreSQL. Processed payloads expire after 30 days; failed payloads are retained for investigation and can be replayed from API & activity. pg-boss retains jobs for 14 days. Restrict database/backup access: shipment rows can include customer names. Configure infrastructure log retention and data deletion appropriate to your business.

One worker instance is the supported initial topology. pg-boss uses durable transactional jobs, but multiple independently running registration scanners are not yet verified for exactly-once external registration. Provider-supported duplicate-registration error handling and external registration identifiers require documentation/account confirmation. The starter uses the tracking number as correlation key; an opaque registration ID is not fabricated. Import confirmation uses a row lock for idempotent retries of the same job; simultaneous different files containing the same new tracking number can conflict safely and should be retried.

The overview filters by import date, carrier, country, marketplace and status. Charts show status distribution, carrier volume, completion rate, and daily delivered counts from recorded carrier event dates. They do not invent historical delivery-time estimates. Telegram, WhatsApp, Amazon SP-API, arbitrary carrier-specific extra fields and customer messages are outside this implementation. Alert priorities derive from rule severity and can be overridden per category in Settings. Default carrier detection can be automatic or require an official numeric carrier code.

## Backup and restore

Make encrypted off-host backups daily. Test restores regularly. A backup contains private shipment and administrator information. Restore commands below are instructions, not a claim that a production restore has been tested.

```sh
docker compose exec -T db pg_dump -U tracker -d tracker -Fc > tracker.dump
# Restore into a separately provisioned database (do not overwrite your live DB):
cat tracker.dump | docker compose exec -T db pg_restore -U tracker -d tracker_restore --no-owner --no-privileges
```

Provision `tracker_restore` first, use separate web/worker configuration to test it, check row counts, login, history and queue state, and stop its workers before reconnecting live provider credentials. Keep database credentials and environment settings in a secure secret manager separate from the dump. Avoid running two restored workers against the same provider/account until queued jobs are reviewed.

## Validation

```sh
npm run typecheck
npm test
npm run build
# Integration tests require a disposable PostgreSQL database named tracker_test:
DATABASE_URL=postgresql://.../tracker_test npm run db:migrate
DATABASE_URL=postgresql://.../tracker_test npm run test:integration
# E2E tests run against a running demo app/worker with a test admin:
E2E_ADMIN_PASSWORD='your-test-admin-password' npm run test:e2e
```

Prisma generation and migration commands use pinned official JavaScript/WASM packages through the small wrappers in `scripts/`, avoiding native-engine downloads. All packages remain lockfile-integrity verified; no checksum or TLS checks are disabled. Upgrade the Prisma tooling packages together and rerun migration repeatability checks.

Use a supported Chromium installation (`CHROMIUM_PATH`) or `npx playwright install chromium` before browser tests. Integration tests insert fixtures; use a disposable database and recreate it between runs. See `VALIDATION.md` for observed results and outstanding checks. Unit and integration fixtures do not prove the unverified provider contract or live mail delivery.
