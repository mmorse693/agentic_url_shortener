# Architecture Overview

**Project:** `agentic_url_shortener`
**Built to:** [`specs/001-url-shortener.md`](../specs/001-url-shortener.md) via [`specs/001-url-shortener.plan.md`](../specs/001-url-shortener.plan.md)
**Date:** 2026-08-30

---

## 1. Overview

A URL shortener in one repository, running as **two processes in development and one in
production**. A React 19 SPA holds the screen; an Express 4 API owns every piece of state and
talks to MongoDB through Mongoose 8.

The single most useful thing to know about this system: **there is no background work.** No queue,
no cron, no worker, no cache, no TTL sweeper. Every state change — a link created, a click
counted, a link deleted — happens inside one HTTP request and is durable when that request
returns. "Orchestration" here means the ordering of middleware and the ordering of two database
calls, nothing more. That is a deliberate ceiling, and section 5 says what would have to change to
raise it.

Roughly 3,300 lines across `server/` and `src/`, tests included. 240 tests: 129 backend across 5
suites, 111 frontend across 8.

---

## 2. Components

### Frontend — `src/`

| Module | Single job |
| --- | --- |
| `index.js` | Mounts React, wraps the tree in the Redux `Provider` |
| `App.js` | Router only: `/` → `ShortenPage`, `*` → `NotFoundPage`. **No `/r/:code` route** |
| `pages/ShortenPage.jsx` | Composes the screen; dispatches `fetchLinks()` on mount |
| `components/ShortenForm.jsx` | The input, the **Create short URL** button, the client validation gate |
| `components/ShortUrlResult.jsx` | Read-only output field inside a live region; moves focus on success |
| `components/CopyButton.jsx` | Clipboard write with two fallbacks and a transient confirmation |
| `components/LinkList{,Item}.jsx` | The owner's links, click counts, delete; re-checks every URL before it becomes an `href` |
| `components/ErrorMessage.jsx` | One `role="alert"` presentation for every message |
| `store/linksSlice.js` | All client state: three thunks, two reducers, five selectors |
| `store/index.js` | `configureStore`; `createStore()` is exported so tests get isolated stores |
| `services/linksApi.js` | The only module that calls `fetch`. Attaches the owner header, parses the error envelope |
| `services/ownerId.js` | Generates and persists the browser's `ownerId`, with an in-memory fallback |
| `utils/validateUrl.js` | Client half of the validation rules (see §5.4) |
| `setupProxy.js` | Development only: routes `/api` and `/r` to the API |

### Shared — `shared/`

| Module | Single job |
| --- | --- |
| `urlValidationCases.json` | The canonical validation case table, loaded by **both** test suites. Not importable from production code |

### Backend — `server/`

| Module | Single job |
| --- | --- |
| `index.js` | Process lifecycle: load config, connect, listen, shut down on signals |
| `app.js` | `createApp()` — assembles middleware and routers, **does not listen** |
| `db.js` | Mongoose connect / disconnect |
| `config/env.js` | `loadConfig()` — reads env once, returns a frozen object, throws on a missing `MONGODB_URI` |
| `middleware/requireOwner.js` | Validates `X-Owner-Id`, sets `req.ownerId` |
| `middleware/rateLimit.js` | `createRateLimiters(config)` — built per app, so counters are per-instance |
| `middleware/errorHandler.js` | The single exit for every failure; maps typed errors to the envelope |
| `routes/{links,redirect,health}.js` | Router factories; wiring only |
| `controllers/linkController.js` | Parse request → call service → format response. No validation, no model access |
| `controllers/redirectController.js` | The redirect, plus HTML error pages (browsers hit these, not `fetch`) |
| `services/linkService.js` | All business rules. **The only module that touches the model** |
| `models/Link.js` | Schema, indexes, `toApi(baseUrl)`, `isExpired()` |
| `utils/validateUrl.js` | Server half of the validation rules — authoritative |
| `utils/generateCode.js` | Base62 codes from `crypto.randomBytes` with rejection sampling |
| `utils/errors.js` | `ApiError` and its subclasses — HTTP status carried by the error, not by the thrower |
| `utils/asyncHandler.js` | Express 4 does not forward rejected promises; this does |

---

## 3. Orchestration model

### 3.1 Process topology

**Development — two processes.** `npm run dev` runs them together under `concurrently`:

- **CRA dev server, :3000.** Serves the SPA at `/`. `src/setupProxy.js` forwards `/api` and `/r`
  to :5000 using `pathFilter`, so the original URL reaches the API unchanged.
- **Express API, :5000.** Owns `/api/*` and `/r/*`.

`/r` **must** be proxied alongside `/api`. Without it the dev server answers short links with
`index.html` and the redirect never happens — a failure that looks like a broken link rather than
a misconfigured proxy.

**Production — one process.** No dev server, no proxy; the browser reaches Express directly.
Static serving is not built (deployment is out of scope). If it is added, `/r` must stay mounted
**above** `express.static` and the SPA catch-all, or the static handler answers short links first.

### 3.2 Configuration

