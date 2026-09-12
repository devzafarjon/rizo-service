# Rizo FSM

Internal **field service** app for Rizo. Dispatchers plan shop visits; technicians run those visits from a phone browser; the office then invoices labor and parts.

The product is **browser-only** (no native app). The technician screens must stay usable on a phone.

UI follows [rizo.uz](https://rizo.uz): Inter, purple `#B439FD`, white pages, **floating top header** (no left sidebar). Languages: **UZ / EN / RU**. Calendar dates use **Asia/Tashkent**.

## Who uses it

There is **no admin role**. Do not add one back. JWT tokens that still say `admin` are treated as `dispatcher`.

| Role | Who | What they see |
| --- | --- | --- |
| **Dispatcher** | Office | Dashboard, customers, jobs, dispatch, invoices, feedback |
| **Technician** | Field | `/my-jobs` only — start/complete, maps, call, checklist, notes, photos, parts |
| **Shop (portal)** | Customer | `/portal` — own requests, new repair/maintenance request, rating after a finished visit |

Dispatchers can still open a job and add notes / photos / parts. Only they can create, edit, assign, cancel, or invoice jobs.

After login:

- dispatcher → `/dashboard`
- technician → `/my-jobs`

## Service types (`Job.kind`)

| Kind | When | Extra fields |
| --- | --- | --- |
| **installation** | Shop ordered Rizo (kassa, printer, scanner, loyalty) and the kit needs installing | Optional `orderRef` |
| **maintenance** | Planned visit on that shop’s interval (default **every 3 months**) | Completing a maintenance job sets `Customer.nextMaintenanceOn` to today + interval (Tashkent calendar) |
| **repair** | Break/fix | Default kind |

Each kind has a **fixed checklist**. IDs live in `server/src/lib/checklists.ts`; labels live in `client/src/i18n/messages.ts` under `checklist.*`. If you add a checklist step, update **both**.

## Job status flow

```
new → scheduled → in_progress → completed → invoiced
         ↘           ↘              ↘
           cancelled (from new / scheduled / in_progress)
```

- **new** — created, not on the board yet
- **scheduled** — has a technician (and usually a date). Clearing the date or unassigning sends it back to `new`
- **in_progress** — technician started; `startedAt` is set. Unassigning also returns it to `new` and clears `startedAt`
- **completed** — `completedAt` + `laborHours` are set. Ready to invoice
- **cancelled** / **invoiced** — **closed**. No PATCH, no notes/photos/parts/checklist. The edit URL redirects to the job detail

Transitions are enforced in `server/src/lib/jobs.ts` (`canTransition`). Do not skip steps from the API.

## Billing

Labor rate is **150,000 so‘m / hour**, duplicated in:

- `server/src/lib/money.ts` (`LABOR_RATE`)
- `client/src/lib/invoice.ts`
- `client/src/components/JobWorkspace.tsx`

Change all three together.

Hours when a job is completed:

1. Time on site (`startedAt` → now), if between 0 and **8 hours**
2. Else the scheduled time slot (minimum 30 minutes)
3. Else **1 hour**

Invoice total = labor hours × rate + parts (`quantity × unitCost`). Creating an invoice from a completed job moves the job to `invoiced`. Invoice statuses: `draft` → `sent` → `paid`.

## Stack

npm workspaces: `client/` + `server/`.

| Layer | Tech |
| --- | --- |
| App | React 19, Vite 8, TypeScript, Tailwind CSS 4, React Router 7, TanStack Query |
| API | Node.js, Express 5, Prisma 6, JWT, Zod, Socket.io |
| Database | PostgreSQL 16 |

The Vite dev server **must** be on port **5173** (`strictPort: true`). It proxies `/api` and `/socket.io` to the API on **4000**, so you only open the app URL in the browser.

Socket.io is wired on the **server** (`job:updated` after writes). The **client does not subscribe**; lists poll every 4–5 seconds instead. `socket.io-client` is installed but unused.

## Setup

Needs **Node.js 20+** and PostgreSQL.

1. Install:

```bash
npm install
```

2. Database — either local Postgres on **5432** (user/db `fsm` / `fsm`), or Docker on **5433**:

```bash
npm run db:up
```

3. Env:

```bash
cp server/.env.example server/.env
```

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Prisma connection string |
| `JWT_SECRET` | Required. Tokens last **7 days** |
| `PORT` | API port (default `4000`) |
| `CLIENT_ORIGIN` | CORS origin (default `http://localhost:5173`) |

Local Postgres:

```
DATABASE_URL="postgresql://fsm:fsm@localhost:5432/fsm?schema=public"
```

Docker Compose (`docker compose up -d`):

```
DATABASE_URL="postgresql://fsm:fsm@localhost:5433/fsm?schema=public"
```

Host **5433** maps to Postgres **5432** inside the container so it does not clash with a local install.

4. Migrate, seed, run:

```bash
npm run db:migrate
npm run db:seed
npm run dev
```

- App: http://localhost:5173
- API health: http://localhost:4000/api/health

First Prisma migrate will prompt for a migration name if the database is empty; after that `npm run db:migrate` applies existing files in `server/prisma/migrations/`.

### Demo accounts

Password for every account: `password123`

| Role | Email |
| --- | --- |
| Dispatcher | `dispatcher@rizo.local` |
| Technician | `tech@rizo.local` |
| Technician | `tech2@rizo.local` |

There is **no** `admin@rizo.local`. Seed data is Tashkent shops with jobs for today, yesterday, and tomorrow.

Shop portal (separate login, separate JWT):

| Who | Email |
| --- | --- |
| Baraka Market | `baraka@shop.uz` |

Open http://localhost:5173/portal/login. Staff tokens (`fsm_token`) cannot call portal APIs; portal tokens (`fsm_portal_token`, JWT `aud=portal` + `scope=customer`) cannot call staff APIs.

Wipe and re-seed:

```bash
npm run db:reset
```

That drops the public schema, reapplies migrations, and runs `server/prisma/seed.ts`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | API (`tsx watch`) + Vite together |
| `npm run dev:client` | Vite only — still needs the API for `/api` |
| `npm run dev:server` | Express only |
| `npm run db:up` | Postgres in Docker (host port 5433) |
| `npm run db:migrate` | `prisma migrate dev` in `server/` |
| `npm run db:seed` | Demo users, customers, jobs |
| `npm run db:reset` | Drop, migrate, seed |
| `npm run build -w client` | Production client build |
| `npm run build -w server` | Compile API to `server/dist` |

## Repo map

```
client/
  public/rizo-logo.png
  src/
    App.tsx                 Routes + role gates
    index.css               Design tokens (`--color-rizo`, Inter)
    components/             Shared UI, job workspace, shell, toast
    features/
      auth/                 Login, JWT in localStorage (`fsm_token`)
      customer-portal/      Shop portal (`/portal`, token `fsm_portal_token`)
      dashboard/
      customers/
      jobs/
      dispatch/             Drag-and-drop + Auto plan
      invoices/
      feedback/             Shop ratings (dispatcher)
      technician/           Phone field view
    i18n/                   messages.ts + LanguageContext (`fsm_lang`)
    lib/api.ts              fetch wrapper → `/api...`
server/
  prisma/
    schema.prisma
    seed.ts
    migrations/
  src/
    index.ts                Express + Socket.io
    routes/                 REST
    lib/
      jobs.ts               Status rules, serialize, emit
      checklists.ts
      money.ts              Labor hours + invoice total
      jwt.ts
      customer-jwt.ts       Portal tokens (`aud=portal`)
```

Path alias on the client: `@/` → `client/src/`. Server files import with `.ts` extensions (tsx).

## API

All JSON under `/api`. Send `Authorization: Bearer <token>` except `POST /api/auth/login`, portal auth (`POST /api/portal/auth/login|signup|forgot|reset|verify`), and `GET /api/health`.

| Area | Endpoints |
| --- | --- |
| Auth | `POST /auth/login`, `GET /auth/me` |
| Customers | `GET/POST /customers`, `GET/PATCH/DELETE /customers/:id`, `POST /customers/:id/locations` |
| Jobs | `GET/POST /jobs`, `GET/PATCH /jobs/:id`, `POST /jobs/:id/status`, `/notes`, `/checklist`, `/photos`, `/parts` |
| Dispatch | `GET /dispatch?date=YYYY-MM-DD`, `GET /dispatch/technicians`, `POST /dispatch/auto-plan` |
| Invoices | `GET/POST /invoices`, `GET/PATCH /invoices/:id` |
| Dashboard | `GET /dashboard` |
| Feedback | `GET /feedback` (dispatcher) |
| Portal auth | `POST /portal/auth/login`, `/signup`, `/forgot`, `/reset`, `/verify`; `GET /portal/auth/me` |
| Portal | `GET/POST /portal/jobs`, `GET /portal/jobs/:id`, `POST /portal/jobs/:id/feedback`, `GET /portal/sales` |

Who can call what (server):

- **Customers, dashboard, dispatch, invoices** — dispatcher only (`requireRole("dispatcher")` on those routers)
- **Create / PATCH jobs** — dispatcher
- **Status, notes, checklist, photos, parts** — dispatcher, or the assigned technician
- Photos are stored as **data URLs** in Postgres (JSON body limit **2mb**)

You cannot delete a customer who still has jobs.

**Auto plan** (`POST /api/dispatch/auto-plan` with `{ date }`) assigns unassigned jobs for that day (or with no date) round-robin to the technician with the fewest jobs that day, then sets status `scheduled`.

## Client conventions

- Auth token: `localStorage.fsm_token`. Portal token: `localStorage.fsm_portal_token`. Language: `localStorage.fsm_lang` (`uz` default).
- Copy: add the same key to **uz, en, and ru** in `client/src/i18n/messages.ts`. Use `t("key")` / `t("key", { name })` for `{name}` placeholders.
- Buttons: primary `bg-[#B439FD] hover:bg-[#CA73FD] rounded-lg`; ghost `bg-gray-100 text-[#B439FD]`.
- Keep the **floating header** (`md:rounded-2xl`). Do not add a left sidebar.
- Tokens in `client/src/index.css`: `--color-rizo` `#B439FD`, hover `#CA73FD`, nav hover `#9103E4`.
- Logo: `client/public/rizo-logo.png`.
- Closed jobs: hide add forms and disable the checklist (`isClosedJob` in `client/src/lib/format.ts`).
- Failed queries should use `LoadError`, not an infinite spinner.

## Domain model (Prisma)

- **User** — `dispatcher` \| `technician` (the DB enum also has unused `order_service` from an earlier migration; do not wire it unless asked)
- **Customer** — shop; `maintenanceIntervalMonths` (default 3), `nextMaintenanceOn`; portal login uses `passwordHash` + `emailVerified` (email is unique when set)
- **ServiceLocation** — address / city / optional lat,lng (maps link)
- **Job** — kind, status, priority (`low` \| `medium` \| `high` \| `urgent`), schedule, checklist JSON, labor hours; `submittedByCustomer` marks portal-created jobs (still status `new` so they land in the staff queue)
- **JobNote / JobPhoto / PartUsed** — notes can be `visibleToCustomer`
- **Sale** — a shop’s past purchase; portal new-request form can link a job to one
- **Feedback** — one rating (1–5) + optional comment per finished job
- **CustomerAuthToken** — hashed email verify / password reset tokens
- **Invoice** — one per invoicing action; job then becomes `invoiced`

## Customer portal

Separate app under `/portal` (own layout, own JWT). Shops sign up with email + password. Signup links to an existing **Customer** by email or phone; otherwise it creates a shop + location.

- Dashboard: that shop’s jobs only; filter active / finished and by type. Friendly status copy (e.g. “Your repair is in progress”).
- Detail: type, status, schedule, technician **first name only**, customer-visible notes, payment if sent/paid or the visit is finished. No staff notes, no technician contact, no other shops.
- New request: repair or maintenance (not installation). Pick a past sale or “other”. Created as `new` + `submittedByCustomer`.
- Rating: after `completed` / `invoiced`, 1–5 stars + optional comment. Dispatcher **Feedback** page shows overall and per-technician averages.

Forgot password logs a reset URL; in non-production the API also returns `resetUrl`.

## If something fails locally

- **Vite “port 5173 already in use”** — something else is on 5173; this project will not pick another port.
- **API not reachable from the UI** — run both (`npm run dev`), or start the API on 4000. The browser talks to Vite, not to 4000 directly.
- **Prisma P1000 / auth** — `DATABASE_URL` user/password/db must exist. Docker uses port **5433**, local often **5432**.
- **JWT_SECRET is not set** — copy `server/.env.example` to `server/.env`.
- **Stuck on old admin login** — that user was removed; use `dispatcher@rizo.local`. Clear `fsm_token` if an old token is stored.

## What not to do

- Do not reintroduce an **admin** role or `admin@rizo.local`.
- Do not skip job status transitions or edit **cancelled / invoiced** jobs.
- Do not put checklist labels only in one language, or only in the server IDs file.
- Do not change the labor rate in only one of the three files listed above.
- Do not assume live Socket.io on the client — until someone wires `socket.io-client`, keep polling or you will ship a silent board.
