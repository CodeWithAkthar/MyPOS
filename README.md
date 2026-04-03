# POS Backend

A production-oriented **Point of Sale (POS) REST API** for restaurants and retail chains. It models organizations from **company → brand → outlet**, manages floor plans and tables, full **menu** and **ordering** flows, **business-day** cash control, **expenses**, and rich **sales analytics**—with **JWT-based auth**, **role-based access**, and first-class **observability**.

Built with **Node.js**, **Express 5**, **TypeScript**, and **MongoDB** (Mongoose), following a clear controller / service / repository layout.

---

## What is this project?

This repository is the **backend service** for a multi-outlet POS product. Front-end clients (POS terminals, waiter apps, admin dashboards) call it to:

- Authenticate staff and attach them to a company, brand, and outlet.
- Maintain catalog data (menu categories, items, order types) and physical layout (floors, tables).
- Create and lifecycle-manage **orders** (including payment settlement, voids, and cancellation reasons).
- Run the **business day** (open/close, balances, aggregated totals).
- Record **expenses** and generate **sales & margin** reports.

The API is documented with **OpenAPI 3** (see [API documentation](#api-documentation) below). Swagger notes describe **role-based visibility**: for example, **waiters** typically see orders they took, while **cashiers** and **admins** see broader outlet-scoped data—reports and history respect that model.

---

## Features

### Business & domain

| Area | Capabilities |
|------|----------------|
| **Tenancy** | Companies, brands, and outlets—users are scoped to org hierarchy. |
| **Venue layout** | Floors and tables for dine-in / service mapping. |
| **Catalog** | Menu categories, menu items (with images via uploads), configurable order types. |
| **Orders** | Full order lifecycle, line items, statuses, payment settlement (cash / card / UPI), voids, cancel reasons. |
| **Operations** | Business days with opening/closing balances, rolling totals (sales, discounts, delivery, expenses, variance). |
| **Finance** | Expense categories and expenses; sales reports, category/item reports, margins, daily/hourly views, void summaries. |
| **Users** | Sign-in, logout, user CRUD; roles **admin**, **cashier**, **waiter** with route-level guards. |

### Platform & quality

| Area | Details |
|------|---------|
| **Security** | JWT access tokens (Authorization header or cookie), bcrypt password hashing, **Helmet** HTTP hardening, **CORS** (configurable origins in code), inactive company/brand/outlet checks for authenticated users. |
| **Resilience** | Graceful shutdown with configurable timeout; request correlation via **request ID** middleware. |
| **Observability** | **OpenTelemetry** (auto-instrumentation, MongoDB detail, Winston log correlation), OTLP trace/log export; **Winston** logging with structured/json options; **Morgan** HTTP logging; **Prometheus**-style metrics via `prom-client` (histograms, counters, gauges—endpoint wiring may be extended as needed). |
| **Media** | **AWS S3** presigned URLs for secure client uploads (`/uploads/upload-url`). |
| **DX** | **OpenAPI** spec served as JSON; **Vitest** for tests; **ESLint** + Prettier; TypeScript throughout. |

---

## Tech stack

- **Runtime**: Node.js 20+ (Dockerfile); dev server commonly uses **Bun** with watch (`npm run dev`).
- **Framework**: Express 5.
- **Data**: MongoDB via Mongoose; pagination utilities and shared validators.
- **Build**: **esbuild** bundles `src/index.ts` to `build/` for production.
- **Process management**: **PM2** cluster mode in container (`ecosystem.config.js`).

---

## Project structure (high level)

```
src/
├── controllers/     # HTTP handlers
├── routers/         # Route definitions (mounted in index.ts)
├── services/        # DB, JWT, S3, logging, metrics, shutdown, etc.
├── models/          # Mongoose models & schemas
├── repository/      # Data access
├── middlewares/     # Auth, errors, request id, etc.
├── types/           # Shared TypeScript types
├── utils/           # Pagination, validation, plugins
├── swagger.ts       # OpenAPI definition
└── instrumentation.ts  # OpenTelemetry bootstrap
```

---

## Prerequisites

- **Node.js** 20+ (aligned with Docker)
- **MongoDB** (local or Atlas)
- **pnpm** (lockfile provided; `npm` / `yarn` work if you adapt installs)
- Optional: **Bun** for the default dev script; **AWS** credentials for S3 uploads; an **OTLP** collector for traces/logs

---

## Installation

```bash
git clone <your-repo-url>
cd pos-backend-main
pnpm install
```

---

## Environment variables

Create a `.env` in the project root. Common variables:

| Variable | Purpose |
|----------|---------|
| `PORT` | HTTP port (default **5500** in `config.ts`) |
| `NODE_ENV` | e.g. `DEV` or `PRODUCTION` |
| `MONGODB_URL` | MongoDB connection string (default `mongodb://localhost:27017/pos-backend`) |
| `ACCESS_TOKEN_SECRET` | Secret for signing JWTs (**change in production**) |
| `SHUTDOWN_TIMEOUT_MS` | Graceful shutdown window (default `10000`) |
| `LOG_FORMAT` | `dev`, `json`, or `auto` |
| `DEFAULT_PAGE`, `DEFAULT_PAGE_SIZE`, `MAX_PAGE_SIZE` | List pagination defaults |
| `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` (or `AWS_*`) | S3 presigned uploads |
| `S3_PUBLIC_BASE_URL` | Optional CDN or public bucket URL for assets |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Base URL for OTLP traces (e.g. `http://localhost:4318`) |
| `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` | OTLP logs endpoint if different |
| `OTEL_SERVICE_NAME` | Service name in telemetry |

**CORS** allowed origins are defined in `src/config.ts`; adjust for your front-end domains when deploying.

---

## Running locally

```bash
# Development (Bun + watch + instrumentation preload — see package.json)
pnpm run dev

# Alternative Node path with nodemon + esbuild (see package.json)
pnpm run dev-node

# Production bundle
pnpm run build
node build/index.js
```

Default port is **5500** unless `PORT` is set.

---

## API documentation

When the server is running, the **OpenAPI 3** specification is available at:

**`GET /api-docs.json`**

Import that URL into **Swagger UI**, **Postman**, **Insomnia**, or any OpenAPI client to explore paths, schemas, and security (`BearerAuth` JWT).

---

## HTTP API surface (route map)

All paths below are relative to the app root (`/` by default). Most business routes expect a valid JWT unless noted.

| Prefix | Purpose |
|--------|---------|
| `/auth` | `POST /signin`, `POST /logout` |
| `/users` | User management (admin-protected create/delete; temp `POST /addAdminUser` for bootstrap—review before production) |
| `/company` | Company |
| `/brands` | Brands |
| `/outlets` | Outlets |
| `/floors` | Floors |
| `/tables` | Tables |
| `/order-types` | Order types (dine-in, takeaway, etc.) |
| `/menu/categories` | Menu categories |
| `/menu/items` | Menu items |
| `/uploads` | Presigned upload URLs (`/upload-url`) |
| `/expense/categories` | Expense categories |
| `/expenses` | Expenses |
| `/orders` | Orders |
| `/business-days` | Business days |
| `/sales` | Sales reports and analytics |
| `/order-history` | Order history |
| `/cancel-reasons` | Cancellation reasons |

---

## Testing & linting

```bash
pnpm test          # Vitest (src/**/*.test.ts)
pnpm run test:watch
pnpm run lint
pnpm run lint:fix
```

---

## Docker

- **`Dockerfile`**: multi-stage build with **pnpm**, **esbuild** `build`, production **pnpm install --prod**, **PM2** runtime on port **5500**.
- **`docker-compose.yml`**: dev-oriented service using `dockerfile.dev` (adjust `PORT` env to match the app if needed).

```bash
docker compose up --build
```

---

## Deployment notes

- Production image runs **`pm2-runtime`** with **cluster** mode (`ecosystem.config.js`).
- Ensure **MongoDB** connectivity, **secrets**, and **CORS** origins are set for your environment.
- Point OpenTelemetry collectors at your observability stack if you use OTLP in production.

---

## License

ISC (see `package.json`).

---

*Internal package name in `package.json` may differ; this service is the **POS Backend** API described above.*
