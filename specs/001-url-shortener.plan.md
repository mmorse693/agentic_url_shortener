# 001 — URL Shortener · Implementation Plan

**Spec:** [`001-url-shortener.md`](./001-url-shortener.md)
**Date:** 2026-08-30
**Sequencing:** bottom-up — foundation → model → service → controller → route → backend tests →
Redux slice → frontend service → component → wire-up → frontend tests.

No code is written in this document. Each task names the exact files to create or edit, the key
functions in them, the acceptance criteria it satisfies, and how to verify it before moving on.

---

## Status — built, 2026-08-30

Every phase is implemented and both gates are green: **129 backend tests + 111 frontend tests**.
`npm run build` compiles with no lint warnings, and an end-to-end smoke run against a real listening
server confirmed create → redirect → count → delete.

Four things landed differently from the plan as written. All four are reflected in the task
sections above and in the code:

- **`react-router-dom` is v6, not v7.** v7's `exports` map does not resolve under CRA 5's Jest 27
  (`Cannot find module 'react-router/dom'`). v6.30 is the version that actually pairs with CRA.
- **msw was not used.** The plan's documented fallback was taken: a small `fetch` double in
  `src/test/mockApi.js`. The assertions are unchanged.
- **The validator gained a resolvable-host rule.** `///nope` parsed to the host `nope` and was
  accepted; a public shortener cannot forward to a dotless, unresolvable host. It is checked *after*
  the blocked-host rule, so `localhost` still reports the more specific `BLOCKED_HOST`.
- **Self-referential is checked before blocked-host.** With `BASE_URL=http://localhost:3000`, the
  blocked-host rule would otherwise fire first and report the wrong reason for a link to our own
  service.

Two smaller adjustments: `server/test/setupDb.js` exports an opt-in `useTestDb()` rather than being
a global `setupFilesAfterEnv` (the unit suites never touch Mongo), and `server/utils/asyncHandler.js`
was added because Express 4 does not forward rejected promises to error middleware.

---

## Deviations from the spec

Three things the spec assumes that this plan changes, with reasons. Each is a small, contained
call — flag any you disagree with before Phase 0 starts.

1. **Drop `nanoid`; generate codes with `node:crypto`.** `nanoid` v5 is ESM-only and would break
   the CommonJS Jest setup the backend tests rely on. Pinning v3 works but leaves a stale
   dependency. `crypto.randomBytes` mapped onto a base62 alphabet is ~10 lines, has no
   dependency, and is easier to test deterministically by stubbing `randomBytes`.

2. **Share the validation *case table*, not the validator.** The spec correctly says CRA's
   `ModuleScopePlugin` forces the validator to exist twice. But that plugin is a *webpack resolve*
   plugin — Jest does not use it. So the **test fixture** can be shared from
   `shared/urlValidationCases.json`, required by both test suites, giving AC-17 a real parity
   guarantee instead of two hand-maintained lists that drift. The production validators stay
   duplicated. Nothing under `src/` may ever import that file outside a test.

3. **`msw` is a risk, not a certainty.** msw v2 under CRA's Jest needs `TextEncoder` /
   `BroadcastChannel` / fetch polyfills in `setupTests.js` and is a known source of setup churn.
   Phase 10 tries msw first and falls back to a `global.fetch` mock if the polyfill cost exceeds
   ~30 minutes. The assertions do not change either way.

**Sequencing note.** The prescribed order puts the Redux slice (Phase 7) before the frontend
service (Phase 8), which inverts the real dependency — the slice's thunks call the service. The
plan follows the prescribed order by fixing the service's function signatures in Phase 7 as a
contract and implementing against them in Phase 8. The slice's tests are written with the service
mocked, so Phase 7 is independently verifiable.

---

## Phase 0 — Foundation

Prerequisite scaffolding. The repo has no backend at all, so the model has nowhere to live until
this lands.

### T0.1 — Dependencies and scripts

**Edit** `package.json`

