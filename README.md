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
| ORM / DB   | Prisma 7 · SQLite for local dev · PostgreSQL for production            |
| Validation | zod                                                                    |
| Tests      | vitest (pricing engine)                                                |

## Quick start

```bash
npm install                 # also runs `prisma generate`
cp .env.example .env        # defaults work out of the box (SQLite)
npx prisma migrate dev      # creates dev.db and applies migrations
npm run db:seed             # games, regions, pricing, admin user
npm run dev                 # http://localhost:3000
```

Admin login after seeding: `admin@gigahost.local` / `admin1234`.

Useful scripts:

| Script              | What it does                                  |
| ------------------- | --------------------------------------------- |
| `npm run dev`       | dev server                                    |
| `npm run build`     | production build                              |
| `npm run test`      | vitest unit tests                             |
| `npm run typecheck` | `tsc --noEmit`                                |
| `npm run lint`      | eslint                                        |
| `npm run db:studio` | Prisma Studio (browse the DB)                 |
| `npm run db:reset`  | drop, migrate and seed again                  |

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

## Real servers (Pterodactyl)

Minecraft Java (Paper and Vanilla) can run on real game servers through a Pterodactyl Panel + Wings node. For local testing, [infra/pterodactyl/README.md](infra/pterodactyl/README.md) sets both up in Docker on your PC; production only changes the URLs.

1. Set `SERVER_PROVIDER="pterodactyl"` and the `PTERODACTYL_*` variables in `.env` (the app refuses to boot with a clear message if one is missing).
2. In `/admin/games`, give each game its Pterodactyl nest and egg IDs; in `/admin/regions`, give each region a location ID. Games and regions without them are not offered.
3. The dashboard console streams from Wings over a websocket (`/api/servers/[id]/console/token`) and accepts commands.

Other games stay listed as "Coming soon" (`unavailableReason = "coming_soon"`).

## Switching to PostgreSQL

1. `docker compose up -d` (or any Postgres instance)
2. In `prisma/schema.prisma` change `provider = "sqlite"` to `provider = "postgresql"`
3. In `src/lib/db.ts` swap `PrismaBetterSqlite3` for `PrismaPg` from `@prisma/adapter-pg` (already installed)
4. Set `DATABASE_URL="postgresql://gigahost:gigahost@localhost:5432/gigahost"`
5. Delete `prisma/migrations` and run `npx prisma migrate dev --name init`, then `npm run db:seed`

## Roadmap

- [ ] Stripe Checkout + webhooks (replace mock checkout in `order-service.ts`)
- [ ] `PterodactylProvider` (Panel Application API + Wings nodes)
- [ ] Resource upgrades/downgrades with pro-rating
- [ ] Backups, file manager, scheduled tasks
- [ ] Email verification & password reset
- [ ] Rate limiting and audit logs

> Roblox is listed in the catalog as **unavailable**: Roblox does not allow third-party hosting of experiences.