`loadConfig()` reads `process.env` once, validates it, and returns a **frozen, cached** object.
`createApp()` stores it with `app.set('config', …)`; controllers read it back with
`req.app.get('config')`. Nothing else reads `process.env` at request time.

`BASE_URL` is load-bearing in two independent places: `Link#toApi()` builds `shortUrl` from it,
and the validator compares against it to reject self-referential links. Changing it changes both.

### 3.3 The `createApp()` / `start()` split

`app.js` returns a configured app that has not bound a port. `index.js` owns the lifecycle —
connect, listen, handle `SIGINT`/`SIGTERM`. That split is what lets the integration suites mount
the real app under `supertest` with no port and no real database, which is why the route tests
exercise the actual middleware chain rather than a stub of it.

`createApp(overrides)` also shallow-merges overrides onto the config, so a test can dial
`baseUrl` or rate limits without touching `process.env`.

### 3.4 Rate limiters are per-app, not per-module

`createRateLimiters()` is called inside `createApp()`, so every app instance owns its counters.
Tests build a fresh app in `beforeEach` and therefore start from zero — which is what makes the
AC-31 test able to fire 21 real requests and assert the 21st is refused.

### 3.5 Request lifecycle

Middleware order in `createApp()` is fixed and meaningful:

```
helmet()                    security headers
cors({ origin })            browser origin allowlist
express.json({ limit })     10 KB cap -> 413 before any handler runs
  /api/health
  /api/links                createLimiter | readLimiter -> requireOwner -> asyncHandler(controller)
  /r                        redirect controller (own HTML error pages)
  /api  404                 JSON envelope for unknown API routes
  *     404                 HTML page for everything else
errorHandler                LAST — the single exit
```

Body-size and JSON-parse failures are raised by `express.json` before any route runs, and are
mapped by the error handler like any other typed failure.

### 3.6 Test orchestration

Two runners, because `react-scripts test` roots itself at `src/` and will never see `server/`:

| Command | Runner | Scope |
| --- | --- | --- |
| `npm run test:server` | Jest, `server/jest.config.js`, node env | 129 tests, 5 suites |
| `npm run test:client` | `react-scripts test`, jsdom | 111 tests, 8 suites |
| `npm run test:all` | Both, backend first | 240 tests |

Two deliberate choices inside that:

- **The database harness is opt-in.** `server/test/setupDb.js` exports `useTestDb()`, called at
  the top of the two integration suites. It is *not* a global `setupFilesAfterEnv`, because the
  unit suites never touch Mongo and booting an in-memory server for them would cost seconds per
  file for nothing.
- **The frontend mocks `fetch` directly** (`src/test/mockApi.js`) rather than using msw, which
  needs several polyfills under CRA's Jest. The assertions are identical either way.

---

## 4. Control flow

### 4.1 Creating a link — the double validation gate

The same rules run twice, in two files that cannot share code:

1. `ShortenForm.handleSubmit` runs `validateUrl` locally. **On failure it returns without
   dispatching** — the message appears and no request is ever issued.
2. On success it dispatches `createLink`, which calls `linksApi.createLink`. The API client
   attaches `X-Owner-Id` and posts to `/api/links`.
3. Express: `createLimiter` → `requireOwner` → `linkController.postLink`.
4. `linkService.createLink` runs the **server** validator. This one is authoritative; the client
   gate is a latency and noise optimization, never a security control.
5. `parseExpiry` rejects a past or malformed `expiresAt`.
6. `generateCode()` + `Link.create`, retried up to 5 times on an `E11000` duplicate-key error,
   then `CodeGenerationError`.
7. `link.toApi(baseUrl)` → `201`. The slice sets `lastCreated` and unshifts into `items`;
   `ShortUrlResult` renders it, moves focus to the field, and enables the copy button.

The two validators are kept honest by `shared/urlValidationCases.json`, which both test suites
load and assert identical codes *and* messages against. That fixture is the parity mechanism.

### 4.2 Redirecting — the ordering is the mechanism

`resolveAndCount(code)` is two database calls in a fixed order:

```
Link.findOne({ code })
  ├─ null            -> NotFoundError      -> 404 HTML   (no count)
  ├─ isExpired()     -> ExpiredLinkError   -> 410 HTML   (no count)
  └─ live
       Link.findOneAndUpdate({ code }, { $inc: { clickCount: 1 } })
         ├─ null     -> NotFoundError      -> 404        (deleted mid-flight)
         └─ updated  -> 302 + Cache-Control: no-store
```

Two things are doing real work here:

- **The expiry gate precedes the increment.** Reverse them and an expired link still counts a
  click.
- **`$inc` inside `findOneAndUpdate`, never read-modify-write.** Ten concurrent visitors must
  produce exactly ten clicks. A read-modify-write implementation passes every other test in the
  suite and fails only that one, which is why it exists.

### 4.3 Listing and deleting

`GET /api/links` → `find({ ownerId }).sort({ createdAt: -1 })`, served directly by the
`{ ownerId: 1, createdAt: -1 }` compound index.