- Runtime deps: `express`, `mongoose`, `helmet`, `cors`, `express-rate-limit`, `dotenv`,
  `@reduxjs/toolkit`, `react-redux`, `react-router-dom`, `http-proxy-middleware`.
- Dev deps: `jest`, `supertest`, `mongodb-memory-server`, `nodemon`, `concurrently`, `msw`.
- Scripts to add:
  - `server` → `nodemon server/index.js`
  - `dev` → `concurrently "npm:server" "npm:start"`
  - `test:server` → `jest --config server/jest.config.js`
  - `test:client` → `react-scripts test --watchAll=false`
  - `test:all` → `npm run test:server && npm run test:client`

**Create** `server/jest.config.js` — `testEnvironment: 'node'`, `testMatch:
['<rootDir>/**/*.test.js']`, `setupFilesAfterEnv` pointing at the DB harness (T5.1),
`testTimeout: 30000` for `mongodb-memory-server` cold start.

Single root `package.json` — no workspace split. `react-scripts test` roots to `src/` and will not
pick up `server/`, so the two suites stay isolated without extra config.

**Verify:** `npm run test:server` exits cleanly with "no tests found".

### T0.2 — Environment and config

**Create** `server/config/env.js` — reads and validates process env, exports a frozen config
object. Key function: `loadConfig()` → `{ port, mongoUri, baseUrl, corsOrigin, nodeEnv }`; throws
on a missing `MONGODB_URI` outside test.

**Create** `.env.example` — `PORT=5000`, `MONGODB_URI=mongodb://127.0.0.1:27017/url_shortener`,
`BASE_URL=http://localhost:3000`, `CORS_ORIGIN=http://localhost:3000`.

**Edit** `.gitignore` — add `.env`.

`BASE_URL` is what `toApi()` builds `shortUrl` from and what the self-referential check compares
against, so it is load-bearing in two places, not cosmetic.

**Verify:** `node -e "require('./server/config/env').loadConfig()"` throws without `.env`, succeeds
with it.

### T0.3 — Express bootstrap

**Create** `server/db.js` — `connect(uri)`, `disconnect()`. Wraps `mongoose.connect` with a
connection-error listener.

**Create** `server/app.js` — `createApp()` returns a configured Express app **without listening**.
Order matters: `helmet()` → `cors({ origin })` → `express.json({ limit: '10kb' })` → routes →
`errorHandler` last.

**Create** `server/index.js` — `start()`: `loadConfig()`, `connect()`, `createApp().listen(port)`.

Splitting `app.js` from `index.js` is what lets `supertest` mount the app in Phase 5 without
binding a port or opening a real Mongo connection.

**Verify:** `npm run server` boots; `curl localhost:5000/api/health` 404s (route lands in T4.3).

### T0.4 — Dev proxy

**Create** `src/setupProxy.js` — proxies `/api` and `/r` to `http://localhost:5000`. Key function:
`module.exports = function (app)` registering two `createProxyMiddleware` mounts.

`/r` must be proxied too, or the CRA dev server swallows short links and serves `index.html`.

**Verify:** with both servers up, `curl -i localhost:3000/api/health` reaches Express.

---

## Phase 1 — Model

### T1.1 — Link model — AC-2, AC-7, AC-21, AC-22, AC-27

**Create** `server/models/Link.js`

- `linkSchema` — `code`, `originalUrl`, `ownerId`, `clickCount`, `expiresAt`, `{ timestamps: true }`
  exactly as specified in the spec's Data model section.
- `linkSchema.index({ ownerId: 1, createdAt: -1 })` — serves the list query.
- `linkSchema.methods.toApi(baseUrl)` → `{ id, code, shortUrl, originalUrl, clickCount, expiresAt,
  createdAt }`. The single place the API response shape is defined; controllers never hand-build it.
- `linkSchema.methods.isExpired(now = new Date())` → boolean. Used by the redirect path so the
  expiry rule lives with the model rather than being re-implemented per caller.
