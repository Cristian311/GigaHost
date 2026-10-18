# GigaHost

Game-server hosting platform (Minecraft, Rust, Valheim, CS2, Palworld, …). Players pick a game, drag sliders for RAM / vCPU / NVMe storage, choose a region and billing period, see the price live and deploy.

Full frontend and backend with a real database: accounts, orders, a billing engine with renewals and dunning, Stripe payments, transactional email and a server panel. **Provisioning is simulated** by a mock provider; real servers (Pterodactyl) plug in behind the same interface without changing the rest of the app. Payments are simulated too until `PAYMENT_PROVIDER=stripe` is set.

## Stack

| Layer      | Choice                                                                 |
| ---------- | ---------------------------------------------------------------------- |
| Framework  | Next.js 16 (App Router, Turbopack, Server Actions, Route Handlers)     |
| Language   | TypeScript                                                             |
| UI         | Tailwind CSS v4, shadcn/ui (Base UI), lucide-react, motion, recharts   |
| i18n       | next-intl (`/en`, `/ro`)                                                |
| Auth       | Auth.js v5 (email + password; Google/Discord ready via env vars)       |
| ORM / DB   | Prisma 7 (driver adapter) · MySQL / MariaDB                            |
| Validation | zod                                                                    |
| Tests      | vitest: unit + integration against a real MySQL database               |

## Quick start

You need a running MySQL or MariaDB. On Windows the one bundled with XAMPP works
as is — start **MySQL** in the XAMPP control panel; its `root` account has no
password, which is what `.env.example` assumes.

Create the two databases once (phpMyAdmin, or the CLI below):

```sql
CREATE DATABASE gigahost      CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE gigahost_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

```bash
npm install                 # also runs `prisma generate`
cp .env.example .env        # adjust DATABASE_URL if MySQL is not on localhost:3306
npx prisma migrate dev      # creates the tables
npm run db:seed             # games, regions, pricing, admin user
npm run dev                 # http://localhost:3000
```

Admin login after seeding: `admin@gigahost.local` / `admin1234` — development
only. In production the seed refuses to create it and wants `SEED_ADMIN_EMAIL`
and `SEED_ADMIN_PASSWORD` instead (see [Deploying](#deploying)).

The second database, `gigahost_test`, is only used by the integration tests,
which drop and rebuild it on every run. Browse the real data in phpMyAdmin
(`http://localhost/phpmyadmin`) or with `npm run db:studio`.

Useful scripts:

| Script                     | What it does                                        |
| -------------------------- | --------------------------------------------------- |
| `npm run dev`              | dev server                                          |
| `npm run build`            | production build                                    |
| `npm test`                 | all tests (unit + integration)                      |
| `npm run test:unit`        | pure-function tests only (pricing, proration)       |
| `npm run test:integration` | services + API against the `gigahost_test` database |
| `npm run typecheck`        | `tsc --noEmit`                                      |
| `npm run lint`             | eslint                                              |
| `npm run db:migrate`       | create + apply a migration (fixes table-name casing) |
| `npm run db:studio`        | Prisma Studio (browse the DB)                       |
| `npm run db:reset`         | drop, migrate and seed again                        |

## Tests

`npm test` runs two projects. **unit** covers the pure pricing and proration
engines. **integration** drops and recreates the `gigahost_test` database,
applies the schema, seeds the catalog and then exercises the real services and
route handlers: checkout, the server state machine, resizing with proration,
backups, the activity log, subscriptions, admin actions and the SEO routes.
Nothing is mocked except the session in `tests/integration/api.test.ts`.

The test database is taken from `TEST_DATABASE_URL` and the setup refuses to run
if it equals `DATABASE_URL`, so the development data can never be dropped by a
test run.

Time-based behaviour (installing, starting, backups completing) is tested by
moving `statusChangedAt` into the past rather than waiting, so the suite runs in
under 30 seconds.

## Architecture

