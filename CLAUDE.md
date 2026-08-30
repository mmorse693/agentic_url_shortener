# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

A working full-stack URL shortener, built to [`specs/001-url-shortener.md`](specs/001-url-shortener.md)
against the sequence in [`specs/001-url-shortener.plan.md`](specs/001-url-shortener.plan.md). The
CRA template is gone. 240 tests pass (129 backend, 111 frontend).

## Layout

```
server/          Express 4 + Mongoose 8 API (CommonJS)
  config/env.js  loadConfig() — frozen config, cached
  models/        Link schema, toApi(), isExpired()
  services/      linkService — the only module that touches the model
  controllers/   thin: parse, call service, format
  middleware/    requireOwner, rateLimit, errorHandler
  routes/        router factories, mounted in app.js
  test/          useTestDb() opt-in harness, factories
src/             React 19 + Redux Toolkit (ES modules)
  store/         linksSlice — three thunks, one slice
  services/      linksApi (fetch + ApiError), ownerId
  utils/         validateUrl — duplicate of the server copy, see below
  components/    ShortenForm, ShortUrlResult, CopyButton, LinkList…
shared/          urlValidationCases.json — test fixture used by BOTH suites
specs/           the spec and its implementation plan
```

## Stack

- React 19, Redux Toolkit, react-router-dom **v6** (not v7 — v7's `exports` map does not resolve
  under CRA 5's Jest 27), `react-scripts` 5.
- Express 4 (so async route handlers need `utils/asyncHandler.js`; Express 4 does not forward
  rejected promises), Mongoose 8, helmet, cors, express-rate-limit.
- Two Jest runners: `react-scripts test` roots at `src/`; the backend has its own config at
  `server/jest.config.js`. Frontend tests mock `fetch` via `src/test/mockApi.js` — msw is not used.

## Commands

```bash
npm run dev                    # API :5000 + web :3000 together (needs .env)
npm run dev:mem                # same, but with a throwaway in-memory MongoDB — no .env, no install
npm run server                 # API only
npm run server:mem             # API only, in-memory MongoDB
npm start                      # web only
npm run build                  # production build
npm run test:server            # backend suite (in-memory MongoDB, no database needed)
npm run test:client            # frontend suite
npm run test:all               # both, backend first
npx jest --config server/jest.config.js server/routes/links.test.js   # one backend file
CI=true npx react-scripts test --watchAll=false -t "AC-9"             # one frontend test
npx eslint src                 # lint on demand; also runs inside start/build
```

Requires a `.env` (copy `.env.example`). `MONGODB_URI` is required outside tests.

## Invariants — do not undo these

- **The URL validator exists twice**, `src/utils/validateUrl.js` and `server/utils/validateUrl.js`.
  CRA's `ModuleScopePlugin` forbids importing across the boundary, so they cannot share a module.
  They are kept in step by `shared/urlValidationCases.json`, which both test suites load. **Change
  one, change the other** — the parity test will catch you, which is the point.
- **Validation check order is load-bearing:** empty → parse → scheme → self-referential → blocked
  host → resolvable host → length. Self-referential precedes blocked-host because `BASE_URL` is
  `localhost` in development. The dotless-host rule follows blocked-host so `localhost` still
  reports `BLOCKED_HOST`.
- **The redirect is `302`.** A `301` is cached permanently by browsers and would silently stop
  click counting.
- **`expiresAt` has no TTL index.** TTL deletes the row; an expired link must answer `410`, not `404`.
- **Clicks increment via `$inc` in `findOneAndUpdate`**, never read-modify-write. `redirect.test.js`
  fires ten concurrent requests and expects exactly ten.
- **`deleteForOwner` scopes the query by `ownerId`** rather than fetching and comparing, so a
  stranger gets `404` and the API never confirms a code exists.
- **`ownerId` is scoping, not authentication.** Client-supplied, spoofable. Nothing private goes
  near it.
- **Stored URLs are re-checked before becoming an `href`** (`isSafeHttpUrl`). Validating on the way
  in is not a reason to trust data on the way out.

## Notes

- `npm run eject` is a one-way, irreversible operation. Do not run it.
- Deployment, static-file serving, and CI are deliberately not built. If static serving is added,
  `/r` must stay mounted above `express.static` and the SPA catch-all.