- Export `mongoose.model('Link', linkSchema)`.

**Do not** add `expires` / TTL to `expiresAt` — a TTL index deletes the document and AC-21 requires
expired codes to answer `410`, which is impossible once the row is gone.

**Verify:** covered by T5.2's service tests; no standalone model test.

---

## Phase 2 — Utilities and service

### T2.1 — Error types

**Create** `server/utils/errors.js`

- `class ApiError extends Error` — carries `status`, `code`, `field`.
- `ValidationError(code, message, field)` → 400
- `NotFoundError()` → 404
- `ExpiredLinkError()` → 410
- `CodeGenerationError()` → 500
- `ServiceUnavailableError()` → 503

Typed errors let the service throw without knowing about HTTP, and let the single error middleware
map cleanly in T3.3.

### T2.2 — URL validation — AC-4, AC-5, AC-6, AC-9 → AC-14

**Create** `server/utils/validateUrl.js`

- `ERRORS` — frozen map of `code → message`, the single source for every user-facing validation
  string.
- `normalizeInput(raw)` → trims; prepends `https://` when no scheme is present; lowercases scheme
  and host, preserves path case.
- `isBlockedHost(hostname)` → true for `localhost`, `127.0.0.0/8`, `0.0.0.0`, `::1`, `10/8`,
  `172.16–31/12`, `192.168/16`, `169.254/16`, and any `*.local` / `*.internal` suffix.
- `isSelfReferential(parsedUrl, baseUrl)` → true when host and port match `BASE_URL`.
- `validateUrl(raw, { baseUrl })` → `{ ok: true, normalized }` or
  `{ ok: false, code, message, field: 'url' }`.

Order of checks is fixed and tested: empty → parse → scheme → blocked host → self-referential →
length. Length is checked on the **normalized** string so `example.com` is not measured before its
scheme is added.

**Create** `shared/urlValidationCases.json` — the canonical case table: `{ input, expect: 'ok' |
code, normalized? }`. Consumed by both test suites (see Deviation 2).

### T2.3 — Code generation — AC-2

**Create** `server/utils/generateCode.js`

- `ALPHABET` — 62 chars, `A-Za-z0-9`. Note the spec's schema `match` also permits `_` and `-`;
  generated codes use base62 only, and the wider pattern is headroom for custom aliases later.
- `generateCode(length = 7)` — `crypto.randomBytes` with rejection sampling so the distribution
  stays uniform (naïve `% 62` biases the first 8 characters).

### T2.4 — Link service — AC-1, AC-3, AC-6, AC-7, AC-19, AC-20, AC-21, AC-27, AC-28, AC-29, AC-30

**Create** `server/services/linkService.js` — the only module that talks to the model.

- `createLink({ url, expiresAt, ownerId, baseUrl })` — validates via `validateUrl`, validates
  `expiresAt` is a future date or null, then inserts with collision retry: up to **5** attempts,
  catching duplicate-key `E11000` on `code` and regenerating; throws `CodeGenerationError` on
  exhaustion. Returns the document.
- `listForOwner(ownerId)` — `find({ ownerId }).sort({ createdAt: -1 })`.
- `resolveAndCount(code)` — the redirect path. Two steps, deliberately:
  1. `findOne({ code })` → `null` ⇒ `NotFoundError`; expired ⇒ `ExpiredLinkError`.
  2. `findOneAndUpdate({ code }, { $inc: { clickCount: 1 } })` — atomic, so concurrent visits
     cannot lose an update (AC-19).
  The expiry check must precede the `$inc` or an expired link still counts, breaking AC-21.
- `deleteForOwner(code, ownerId)` — `deleteOne({ code, ownerId })`; `deletedCount === 0` ⇒
  `NotFoundError`. Scoping the *query* by `ownerId` — rather than fetching then comparing — is what
  makes AC-29 return 404 instead of 403 for free.

