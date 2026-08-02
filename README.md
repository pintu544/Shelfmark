# Shelfmark — Personal Book Manager

A quiet place to keep a reading life organized. Shelfmark is a full-stack personal library created for the Thumbstack assignment, where readers can save books, track reading status, filter their collection, and rediscover a favorite author—all without sharing their data with other users.

> **Deployment status:** [Web app](https://shelfmark-swart.vercel.app) · [API health](https://api-production-be883.up.railway.app/api/health)

## Features

- Secure signup, login, logout, and protected routes using a short-lived JWT in an HTTP-only cookie.
- Private book collections with create, edit, delete, tags, and quick status updates.
- Combined status and tag filters with responsive, typographic book cards.
- Dashboard totals for each reading state plus a deterministic favorite-author insight and rediscovery suggestion.
- Thoughtful empty, loading, server-wakeup, error, validation, and expired-session states.
- Keyboard-accessible dialogs, visible focus, reduced-motion support, and layouts down to 320 px.

## Architecture

```text
Browser
  └─ Next.js web app (apps/web, Vercel)
       └─ same-origin /api/* rewrite
            └─ Express API (apps/api, Railway)
                 └─ MongoDB (local or Atlas)
```

This npm-workspaces monorepo keeps presentation and API concerns separate. Next.js owns pages, route-presence checks, and the API proxy. Express remains the authority for authentication, validation, ownership, and errors. MongoDB stores users and books; every book operation is scoped by the authenticated user's ID.

| Path | Purpose |
| --- | --- |
| `apps/web` | Next.js App Router frontend with TypeScript and Tailwind CSS |
| `apps/api` | Express 5 REST API with TypeScript and Mongoose |
| `apps/api/railway.json` | Railway build, start, and health-check configuration |

## Local setup

### Prerequisites

- Node.js 22 and npm 10 or newer.
- A local MongoDB instance or a MongoDB Atlas connection string.

### Install and configure

```bash
npm install
```

Use the annotated [`.env.example`](.env.example) to create two untracked files:

`apps/api/.env`

```dotenv
MONGODB_URI=mongodb://127.0.0.1:27017/thumbstack
JWT_SECRET=replace-with-a-random-secret-at-least-32-characters-long
FRONTEND_ORIGIN=http://localhost:3000
NODE_ENV=development
PORT=4000
```

`apps/web/.env.local`

```dotenv
API_ORIGIN=http://localhost:4000
```

`API_ORIGIN` is server-only: the browser always talks to same-origin `/api` URLs. Do not rename it with a `NEXT_PUBLIC_` prefix.

Start both workspaces:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The API listens on [http://localhost:4000](http://localhost:4000), and its readiness endpoint is `/api/health`.

## Root scripts

| Command | Action |
| --- | --- |
| `npm run dev` | Run API and web development servers together |
| `npm run dev:api` / `npm run dev:web` | Run one workspace |
| `npm run build` | Build API, then web |
| `npm run lint` | Lint all workspaces that define a lint script |
| `npm run typecheck` | Type-check all workspaces |

## API overview

| Method and path | Purpose |
| --- | --- |
| `GET /api/health` | Database-aware readiness check |
| `POST /api/auth/signup` | Create an account and session |
| `POST /api/auth/login` | Authenticate and create a session |
| `GET /api/auth/me` | Return the current safe user |
| `POST /api/auth/logout` | Clear the session cookie |
| `GET /api/books?status=&tag=` | List and filter the user's books |
| `POST /api/books` | Add a book |
| `PATCH /api/books/:id` | Edit a book or change status |
| `DELETE /api/books/:id` | Delete a book |
| `GET /api/dashboard` | Return counts, tags, and author insight |

Errors use one shape throughout: `{ "error": { "code": "...", "message": "...", "fields": {} } }`. Validation errors return `400`, authentication failures `401`, non-owned or missing books `404`, duplicate emails `409`, and auth throttling `429`.

## Security decisions

- Passwords are hashed with Argon2id and never returned by the API.
- The 12-hour HS256 JWT is stored only in a host-only, HTTP-only, `SameSite=Lax` cookie; production cookies are `Secure`.
- JWT verification pins the algorithm, issuer, audience, signature, and expiry.
- Unsafe JSON requests require both an exact allowed origin and the fixed application request header used by the web client.
- Helmet, a small JSON body limit, generic login errors, and an auth rate limit reduce common abuse paths.
- Ownership comes only from the verified JWT. Client input can never select or replace a book owner.
- Secrets and database credentials belong in deployment environment settings, never in Git.

## Deployment

### API: Railway + MongoDB Atlas

1. Create an Atlas database and database user, then allow Railway's outbound access according to your Atlas network policy.
2. From `apps/api`, run `railway up`; [`railway.json`](apps/api/railway.json) builds the TypeScript API, starts the compiled server, and checks `/api/health`.
3. Set `MONGODB_URI`, a random 32+ character `JWT_SECRET`, `NODE_ENV=production`, and the exact Vercel `FRONTEND_ORIGIN` in Railway. Railway supplies `PORT`.
4. Generate a Railway public domain for the API and use its HTTPS origin as the frontend's `API_ORIGIN`.

### Web: Vercel

1. Import the repository and set the Vercel root directory to `apps/web`.
2. Set server-only `API_ORIGIN` to the public Railway service origin, with no trailing slash.
3. Deploy, then update Railway's `FRONTEND_ORIGIN` if the final Vercel hostname changed.

If the API service sleeps while idle, the web app treats health polling as a wake-up operation; it never automatically replays mutations.

### Release checklist

- Signup, CRUD, filtering, logout, and direct protected-route access pass against production.
- The deployed health endpoint reports ready and data persists after refresh.
- Production smoke test passes through Vercel's same-origin API proxy, including persistence after refresh.

## License

This repository was prepared as a technical assignment; no separate open-source license has been granted.
