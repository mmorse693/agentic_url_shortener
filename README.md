# URL Shortener

Paste a long URL, get a short one back, and copy it in a single click. Short links redirect
through the API and count their visits.

Built to [`specs/001-url-shortener.md`](specs/001-url-shortener.md); the build order and the
reasoning behind each decision are in [`specs/001-url-shortener.plan.md`](specs/001-url-shortener.plan.md).

## Stack

React 19 + Redux Toolkit on the front (Create React App), Express 4 + Mongoose 8 on the back, in
one repo. The CRA dev server proxies `/api` and `/r` to the API.

## Getting started

Just evaluating it? You need Node 18+ and nothing else:

```bash
npm install
npm run dev:mem           # API on :5000, web on :3000, throwaway in-memory database
```

Open http://localhost:3000. The first run downloads a MongoDB binary (~100 MB) and caches it; data
is discarded when the process stops.

For persistent data, point it at a real MongoDB:

```bash
npm install
cp .env.example .env      # then set MONGODB_URI
npm run dev
```

`.env` is gitignored, so that copy step is required — the API refuses to start without
`MONGODB_URI`, and a missing `.env` shows up as a 504 in the browser.

Both commands run the two processes together. To run them separately use `npm run server` (or
`npm run server:mem`) and `npm start`.

Handing this to someone else to test? [`docs/testing-guide.md`](docs/testing-guide.md) is written
for a reader who has not seen the project, and includes a manual test script.

### Environment

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `5000` | API port |
| `MONGODB_URI` | — | Required outside tests |
| `BASE_URL` | `http://localhost:3000` | Short links are built from this, **and** it is what the self-referential check compares against |
| `CORS_ORIGIN` | `BASE_URL` | Browser origin allowed to call the API |
| `TRUST_PROXY` | `0` | Proxy hops to trust. Set to `1` behind a reverse proxy so rate limiting sees the real client IP |
| `RATE_LIMIT_CREATE_MAX` | `20` | Creates per hour per IP |
| `RATE_LIMIT_READ_MAX` | `100` | Reads per 15 minutes per IP |

## Commands

```bash
npm run dev            # API + web together (needs .env + MongoDB)
npm run dev:mem        # same, but with a throwaway in-memory database
npm run server         # API only (nodemon)
npm run server:mem     # API only, in-memory database
npm start              # web only
npm run build          # production build of the React app
npm run test:server    # backend suite (jest + supertest + mongodb-memory-server)
npm run test:client    # frontend suite (jest + React Testing Library)
npm run test:all       # both, backend first
npx eslint src         # lint on demand; also runs inside start/build
```

The backend suite spins up an in-memory MongoDB, so it needs no running database. The first run
downloads a mongod binary.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/links` | Create a short link |
| `GET` | `/api/links` | List the caller's links, newest first |
| `DELETE` | `/api/links/:code` | Delete one of the caller's links |
| `GET` | `/r/:code` | Public redirect — `302`, counts the click |
| `GET` | `/api/health` | Liveness and database state |

Every `/api/links` route requires an `X-Owner-Id: <uuid>` header. Errors share one envelope:

```json
{ "error": { "code": "BLOCKED_HOST", "message": "…", "field": "url" } }
```

## Things worth knowing

- **`ownerId` is scoping, not authentication.** It is a client-generated UUID in `localStorage`,
  sent as a plain header and trivially spoofable. It exists so a browser can list its own links.
  Never store anything private against it.
- **Short links live under `/r/`.** A bare `/:code` at the root would collide with app routes and
  static assets and force a reserved-word list.
- **The redirect is `302`, never `301`.** Browsers cache a `301` permanently, which would silently
  stop click counting after the first visit.
- **`expiresAt` has no TTL index.** A TTL index deletes the document, and an expired link has to
  answer `410 Gone` rather than `404`.
- **The URL validator exists twice**, in `src/utils/` and `server/utils/`. CRA's
  `ModuleScopePlugin` blocks sharing the module. The two are kept honest by a shared test fixture,
  `shared/urlValidationCases.json`, which both suites run — that is what enforces client/server
  parity. Change one validator, change the other.
- **Deleting someone else's code returns `404`, not `403`**, so the API never confirms that a code
  exists.

## Not built

Custom aliases, user accounts, per-click analytics, QR codes, link editing, malware scanning,
password-protected links, and deployment. See the spec's *Out of scope* section.