**Verify:** T5.2 unit tests with the model mocked.

---

## Phase 3 — Controllers and middleware

### T3.1 — Middleware — AC-8, AC-31, AC-32, AC-33

**Create** `server/middleware/requireOwner.js` — `requireOwner(req, res, next)`: reads
`X-Owner-Id`, rejects absent or non-UUID with `ValidationError('MISSING_OWNER')`, else sets
`req.ownerId`.

**Create** `server/middleware/rateLimit.js` — `createLimiter` (20/hour, applied to `POST
/api/links` only) and `readLimiter` (100/15min). Both emit `Retry-After` and the standard error
envelope via a custom `handler`.

**Create** `server/middleware/errorHandler.js` — `errorHandler(err, req, res, next)`: maps
`ApiError` → its own status and `{ error: { code, message, field } }`; maps
`MongooseServerSelectionError` → 503; everything else logs the stack server-side and returns a
generic 500. **No stack or driver text reaches the client.**

### T3.2 — Controllers

**Create** `server/controllers/linkController.js` — thin; parses request, calls service, formats
response. No validation logic and no model access.

- `postLink(req, res, next)` → `201` with `link.toApi(baseUrl)`
- `getLinks(req, res, next)` → `200 { links: [...] }`
- `deleteLink(req, res, next)` → `204`

**Create** `server/controllers/redirectController.js`

- `getRedirect(req, res, next)` → `res.set('Cache-Control', 'no-store').redirect(302, originalUrl)`.
  Explicit `302` — `res.redirect` defaults to `302`, but stating it prevents a later "tidy-up" from
  turning it into a permanently-cached `301` and silently killing click counts.
- `renderLinkError(status, message)` — minimal HTML for the `404` / `410` pages, since these are
  hit by browsers, not fetch.

---

## Phase 4 — Routes

### T4.1 — Link routes

**Create** `server/routes/links.js` — `express.Router()`:
`POST /` → `createLimiter`, `requireOwner`, `postLink` · `GET /` → `readLimiter`, `requireOwner`,
`getLinks` · `DELETE /:code` → `requireOwner`, `deleteLink`.

### T4.2 — Redirect route

**Create** `server/routes/redirect.js` — `GET /:code` → `getRedirect`.

### T4.3 — Health route and mounting

**Create** `server/routes/health.js` — `GET /` → `{ status, db }` from `mongoose.connection.readyState`.

**Edit** `server/app.js` — mount `/api/links`, `/api/health`, `/r`. In production, mount `/r`
**before** `express.static(build)` and the SPA catch-all, or the static handler answers first.

**Verify:** manual `curl` for each of the five endpoints; full coverage lands in Phase 5.

---

## Phase 5 — Backend tests

### T5.1 — Test harness

**Create** `server/test/setupDb.js` — `beforeAll` starts `MongoMemoryServer` and connects;
`afterEach` clears all collections; `afterAll` stops both. Exported for `setupFilesAfterEach`.

**Create** `server/test/factories.js` — `makeLink(overrides)` for terse fixtures.

### T5.2 — Unit tests

**Create** `server/utils/validateUrl.test.js` — table-driven over `shared/urlValidationCases.json`;
asserts `code` **and** exact `message` per case, plus `normalized` where given.

**Create** `server/utils/generateCode.test.js` — length and alphabet (AC-2); uniqueness across
10k draws; `randomBytes` stubbed to force the rejection-sampling branch.

**Create** `server/services/linkService.test.js` — model mocked. `createLink` persists the
normalized URL with `clickCount: 0`; the `E11000` path retries and succeeds; five collisions throw
`CodeGenerationError`; `resolveAndCount` returns `null` for unknown and throws `ExpiredLinkError`
for expired **without** calling `findOneAndUpdate`; `deleteForOwner` passes `ownerId` in the query.

### T5.3 — Integration tests