```
src/
  app/[locale]/
    (marketing)/   landing, /games, /games/[slug], /configure
    (auth)/        /login, /register
    (app)/         /dashboard, /dashboard/servers/[id], /dashboard/billing, /account, /admin/*
  app/api/         REST endpoints (pricing, games, servers and their panel, orders, webhooks, cron, auth)
  components/      UI (landing, configurator, dashboard, admin, auth, layout)
  lib/pricing/     pure pricing engine + tests (integer cents)
  lib/validation/  zod schemas shared by actions and API routes
  server/
    actions/       Server Actions (forms & mutations)
    services/      business logic (pricing, orders, servers, users, admin)
    providers/     ServerProvider abstraction: MockProvider (now), PterodactylProvider (later)
    auth-guard.ts  requireUser / requireAdmin / getApiUser
  proxy.ts         locale routing + auth redirects
prisma/            schema, migrations, seed
```

**Provisioning abstraction.** Everything that talks to a game server goes through the `ServerProvider` interface (`src/server/providers/types.ts`). `MockProvider` simulates installs, starts and stops with lazy time-based transitions (INSTALLING → STOPPED after 10 s, STARTING → RUNNING after 5 s, …) and fakes usage graphs and console output. `SERVER_PROVIDER=pterodactyl` selects the real backend (see [Real servers](#real-servers-pterodactyl)).

**Pricing.** `calculatePrice()` is a pure function working in integer cents. The client uses it for the live preview; the server recomputes it on checkout, so a tampered total is never trusted.

**Money flow.** `createOrder` stores a PENDING order with a server-side price, `fulfilOrder` turns a paid order into a server, an invoice and a subscription. With the mock gateway both happen in one request; with a hosted gateway the customer is redirected and the webhook calls `fulfilOrder`, which is idempotent because gateways redeliver. Everything that moves money goes through the `PaymentProvider` interface (`src/server/payments/`), mirroring `ServerProvider`.

**Billing cycle.** `runBillingCycle()` (`src/server/services/renewal-service.ts`) renews subscriptions whose period ended, applying downgrade credit first; ends the ones the customer cancelled; retries failed charges once a day; suspends unpaid servers after 3 days and deletes them after 14 (`BILLING_POLICY` in `src/lib/constants.ts`). It decides everything from timestamps, so running it twice, or after an outage, is harmless. A period keeps a single invoice however many attempts it takes. Suspensions carry a reason: a BILLING suspension lifts itself when the money arrives, an ADMIN one never does.

Schedule `GET /api/cron/billing` hourly with `Authorization: Bearer $CRON_SECRET` (Vercel Cron sends that header on its own); the endpoint stays closed while the secret is unset. Locally, use **Admin → Billing → Run billing cycle now**.

**Stripe.** Set `PAYMENT_PROVIDER=stripe` with `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` (see `.env.example`). Stripe is used as a card processor only: GigaHost's own engine decides what is owed, so there are no Stripe Subscriptions to keep in sync. The first payment is a hosted Checkout Session that also saves the card (`setup_future_usage`); renewals and upgrades are off-session PaymentIntents charged by the billing cycle. A declined card makes a subscription past due, while a gateway outage is rethrown and simply retried by the next run, so nobody is marked past due for Stripe's downtime. The webhook (`/api/webhooks/stripe`) verifies the signature against the raw body and fulfils orders idempotently; the success page also verifies the session with Stripe directly, so checkout works locally even without `stripe listen`. Customers replace their card through Stripe's billing portal.

**Coupons.** Percentage or fixed, with a global cap, a per-customer cap, a minimum order and an expiry, managed under **Admin → Coupons**. A coupon discounts the first invoice only; the subscription renews at the regular price. The seed creates `WELCOME10`.

**Accounts and email.** New accounts get a confirmation link and cannot order until they use it (`REQUIRE_EMAIL_VERIFICATION`). Password reset links last an hour and work once; like verification tokens they are stored only as SHA-256 hashes, so a database leak does not hand out working links, and the reset form answers the same way whether or not the address has an account. Changing or resetting a password bumps `User.sessionVersion`; every JWT carries the version it was issued for and is re-checked on the server on each use, which is how sessions get revoked without a session table (the role is refreshed in the same query, so a demoted admin loses access at once).

Every email goes to the `EmailMessage` outbox first and is delivered through SMTP only when `SMTP_URL` is set. In development the outbox is the mailbox: **Admin → Emails** previews each message in an inert sandboxed frame and lists its links so you can follow them. Delivery failures are recorded on the row and never thrown, so a mail outage cannot fail a checkout or a renewal. Customers are told when an order is confirmed, a server is ready, a renewal was paid, a payment failed (once, not on every retry), a server was suspended or deleted, and when their password changes, in the language they use the site in.

**Rate limiting.** Fixed-window counters in the `RateLimit` table (`src/server/security/rate-limit.ts`), so limits hold across instances and restarts: login per address *and* account, sign-up, password reset per address and per mailbox, verification emails, checkout, and coupon lookups (codes are guessable). API responses carry `Retry-After`.

**Audit log.** Every successful admin mutation is recorded with the admin, their address and what changed (**Admin → Audit log**); failed or refused actions are not. The trail survives the deletion of the admin's account.

**Server panel.** Files, console commands, the player list and one-click add-ons all go through `ServerProvider`, so a real backend only has to implement the same methods (the Pterodactyl stub lists the Panel endpoint for each). The mock keeps its state in the database: a virtual file system per server (`ServerFile`, seeded per game with the server's own name and port in its config), and the commands a customer typed with the server's answers (`ConsoleEntry`). Servers created before the file manager existed get their files on first use.

Every path a client sends passes `normalizePath()` (`src/lib/files/path.ts`) before it reaches a provider. It rejects rather than repairs: `..`, absolute and Windows-style paths, backslashes, control characters including a null byte, names with leading or trailing spaces. Console commands and player names are held to a single line and a strict character set, so one request cannot carry a second command. `stop` and `restart` typed into the console go through the power state machine like the buttons do.

**Scheduled tasks.** Restart, backup or a console command, hourly, daily or weekly. Schedules are stored in UTC and the UI converts to and from the customer's time zone, day included (a local Sunday 01:00 can be Saturday in UTC). `computeNextRun()` is pure and always returns a moment after "now", so a task missed during an outage runs once, not once per missed slot. Automatic backups rotate among themselves and never delete a backup the customer made by hand; a scheduled restart does not start a server the customer has stopped. Schedule `GET /api/cron/tasks` every few minutes, with the same `CRON_SECRET` as the billing endpoint.

**Resizing.** Changing RAM, CPU or storage mid-period is priced by `prorate()`
(`src/lib/pricing/prorate.ts`): only the unused share of the paid period is
re-priced. Upgrades are invoiced immediately; downgrades are never refunded but
accumulate as `Subscription.creditCents` for the next renewal.

**Activity log.** Every meaningful change writes a `ServerEvent`
(`src/server/services/event-service.ts`): creation, the lazy state transitions,
restarts, resizes, backup operations, suspension and deletion.

## Real servers (Pterodactyl)

Minecraft Java (Paper and Vanilla) can run on real game servers through a Pterodactyl Panel + Wings node. For local testing, [infra/pterodactyl/README.md](infra/pterodactyl/README.md) sets both up in Docker on your PC; production only changes the URLs.

1. Set `SERVER_PROVIDER="pterodactyl"` and the `PTERODACTYL_*` variables in `.env` (the app refuses to boot with a clear message if one is missing).
2. In `/admin/games`, give each game its Pterodactyl nest and egg IDs; in `/admin/regions`, give each region a location ID. Games and regions without them are not offered.
3. The dashboard console streams from Wings over a websocket (`/api/servers/[id]/console/token`) and accepts commands.

Other games stay listed as "Coming soon" (`unavailableReason = "coming_soon"`).

Backups, the file manager, the player list and add-ons are still mock-only: `PterodactylProvider` throws `provider_unavailable` for those, and the Panel endpoint each one needs is listed in a comment on the class.

## Database notes

Prisma 7 talks to MySQL through a driver adapter. The Prisma CLI wants a
`mysql://` URL while the underlying driver only parses `mariadb://`, so
[db.ts](src/lib/db.ts) turns the single `DATABASE_URL` into pool options — one
setting in `.env`, both halves agree.

MySQL strings default to `VARCHAR(191)`, so free-text and JSON columns
(descriptions, `configSnapshot`, event `meta`, OAuth tokens) are declared
`@db.Text` in the schema. Those map to `text` on PostgreSQL too, so moving to
Postgres later is still `provider = "postgresql"`, the `@prisma/adapter-pg`
adapter in `db.ts`, a new `DATABASE_URL`, and a fresh `prisma migrate dev`.

Create migrations with `npm run db:migrate`, not `prisma migrate dev`. MySQL on
Windows folds table names to lower case, so a migration generated there says
``ALTER TABLE `order` `` for a table created as `Order`, which fails on Linux
where names are case sensitive. The script rewrites them to the casing of the
Prisma models, and a unit test fails if one slips through.

`docker-compose.yml` starts a MySQL 8.4 container for machines without XAMPP.

## Deploying

**GigaHost is not ready to take real money yet.** See
[PRODUCTION-READINESS.md](PRODUCTION-READINESS.md) for what is still missing —
most of it is legal and fiscal (terms, VAT, invoices), plus the Pterodactyl
features that still return `provider_unavailable`. What follows is the
mechanical part.

A VPS running `next start` behind Caddy or nginx fits better than a serverless
platform: the scheduler endpoints need a real cron, and each serverless instance
would open its own connection pool.

**1. Build.** `NEXT_PUBLIC_*` values are substituted into the bundle by
`next build`, so `NEXT_PUBLIC_APP_URL` must be set *before* it — setting it at
runtime changes nothing.

```bash
npm ci
NEXT_PUBLIC_APP_URL="https://your-domain" npm run build
```

**2. Configure.** With `NODE_ENV=production` the server refuses to start when a
setting would silently lose money or leak accounts — a placeholder `AUTH_SECRET`,
an `APP_URL` still on localhost, a missing `SMTP_URL` or `CRON_SECRET`, or either
provider left on `mock` (which hands out free servers). It lists every problem at
once; see the *Production start-up checks* block in `.env.example`.

**3. Migrate and seed.** Use `prisma migrate deploy`, never `migrate dev`:

```bash
npx prisma migrate deploy
SEED_ADMIN_EMAIL="you@your-domain" SEED_ADMIN_PASSWORD="..." npm run db:seed
```

The seed loads the catalog and creates one admin. In production it refuses to
run without those two variables, rather than creating the development login that
is published in this README.

**4. Schedule the two cron endpoints.** Nothing calls them on its own, and while
they are not called there are no renewals, no suspensions and no scheduled
tasks. They authenticate with `Authorization: Bearer $CRON_SECRET`.

```cron
0  * * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://your-domain/api/cron/billing
*/5 * * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://your-domain/api/cron/tasks
```

Neither takes a lock yet, so do not let two runs overlap.

**5. Monitor.** `GET /api/health` returns 200 only when the instance can reach
its database, and 503 otherwise. Point an uptime check at it. Errors in cron
runs, webhooks and mail currently go to stdout only, so keep the process logs.

**6. Back up the platform database.** A nightly `mysqldump` of the app database
is separate from any game-server backups the panel takes.

## Roadmap

- [x] Resource upgrades/downgrades with pro-rating
- [x] Backups (simulated) and a per-server activity log
- [x] Admin: all servers, suspension, regions
- [x] SEO: sitemap, robots, Open Graph images, hreflang alternates
- [x] Billing cycle: renewals, credit, retries, suspension and deletion for non-payment
- [x] Coupons
- [x] Stripe payments (hosted checkout, saved cards, signed webhooks, billing portal)
- [ ] `PterodactylProvider` (Panel Application API + Wings nodes)
- [x] Server panel: file manager, console commands, players, one-click mods and plugins, scheduled tasks
- [x] Email verification, password reset, transactional emails with a development outbox
- [x] Rate limiting, session revocation and an admin audit log

> Roblox is listed in the catalog as **unavailable**: Roblox does not allow third-party hosting of experiences.