`DELETE /api/links/:code` → `deleteOne({ code, ownerId })`. Scoping the **query** by owner —
rather than fetching the document and comparing — is what makes a stranger's delete return `404`
rather than `403`, so the endpoint never confirms that a code exists. The 404-for-everything
behaviour falls out of the query shape instead of being a rule someone has to remember.

### 4.4 Error propagation — one envelope, four layers

A failure keeps the same three fields from the throw site to the sentence on screen:

```
linkService  throw ValidationError('BLOCKED_HOST', message, 'url')   // knows nothing about HTTP
errorHandler err.status -> 400,  err.toEnvelope()
   wire      { "error": { "code", "message", "field" } }
linksApi     -> ApiError { code, message, field, status }
slice        rejectWithValue(payload)  ->  state.links.error
ShortenForm  <ErrorMessage role="alert">  +  aria-invalid / aria-describedby
```

Nothing is re-worded at a boundary. `rejectWithValue` matters specifically: a raw `Error` would
serialize to a bare string and the specific message would be lost. Unexpected failures are the
exception — those are logged server-side and replaced with a generic 500, so no stack trace or
driver text reaches a client.

---

## 5. Key decisions

| Decision | Why | If reversed |
| --- | --- | --- |
| Short links at `/r/:code`, not `/:code` | A bare code at the root collides with app routes and static assets (`/favicon.ico`, `/manifest.json`) | Needs a reserved-word list that must be kept in sync with every asset ever added |
| Redirect is `302`, never `301` | Browsers cache a `301` permanently | Click counting silently stops after each visitor's first visit; no error, just wrong numbers |
| `expiresAt` has **no** TTL index | An expired link must answer `410 Gone` | TTL deletes the row, so expired links become `404` and the user is told the link never existed |
| Clicks via `$inc` in `findOneAndUpdate` | Concurrent visitors must not lose updates | Undercounts under any real concurrency; invisible in single-request testing |
| Expiry checked **before** the increment | An expired link must not count | Expired links accumulate clicks |
| Delete scoped by `{ code, ownerId }` | Never confirm a code exists to a non-owner | A `403` would turn the endpoint into a code-existence oracle |
| Validator duplicated, fixture shared | CRA's `ModuleScopePlugin` makes a shared module uncompilable; Jest has no such restriction | Either the client bypasses the rules, or the two copies drift with nothing to catch it |
| Self-referential checked before blocked-host | `BASE_URL` is `localhost` in development | A link to our own service reports "private address" instead of the real reason |
| `ownerId` is scoping, not auth | Lets "my links" exist with no auth system | Treating a spoofable header as a security boundary is the classic way to ship an access-control bug |
| Service owns the model exclusively | One place holds the business rules | Rules leak into controllers and diverge per endpoint |
| Errors carry their own HTTP status | The service can throw without importing HTTP concerns | Every controller re-derives status codes, inconsistently |
| Base62 with rejection sampling | `% 62` on a random byte biases the first 8 letters | A subtly non-uniform code space — works, but is not what it claims to be |
| Express 4 + `asyncHandler` | Express 4 does not forward rejected promises | An async throw hangs the request instead of reaching the error handler |
| `react-router-dom` v6, not v7 | v7's `exports` map does not resolve under CRA 5's Jest 27 | The frontend test suite cannot load `App.js` at all |
| Stored URLs re-checked before becoming an `href` | Validation on the way in is not a reason to trust data on the way out | A `javascript:` value that ever reached the database becomes click-to-run XSS |

---

## 6. Invariants

These are the things that look like tidy-ups and are not. Each is load-bearing and each has a
test that fails if it is undone.

1. The two `validateUrl` copies stay identical, including message strings.
2. Validation order: empty → parse → scheme → self-referential → blocked host → resolvable host →
   length.
3. The redirect status is `302`.
4. `expiresAt` never gains a TTL index.
5. Clicks increment atomically, and only after the expiry check.
6. `deleteForOwner` scopes by `ownerId` in the query.
7. `errorHandler` is registered last and is the only place that formats a failure.
8. Nothing private is stored against `ownerId`.
9. `/r` is not a React route.

---

## 7. Deliberately absent

Not built, and what each would cost:

- **Authentication.** Would replace `ownerId` with a real identity, add a `User` model, and turn
  the `404`-for-strangers rule into a genuine authorization check.
- **Per-click analytics.** Would add a second collection and an aggregation read path; the current
  `$inc` becomes an insert plus a counter, and the redirect stops being a two-call operation.
- **Custom aliases.** Would need the reserved-word list that `/r/` currently makes unnecessary,
  plus a user-facing collision error.
- **Caching.** The redirect is the only hot path. A cache in front of `findOne` would need
  invalidation on delete and on expiry, and would break the exactness of click counting unless
  the `$inc` stayed uncached.
- **Static file serving, deployment, CI.** See §3.1 for the one ordering constraint that applies
  when static serving is added.
- **Malware or phishing checks on destinations.** The validator handles shape and network
  location only; it makes no claim about whether a destination is safe to visit.