**Create** `server/routes/links.test.js` — `supertest(createApp())` against
`mongodb-memory-server`. Covers AC-1 (shape *and* the document actually in the DB), AC-3, AC-8,
every failure row in the API contract table, AC-27, AC-28, AC-29 (404 and still present), AC-30,
AC-31 (21st create → 429 + `Retry-After`), AC-33.

**Create** `server/routes/redirect.test.js` — AC-18, AC-19 (`Promise.all` of 10 requests →
`clickCount === 10` exactly), AC-20, AC-21 (410, count unchanged), AC-22.

**Gate:** `npm run test:server` green before any frontend work starts.

---

## Phase 6 — Redux slice

### T6.1 — Store and slice — AC-23, AC-26

**Create** `src/store/linksSlice.js`

- Thunks via `createAsyncThunk`, written against the T7.2 contract:
  `createLink({ url, expiresAt })` · `fetchLinks()` · `deleteLink(code)`.
  Each uses `rejectWithValue(err.payload)` so the rejected action carries the parsed
  `{ code, message, field }` envelope, never a serialized `Error`.
- Reducers: `clearError()`, `clearLastCreated()`.
- Initial state: `{ items: [], listStatus: 'idle', createStatus: 'idle', lastCreated: null, error: null }`.
- `createLink.fulfilled` sets `lastCreated` **and** unshifts into `items`.
- `deleteLink.fulfilled` filters `items` by `code` and clears `lastCreated` when it matches.
- Selectors: `selectLinks`, `selectLastCreated`, `selectCreateStatus`, `selectLinksError`.

**Create** `src/store/index.js` — `configureStore({ reducer: { links: linksReducer } })`.

**Verify:** T10.2 reducer tests — they need no service and can be written immediately.

---

## Phase 7 — Frontend service

### T7.1 — Owner identity

**Create** `src/services/ownerId.js` — `getOwnerId()`: read `localStorage`, else
`crypto.randomUUID()` and persist. Whole body in `try/catch`; on throw (private mode, blocked
storage) fall back to a module-scoped in-memory id so the session still works.

### T7.2 — API client

**Create** `src/services/linksApi.js`

- `class ApiError extends Error` — `code`, `message`, `field`, `status`.
- `request(path, options)` — private; attaches `X-Owner-Id` and `Content-Type`, parses the error
  envelope into `ApiError`, and handles a non-JSON body (an HTML 502 from a proxy) without throwing
  a `SyntaxError` in place of a useful message.
- `createLink({ url, expiresAt })` · `listLinks()` · `deleteLink(code)`.
- Base URL from `process.env.REACT_APP_API_URL ?? '/api'`.

### T7.3 — Client-side validator — AC-17

**Create** `src/utils/validateUrl.js` — a faithful port of `server/utils/validateUrl.js`: same
function names, same `ERRORS` map, same check order. Deliberate duplication; see Deviation 2.
`baseUrl` comes from `window.location.origin`.

---

## Phase 8 — Components

Presentational work. Each component is built and tested against the store, before the app shell is
rewired in Phase 9.

### T8.1 — Shared primitives

**Create** `src/components/ErrorMessage.jsx` — `role="alert"`, renders `{ message }`, forwards
`id` so `aria-describedby` can point at it.

**Create** `src/components/CopyButton.jsx` — AC-24, AC-25, AC-26.
`copy(text)` tries `navigator.clipboard.writeText`, falls back to a hidden textarea +
`document.execCommand('copy')`, and on double failure sets the manual-copy hint. `status` state
(`idle | copied | failed`) drives the label; a `useEffect` timer clears `copied` after ~2s and is
cleaned up on unmount.

### T8.2 — Core flow — AC-9 → AC-16, AC-23

