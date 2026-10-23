# Unified Directory Structure

```text
BHAIRAVA-UNIFIED/
  server.js                  One Express listener, one port
  server/main.mjs            Main API + static request handler, SQLite migrations
  server/api.mjs             Preserved main API
  public/main/               Latest integrate25 frontend and assets
  payment/handler.mjs        Payment API and protected admin handler; no listener
  payment/public/            Payment HTML, admin HTML, QR and background
  drizzle/                   All five main database migrations
  scripts/                   Build check, recovery, local admin provisioning
  tests/                     Original checks + unified HTTP integration check
  docs/FILE-MAP.csv           Source entry to unified destination decisions
  docs/DIRECTORY-TREE.txt     Complete deployable file listing
  docs/legacy/               Original documentation, reference only
  package.json / package-lock.json
  Dockerfile / compose.yaml / .env.example
  data/                      Created at startup; persist outside repository
    demo.sqlite              Main database
    payment/payments.json    Payment request records
```

# Server Routing Pipeline check

- `/` and main assets -> public/main, main API `/api/*` -> server/api.mjs.
- `/payment` -> 308 `/payment/`; `/payment/*` -> payment handler with prefix removed internally.
- `/payment/api/payments` -> submissions; `/payment/api/payments/:id` -> bearer-token status lookup.
- `/payment/admin` and `/payment/api/admin/*` -> payment password authentication.
- `/payment/payment-status` -> payment status page, including direct navigation/reload.
- `/healthz` -> process health; `/api/health` -> original main demo database/game health.
- Payment HTML uses `<base href="/payment/">`; API/history/navigation URLs use `/payment/`.
- Payment admin cookie uses `payment_adm` and Path=/payment/. Main session cookies retain original behavior.
- Exactly one Express process and listener; no reverse proxy between components. No separate payment package or dependency tree.
- Main SQLite requests are serialized to prevent async transaction interleaving in the existing adapter.

```js
// Already implemented in server.js, before the main handler:
app.use((req, res, next) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/payment') return res.redirect(308, '/payment/' + new URL(req.url,'http://localhost').search);
  if (!pathname.startsWith('/payment/')) return next();
  req.url = req.url.slice('/payment'.length);
  return handlePayment(req, res);
});
```

# Deployment

1. Use Node 24 or later. Extract this repository as one application root.
2. Copy .env.example to .env. Set ADMIN_PASSWORD (at least 8 characters) and SESSION_SECRET (random 32-byte value). PORT defaults to 3000. DATA_DIR defaults to ./data.
3. Run `npm ci`, `npm run build`, `npm test`, then `npm start`.
4. For Docker: create .env first, then `docker compose up --build -d`. The named volume stores both databases.
5. Route the entire domain through HTTPS to port 3000. Preserve Host and Origin. The original main session uses a Secure cookie and requires HTTPS for normal browser account flows. Set SECURE_COOKIE=1 in production. Set TRUST_PROXY=1 only behind your controlled proxy that overwrites X-Forwarded-For; restrict direct access to port 3000.
6. Payment owner signs in at /payment/admin. The main site has its own existing account roles: register your account, stop the server, run `npm run promote-admin -- your@email.example`, restart and sign in again. ADMIN_EMAIL reserves an owner address against public signup; leave it empty during initial registration, then set it if desired.
7. Run one application replica/worker. The original payment JSON store is process-local; do not use clustered workers or multiple replicas. Back up the complete DATA_DIR while stopped, or use a consistent SQLite backup plus payment JSON snapshot.

# Merge decisions and validation

1.zip and 2.zip contain overlapping historical releases, not independent deployable services. The latest integrate25 snapshot in 1.zip supplies the frontend. 3.zip's nested platform-source supplies source API, migrations, tests and supporting files; its API matches the latest compiled worker after normalization. Earlier 2.zip assets are already present in the latest release. Historical copies, exported database records, base64 download chunks, duplicate compiled Worker trees, dependencies and caches are excluded from the active deployment. FILE-MAP.csv enumerates all 2,359 archive entries and decisions; DIRECTORY-TREE.txt lists actual packaged paths.

Verified locally with Node 24.19.0: build file checks pass; 50/50 tests pass, including original backend/frontend checks and live same-port payment submission, retry, status lookup, unauthorized rejection, scoped cookie, admin login and approval. Original tests were pointed at public/main; the health fixture removes unrelated historical empty rounds to isolate its overdue-round assertion.

Payment approvals record a manually reviewed UPI request. They do not verify bank settlement or credit the main site's virtual coin wallet. The main API's `payments:false` refers to game wallet functionality; the namespaced payment request service is active. Existing payment recipient and QR assets are preserved.

Repository is ready for the single-server startup described above. Docker image build, your production domain/TLS, live bank settlement, browser UPI app handoff, load capacity and production deployment have not been validated. Original docs are retained under docs/legacy as reference; use this README for this unified deployment.

# Persistence and build pipeline update

`npm run build` executes scripts/build-check.mjs. It validates files, migrations and JavaScript syntax without starting the app or creating database files. scripts/build-backend.mjs is retained as a compatibility alias.

server.js resolves DATA_DIR from the application root, creates both DATA_DIR and DATA_DIR/payment, and probes write access before dynamically importing the SQLite and JSON handlers. A non-writable mount fails startup with its path and an ownership hint. This cannot override filesystem permissions; custom bind mounts must be writable by container UID/GID 1000:1000.

The multi-stage Docker image installs only production dependencies, verifies the app, runs as the node user, initializes /data permissions and includes an HTTP health check. Compose mounts the original website-data volume at /data, retaining demo.sqlite, its SQLite WAL/SHM files, and payment/payments.json together. Keep the same Compose project name and volume when upgrading. Normal container restart/recreation preserves this volume. Do not use `docker compose down -v`, volume prune, or delete the host volume if you intend to retain its contents. A persistent volume is not a backup: retain a separate consistent backup.

Use one container instance. Local SQLite plus a process-local JSON store requires persistent single-server hosting. This repository is not suitable for Vercel Functions without migrating both stores to external persistent services; a successful build alone does not make local storage durable there. References: https://docs.docker.com/engine/storage/volumes/ and https://vercel.com/docs/functions/runtimes#file-system-support.

Verification: 50/50 tests pass, including fresh nested-directory startup, both stores surviving a full process restart, and a build failure on a missing required file. Compose configuration validates successfully using example environment settings. The Docker daemon was unavailable, so image build and container/volume restart testing were not executed.
