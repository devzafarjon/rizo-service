# Rizo FSM

Internal field service app for Rizo: dispatch technicians to shops, track visits on a phone, then invoice labor and parts.

The UI follows [rizo.uz](https://rizo.uz) (Inter, purple `#B439FD`, floating header). Language can be switched between **UZ**, **EN**, and **RU**.

## Stack

| Layer | Tech |
| --- | --- |
| App | React 19, Vite, TypeScript, Tailwind CSS 4, React Router, TanStack Query |
| API | Node.js, Express, Prisma, JWT (admin / dispatcher / technician) |
| Database | PostgreSQL |

Monorepo: `client/` + `server/`.

## Features

**Admin and dispatcher**

- Dashboard: open jobs, today’s jobs, overdue, unassigned, urgent, amount to collect
- Customers and service locations
- Jobs: create, assign, start/complete, notes, photos, parts
- Dispatch board: drag a job onto a technician, or use **Auto plan** (phones can assign from the dropdown)
- Invoices from completed jobs (labor + parts), mark sent or paid, print

**Technician (phone browser)**

- My jobs for today, upcoming, and done
- Start / complete, maps, call customer, notes, photos, parts used

Labor is billed at **150,000 so‘m per hour**. Hours come from time on site (capped at 8h), otherwise the scheduled slot, otherwise 1 hour.

## Setup

Needs Node.js 20+ and PostgreSQL.

1. Install dependencies:

```bash
npm install
```

2. Database. Either use local Postgres on port **5432** (user/db `fsm` / `fsm`), or Docker on **5433**:

```bash
npm run db:up
```

3. Copy env and point `DATABASE_URL` at your Postgres:

```bash
cp server/.env.example server/.env
```

Local Postgres (default):

```
DATABASE_URL="postgresql://fsm:fsm@localhost:5432/fsm?schema=public"
```

Docker Compose:

```
DATABASE_URL="postgresql://fsm:fsm@localhost:5433/fsm?schema=public"
```

4. Migrate, seed, run:

```bash
npm run db:migrate
npm run db:seed
npm run dev
```

- App: http://localhost:5173
- API health: http://localhost:4000/api/health

Vite proxies `/api` and `/socket.io` to the API, so the browser only needs port 5173.

## Demo accounts

Password for every account: `password123`

| Role | Email |
| --- | --- |
| Admin | `admin@rizo.local` |
| Dispatcher | `dispatcher@rizo.local` |
| Technician | `tech@rizo.local` |
| Technician | `tech2@rizo.local` |

Seed data is Tashkent shops (kassa, scanner, scales) with jobs for today, yesterday, and tomorrow.

Reset the database and re-seed:

```bash
npm run db:reset
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | API + Vite together |
| `npm run dev:client` | Vite only (port 5173) |
| `npm run dev:server` | Express only (port 4000) |
| `npm run db:up` | Postgres in Docker (host port 5433) |
| `npm run db:migrate` | Prisma migrate |
| `npm run db:seed` | Demo users, customers, jobs |
| `npm run db:reset` | Drop, migrate, seed |

## Project layout

```
client/                 React app
  src/features/         auth, dashboard, customers, jobs, dispatch, invoices, technician
  src/i18n/             UZ / EN / RU
server/
  prisma/               schema + seed
  src/routes/           REST API
```

## Roles

| | Admin / dispatcher | Technician |
| --- | --- | --- |
| Dashboard, customers, dispatch, invoices | Yes | No |
| Create / edit jobs | Yes | No |
| Own assigned jobs | Yes | Yes |
| Start / complete, notes, photos, parts | Yes | Yes |