**Create** `src/components/ShortenForm.jsx` — real `<label htmlFor>`, `<form onSubmit>`, submit
button reading **Create short URL**. `handleSubmit` runs `validateUrl` locally first and returns
without dispatching on failure (AC-9's "no network request"). Sets `aria-invalid` and
`aria-describedby`; clears the local error on change (AC-16); disabled + busy label while
`createStatus === 'loading'`.

**Create** `src/components/ShortUrlResult.jsx` — read-only `<input>` holding the short URL, wrapped
in an `aria-live="polite"` region, with `<CopyButton>`. A `useEffect` moves focus to the field when
`lastCreated` changes.

### T8.3 — Secondary surface — AC-27, AC-28, AC-34

**Create** `src/components/LinkListItem.jsx` — short URL, destination, `clickCount`
(`tabular-nums`), delete button. The destination renders as an `<a>` **only** after re-checking its
scheme against the http/https allowlist (AC-34); otherwise plain text.

**Create** `src/components/LinkList.jsx` — maps `items`, renders an empty state, dispatches
`deleteLink(code)`.

### T8.4 — Page and styles

**Create** `src/pages/ShortenPage.jsx` — composes form, result, list; dispatches `fetchLinks()` on
mount.

**Create** `src/pages/NotFoundPage.jsx`.

**Create** `src/components/*.css` (or one `src/styles/app.css`) — visible focus rings, ≥4.5:1
contrast.

---

## Phase 9 — Wire-up

### T9.1 — App shell

**Edit** `src/index.js` — wrap in `<Provider store={store}>`.

**Edit** `src/App.js` — replace the CRA template entirely: `<BrowserRouter>` with `/` →
`<ShortenPage />` and `*` → `<NotFoundPage />`. No route for `/r/:code`.

### T9.2 — Remove template debris

**Delete** `src/logo.svg`. **Edit** `src/App.css` and `src/index.css` — strip the CRA template
rules, keep the reset.

`src/App.test.js` is replaced in T10.4, not deleted here — leaving the repo without a passing test
suite between phases makes a bisect useless.

**Verify:** `npm run dev`, shorten a real URL end to end, open the short URL in a second browser.

---

## Phase 10 — Frontend tests

### T10.1 — Validator parity — AC-17

**Create** `src/utils/validateUrl.test.js` — requires the **same**
`shared/urlValidationCases.json` and asserts identical codes and messages to the server suite. This
is the test that actually enforces AC-17; without the shared fixture it only checks that the client
agrees with itself.

### T10.2 — Slice and service

**Create** `src/store/linksSlice.test.js` — pending/fulfilled/rejected for all three thunks;
`lastCreated` set on create; item removed on delete; error envelope preserved verbatim.

**Create** `src/services/linksApi.test.js` — `fetch` mocked: header attached, envelope parsed into
`ApiError`, non-JSON response handled.

### T10.3 — Components

**Create** `src/components/ShortenForm.test.js` — AC-9, AC-15, AC-16; asserts the button is found
by its accessible name "Create short URL"; empty submit dispatches nothing; disabled while loading.

**Create** `src/components/ShortUrlResult.test.js` — AC-23, AC-26.

**Create** `src/components/CopyButton.test.js` — AC-24, AC-25: `navigator.clipboard.writeText`
mocked and asserted with the **exact** short URL; "Copied!" appears then clears; rejection falls
through to `execCommand` and then to the manual-copy hint.

**Create** `src/components/LinkList.test.js` — click counts render; delete dispatches the right
code; empty state.

### T10.4 — Integration

**Create** `src/test/handlers.js` + `src/test/server.js` — msw handlers for the five endpoints.
**Edit** `src/setupTests.js` — start/stop the msw server and add any required polyfills.

**Edit** `src/App.test.js` — replaces the CRA template test:
- Happy path: type a long URL → click **Create short URL** → short URL in the output field → copy →
  clipboard holds it.
- Server rejects `BLOCKED_HOST` → that exact message renders, input keeps its value.
- Network error → retryable banner, no crash.
- `fetchLinks` populates the list on mount.

**Gate:** `npm run test:all` green.

---

## Acceptance-criteria coverage map

| Phase | Criteria closed |
| --- | --- |
| 1 — Model | AC-2, AC-7 |
| 2 — Service | AC-1, AC-3, AC-4, AC-5, AC-6, AC-19, AC-29, AC-30 |
| 3 — Middleware | AC-8, AC-31, AC-32, AC-33 |
| 4 — Routes | AC-18, AC-20, AC-21, AC-22, AC-27, AC-28 |
| 7–8 — Frontend | AC-9 → AC-17, AC-23 → AC-26, AC-34 |
| 10 — Tests | Verifies all 34 |

Every criterion appears at least once. AC-17 is the only one that cannot be closed by a single
phase — it is a property of Phases 2 and 7 together, verified in T10.1.

---

## Task checklist

### Phase 0 — Foundation
- [x] **T0.1** Dependencies and scripts — `package.json`, `server/jest.config.js`
- [x] **T0.2** Env and config — `server/config/env.js`, `.env.example`, `.gitignore`
- [x] **T0.3** Express bootstrap — `server/db.js`, `server/app.js`, `server/index.js`
- [x] **T0.4** Dev proxy — `src/setupProxy.js`

### Phase 1 — Model
- [x] **T1.1** `server/models/Link.js` — schema, indexes, `toApi()`, `isExpired()`

### Phase 2 — Utilities and service
- [x] **T2.1** `server/utils/errors.js` — `ApiError` and subclasses
- [x] **T2.2** `server/utils/validateUrl.js` + `shared/urlValidationCases.json`
- [x] **T2.3** `server/utils/generateCode.js` — `generateCode()`, base62, rejection sampling
- [x] **T2.4** `server/services/linkService.js` — `createLink`, `listForOwner`, `resolveAndCount`, `deleteForOwner`

### Phase 3 — Controllers and middleware
- [x] **T3.1** `server/middleware/{requireOwner,rateLimit,errorHandler}.js`
- [x] **T3.2** `server/controllers/{linkController,redirectController}.js`

### Phase 4 — Routes
- [x] **T4.1** `server/routes/links.js`
- [x] **T4.2** `server/routes/redirect.js`
- [x] **T4.3** `server/routes/health.js` + mounting in `server/app.js`

### Phase 5 — Backend tests
- [x] **T5.1** `server/test/{setupDb,factories}.js`
- [x] **T5.2** Unit — `validateUrl.test.js`, `generateCode.test.js`, `linkService.test.js`
- [x] **T5.3** Integration — `links.test.js`, `redirect.test.js`
- [x] **GATE** `npm run test:server` green

### Phase 6 — Redux slice
- [x] **T6.1** `src/store/linksSlice.js`, `src/store/index.js`

### Phase 7 — Frontend service
- [x] **T7.1** `src/services/ownerId.js`
- [x] **T7.2** `src/services/linksApi.js` — `ApiError`, `createLink`, `listLinks`, `deleteLink`
- [x] **T7.3** `src/utils/validateUrl.js` — port of the server validator

### Phase 8 — Components
- [x] **T8.1** `ErrorMessage.jsx`, `CopyButton.jsx`
- [x] **T8.2** `ShortenForm.jsx`, `ShortUrlResult.jsx`
- [x] **T8.3** `LinkList.jsx`, `LinkListItem.jsx`
- [x] **T8.4** `ShortenPage.jsx`, `NotFoundPage.jsx`, styles

### Phase 9 — Wire-up
- [x] **T9.1** `src/index.js` Provider, `src/App.js` router
- [x] **T9.2** Remove CRA template debris
- [x] **CHECK** Manual end-to-end via `npm run dev`

### Phase 10 — Frontend tests
- [x] **T10.1** `src/utils/validateUrl.test.js` — AC-17 parity
- [x] **T10.2** `linksSlice.test.js`, `linksApi.test.js`
- [x] **T10.3** Component tests ×4
- [x] **T10.4** msw handlers + `src/App.test.js` rewrite
- [x] **GATE** `npm run test:all` green
