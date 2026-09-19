# GigaHost

Game-server hosting platform (Minecraft, Rust, Valheim, CS2, Palworld, …). Players pick a game, drag sliders for RAM / vCPU / NVMe storage, choose a region and billing period, see the price live and deploy.

**Phase 1 (this repo):** full frontend + backend with a real database, authentication, orders and a dashboard, but with **simulated provisioning** and **simulated payments**. Real servers (Pterodactyl) and Stripe plug in later without changing the rest of the app.

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
| Tests      | vitest (pricing engine)                                                |

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

Admin login after seeding: `admin@gigahost.local` / `admin1234`.

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
  app/api/         REST endpoints (pricing quote, games, servers, power, usage, console, orders, auth)
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

**Provisioning abstraction.** Everything that talks to a game server goes through the `ServerProvider` interface (`src/server/providers/types.ts`). `MockProvider` simulates installs, starts and stops with lazy time-based transitions (INSTALLING → STOPPED after 10 s, STARTING → RUNNING after 5 s, …) and fakes usage graphs and console output. `SERVER_PROVIDER=pterodactyl` selects the stub that will call the Pterodactyl Panel API.

**Pricing.** `calculatePrice()` is a pure function working in integer cents. The client uses it for the live preview; the server recomputes it on checkout, so a tampered total is never trusted.

**Money flow (simulated).** Checkout → Order (PAID) → Invoice (PAID) → Server provisioned → Subscription (ACTIVE). Replacing the "mark as paid" step with a Stripe webhook is the only change needed for real payments.

**Resizing.** Changing RAM, CPU or storage mid-period is priced by `prorate()`
(`src/lib/pricing/prorate.ts`): only the unused share of the paid period is
re-priced. Upgrades are invoiced immediately; downgrades are never refunded but
accumulate as `Subscription.creditCents` for the next renewal.

**Activity log.** Every meaningful change writes a `ServerEvent`
(`src/server/services/event-service.ts`): creation, the lazy state transitions,
restarts, resizes, backup operations, suspension and deletion.

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

`docker-compose.yml` starts a MySQL 8.4 container for machines without XAMPP.

## Roadmap

- [x] Resource upgrades/downgrades with pro-rating
- [x] Backups (simulated) and a per-server activity log
- [x] Admin: all servers, suspension, regions
- [x] SEO: sitemap, robots, Open Graph images, hreflang alternates
- [ ] Stripe Checkout + webhooks (replace mock checkout in `order-service.ts`)
- [ ] `PterodactylProvider` (Panel Application API + Wings nodes)
- [ ] File manager and scheduled tasks
- [ ] Email verification & password reset
- [ ] Rate limiting and audit logs

> Roblox is listed in the catalog as **unavailable**: Roblox does not allow third-party hosting of experiences.
