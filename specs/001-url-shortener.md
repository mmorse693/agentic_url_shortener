# 001 — URL Shortener

**Status:** Draft
**Repo:** `agentic_url_shortener`
**Author:** mark_morse@att.net
**Date:** 2026-08-30

---

## Problem / motivation

The repository is a bare Create React App scaffold — `src/App.js` is still the "Learn React"
template, and there is no backend, database, router, or state layer. Nothing shortens URLs.

Long URLs are hostile to the places people actually paste them: chat messages, printed
material, SMS, slide decks, and anywhere with a character budget. Users need to hand over a
long URL and get back a short, durable one they can copy in a single action, with immediate
and specific feedback when the input isn't a usable URL.

This spec defines the first vertical slice: a working shortener with a persisted link store,
a redirect endpoint, and a single-screen React UI.

### Architectural decisions taken here

These were open questions — the scaffold has no conventions to inherit — and are settled for
the purposes of this spec:

| Decision | Choice | Rationale |
| --- | --- | --- |
| Backend location | Express + Mongoose in `server/` in this repo | One git history; CRA dev proxy handles the split |
| Ownership | Anonymous `ownerId` (UUID in `localStorage`, sent as `X-Owner-Id`) | Scopes "my links" with no auth system to build |
| Click tracking | Single `clickCount` integer | Satisfies the counting story with one field |
| Short URL shape | `{BASE_URL}/r/{code}` | `/r/` namespace prevents codes shadowing app routes or static assets |
| Redirect status | `302 Found` | `301` is cached permanently by browsers and would silently stop counting clicks |

**`ownerId` is not authentication.** It is a client-supplied header, trivially spoofable, and
is used only to scope a list to a browser. No private data may be stored on a link. Real auth
is out of scope (see below).

---

## User stories

**Core (required by the feature request)**

1. As a visitor, I can paste a long URL into a single input field so I can shorten it.
2. As a visitor, I can press **Create short URL** and see the shortened URL appear in an
   output field.
3. As a visitor, I can press a copy button to put the short URL on my clipboard without
   selecting text by hand.
4. As a visitor, when I enter something that isn't a valid URL, I see a specific message
   telling me what is wrong — not a generic failure.
5. As anyone with a short URL, when I visit it I am redirected to the original destination.

**Secondary (selected during clarification; separable)**

6. As a returning visitor, I can see the links I have created from this browser, with how
   many times each has been visited.
7. As a link owner, I can delete a link I created, after which it no longer redirects.
8. As a link owner, I can optionally set an expiry date, after which the link stops working
   and reports that it has expired rather than that it never existed.

---

## Acceptance criteria

Each criterion is independently testable.

### Creating a link

- **AC-1** Submitting a syntactically valid `http`/`https` URL returns `201` with a JSON body
  containing `code`, `shortUrl`, and `originalUrl`, and the `shortUrl` ends in the `code`.
- **AC-2** The generated `code` is 7 characters drawn from `[A-Za-z0-9_-]`.
- **AC-3** Two successive creates for the same URL produce two different codes (no dedupe).
- **AC-4** Leading and trailing whitespace in the submitted URL is trimmed before validation.
- **AC-5** A URL with no scheme (`example.com/path`) is normalized to `https://` and accepted.
- **AC-6** The stored `originalUrl` is the normalized URL, not the raw input.
- **AC-7** Creating a link initializes `clickCount` to `0`.
- **AC-8** A request with no `X-Owner-Id` header returns `400` with error code `MISSING_OWNER`.

### Validation and error reporting

- **AC-9** Empty or whitespace-only input returns `400` / `EMPTY_URL`, and the UI shows
  "Enter a URL to shorten." without issuing a network request.
- **AC-10** Input that does not parse as a URL returns `400` / `INVALID_URL` with the message
  "That doesn't look like a valid URL. Try something like https://example.com/page".
- **AC-11** A non-`http(s)` scheme (`javascript:`, `data:`, `file:`, `ftp:`) returns `400` /
  `UNSUPPORTED_SCHEME` — "Only http and https links can be shortened."
- **AC-12** A URL whose host is loopback, private, or link-local (`localhost`, `127.0.0.1`,
  `0.0.0.0`, `::1`, `10.x`, `172.16–31.x`, `192.168.x`, `169.254.x`, `*.local`, `*.internal`)
  returns `400` / `BLOCKED_HOST` — "Links to local or private network addresses can't be
  shortened."
- **AC-13** A URL longer than 2048 characters returns `400` / `URL_TOO_LONG` — "URLs must be
  2048 characters or fewer."
- **AC-14** A URL pointing at this service's own base URL returns `400` / `SELF_REFERENTIAL` —
  "That's already a short link from this service."
- **AC-15** Every rejection renders its message adjacent to the input, and the input carries
  `aria-invalid="true"` and an `aria-describedby` pointing at the message element.
- **AC-16** Correcting the input and resubmitting clears the previous error.
- **AC-17** Client and server apply the same rules: for every case AC-9 → AC-14, the client
  blocks the submission *and* the server would reject it if called directly.

### Redirecting

- **AC-18** `GET /r/{code}` for a live link responds `302` with `Location` set to
  `originalUrl`.
- **AC-19** Each successful redirect increments that link's `clickCount` by exactly 1, applied
  atomically (`$inc`), so N concurrent visits yield exactly N.
- **AC-20** An unknown code responds `404` / `NOT_FOUND`.
- **AC-21** A code whose `expiresAt` is in the past responds `410` / `EXPIRED` and does **not**
  increment `clickCount`.
- **AC-22** A deleted code responds `404`, not `410`.

### Output and clipboard

- **AC-23** After a successful create, the short URL appears in a read-only output field and
  is announced via an `aria-live="polite"` region.
- **AC-24** Pressing the copy button writes exactly the short URL to the clipboard and shows a
  transient "Copied!" confirmation.
- **AC-25** If the async Clipboard API is unavailable or rejects, the component falls back to
  select-and-`execCommand`; if that also fails it shows "Copy failed — press Ctrl+C to copy."
- **AC-26** The copy button is disabled while there is no result to copy.

### My links (secondary)

- **AC-27** `GET /api/links` returns only links whose `ownerId` matches the header, newest
  first.
- **AC-28** `DELETE /api/links/{code}` by the owner returns `204`; the link no longer appears
  in the list and `GET /r/{code}` returns `404`.
- **AC-29** `DELETE` for a code owned by a different `ownerId` returns `404` — never `403`,
  which would confirm the code exists.
- **AC-30** A link created with `expiresAt` in the past is rejected `400` / `INVALID_EXPIRY`.

### Guardrails

- **AC-31** More than 20 create requests in one hour from the same IP returns `429` with a
  `Retry-After` header.
- **AC-32** Responses carry the security headers set by `helmet` (including
  `X-Content-Type-Options: nosniff`).
- **AC-33** A request body over 10 KB is rejected `413`.
- **AC-34** The UI never renders a stored `originalUrl` into an `href` without re-checking its
  scheme against the `http`/`https` allowlist.

---

## API contract

Base URL: `process.env.REACT_APP_API_URL` (default `/api`, proxied to `http://localhost:5000`
in development). All request and response bodies are `application/json`.

**Auth:** none. Every `/api/links` route requires an `X-Owner-Id: <uuid-v4>` request header.

**Error envelope** — every non-2xx response from `/api`:

```json
{ "error": { "code": "INVALID_URL", "message": "Human-readable, specific.", "field": "url" } }
```

`field` is present only for validation failures attributable to one input.

### `POST /api/links`

Create a short link.

Request:

```json
{ "url": "https://example.com/a/very/long/path?utm_source=x", "expiresAt": null }
```

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `url` | string | yes | ≤ 2048 chars after normalization |
| `expiresAt` | ISO-8601 string \| null | no | Must be in the future; `null` = never expires |

`201 Created`:

```json
{
  "id": "66d1f0c2e4b0a1c2d3e4f5a6",
  "code": "aB3dEf9",
  "shortUrl": "http://localhost:3000/r/aB3dEf9",
  "originalUrl": "https://example.com/a/very/long/path?utm_source=x",
  "clickCount": 0,
  "expiresAt": null,
  "createdAt": "2026-08-30T14:03:11.482Z"
}
```

| Status | Condition | `error.code` |
| --- | --- | --- |
| `400` | Missing owner header | `MISSING_OWNER` |
| `400` | Empty / whitespace URL | `EMPTY_URL` |
| `400` | Unparseable URL | `INVALID_URL` |
| `400` | Scheme not http/https | `UNSUPPORTED_SCHEME` |
| `400` | Private, loopback, or link-local host | `BLOCKED_HOST` |
| `400` | Over 2048 characters | `URL_TOO_LONG` |
| `400` | Points at this service | `SELF_REFERENTIAL` |
| `400` | `expiresAt` malformed or in the past | `INVALID_EXPIRY` |
| `413` | Body over 10 KB | `PAYLOAD_TOO_LARGE` |
| `429` | Rate limit exceeded | `RATE_LIMITED` |
| `500` | Code generation exhausted retries | `CODE_GENERATION_FAILED` |
| `503` | Database unreachable | `SERVICE_UNAVAILABLE` |

### `GET /api/links`

List the caller's links, newest first.

`200 OK`:

```json
{ "links": [ { "id": "...", "code": "aB3dEf9", "shortUrl": "...", "originalUrl": "...",
               "clickCount": 12, "expiresAt": null, "createdAt": "..." } ] }
```

`400 MISSING_OWNER` if the header is absent. An owner with no links gets `200` and `[]`.

### `DELETE /api/links/:code`

Delete a link the caller owns.

- `204 No Content` — deleted.
- `400 MISSING_OWNER`
- `404 NOT_FOUND` — unknown code **or** owned by someone else (deliberately indistinguishable).

### `GET /r/:code`

Public redirect. Not under `/api`; returns no JSON on success.

- `302 Found`, `Location: <originalUrl>`, `Cache-Control: no-store`. Increments `clickCount`.
- `404` — unknown or deleted code (HTML error page).
- `410` — expired (HTML error page naming expiry as the reason).

### `GET /api/health`

`200 { "status": "ok", "db": "connected" }` — used by tests and deploy checks.

---

## Data model changes

New collection, no existing schemas to migrate. Mongoose 8, `server/models/Link.js`.

```js
const linkSchema = new Schema({
  code:        { type: String, required: true, unique: true, index: true,
                 match: /^[A-Za-z0-9_-]{4,32}$/ },
  originalUrl: { type: String, required: true, maxlength: 2048 },
  ownerId:     { type: String, required: true, index: true },
  clickCount:  { type: Number, default: 0, min: 0 },
  expiresAt:   { type: Date, default: null },
}, { timestamps: true });

linkSchema.index({ ownerId: 1, createdAt: -1 });
```

Notes that matter to implementation:

- `code` is **case-sensitive** — base62 uses both cases, so no `lowercase: true`.
- `expiresAt` gets a plain index, **not** a TTL index. A TTL index would delete expired
  documents, and AC-21 requires expired codes to answer `410` rather than `404`.
- `{ ownerId: 1, createdAt: -1 }` serves the list query directly.
- Deletion is a hard delete (`deleteOne`), which is why a deleted code is indistinguishable
  from one that never existed (AC-22).
- No user collection. `ownerId` is an opaque string, not a `ref`.

---

## UI changes

### Dependencies to add

Frontend: `@reduxjs/toolkit`, `react-redux`, `react-router-dom`; `msw` (dev).
Backend: `express`, `mongoose`, `nanoid`, `helmet`, `cors`, `express-rate-limit`, `dotenv`;
`jest`, `supertest`, `mongodb-memory-server`, `nodemon`, `concurrently` (dev).

### Routes (`react-router-dom`)

| Path | Element | Notes |
| --- | --- | --- |
| `/` | `<ShortenPage />` | The whole core feature |
| `*` | `<NotFoundPage />` | Client-side 404 |

`/r/:code` is **never** a React route — it is served by Express. In development
`src/setupProxy.js` proxies `/api` and `/r` to `http://localhost:5000`; in production Express
mounts `/r` ahead of the static build.

### Components

| File | Responsibility |
| --- | --- |
| `src/App.js` | Replace CRA template: `<Provider>` + `<BrowserRouter>` + routes |
| `src/pages/ShortenPage.jsx` | Page layout; composes form, result, list |
| `src/components/ShortenForm.jsx` | Labeled input, **Create short URL** button, client-side validation, inline error |
| `src/components/ShortUrlResult.jsx` | Read-only output field + `<CopyButton>`, `aria-live="polite"` |
| `src/components/CopyButton.jsx` | Clipboard write with fallback and transient confirmation |
| `src/components/ErrorMessage.jsx` | Shared `role="alert"` presentation |
| `src/components/LinkList.jsx` | Owner's links (secondary) |
| `src/components/LinkListItem.jsx` | One row: short URL, destination, click count, delete (secondary) |

### Redux (Redux Toolkit)

`src/store/index.js` — `configureStore({ reducer: { links: linksReducer } })`.

`src/store/linksSlice.js`:

```
state.links = {
  items: [],                     // Link[] newest first
  listStatus: 'idle',            // idle | loading | succeeded | failed
  createStatus: 'idle',
  lastCreated: null,             // Link | null — drives the output field
  error: null,                   // { code, message, field } | null
}
```

- Thunks: `createLink({ url, expiresAt })`, `fetchLinks()`, `deleteLink(code)`.
- Reducers: `clearError()`, `clearLastCreated()`.
- `createLink.fulfilled` sets `lastCreated` **and** unshifts into `items`.
- `deleteLink.fulfilled` removes by `code` and clears `lastCreated` if it was that link.
- Rejected thunks store the parsed error envelope, never a raw `Error`.

### Services

- `src/services/ownerId.js` — `getOwnerId()`: read `localStorage`, else `crypto.randomUUID()`
  and persist. Wrapped in `try/catch`; if storage throws (private mode, blocked cookies) fall
  back to a module-level in-memory id so the session still works.
- `src/services/linksApi.js` — `createLink`, `listLinks`, `deleteLink`. Attaches
  `X-Owner-Id`, parses the error envelope, throws a normalized `ApiError`.
- `src/utils/validateUrl.js` — pure `validateUrl(input) → { ok, normalized } | { ok: false,
  code, message }`.

**Duplication note:** CRA's `ModuleScopePlugin` forbids importing from outside `src/`, so the
validator exists twice — `src/utils/validateUrl.js` and `server/utils/validateUrl.js` — with
identical rules. Both are covered by the same table-driven case list, and the parity test in
AC-17 is what keeps them honest. Do not attempt to share via a relative import; it will not
compile.

### Accessibility and interaction

- The input has a real `<label>` (`htmlFor`/`id`), not a placeholder standing in for one.
- Errors: `role="alert"`, referenced by `aria-describedby`, input gets `aria-invalid`.
- The result region is `aria-live="polite"`; the copy confirmation is announced too.
- Enter submits the form; the button is `type="submit"` inside a `<form onSubmit>`.
- Button shows a busy state and is disabled while `createStatus === 'loading'`.
- Focus moves to the output field after a successful create.
- Visible focus rings retained; text meets 4.5:1 contrast.

---

## Edge cases & error handling

| Case | Behavior |
| --- | --- |
| Whitespace-only input | Client blocks, shows "Enter a URL to shorten.", no request |
| `example.com` (no scheme) | Normalized to `https://example.com`, accepted |
| `HTTP://Example.COM/Path` | Scheme + host lowercased; path case preserved |
| `javascript:alert(1)` | `UNSUPPORTED_SCHEME`, both client and server |
| `http://localhost:5000/admin` | `BLOCKED_HOST` |
| `http://169.254.169.254/` | `BLOCKED_HOST` — cloud metadata endpoint |
| URL to our own `/r/...` | `SELF_REFERENTIAL`, prevents redirect loops |
| 3000-character URL | `URL_TOO_LONG` before any DB call |
| Code collision on insert | Regenerate, up to 5 attempts, then `500 CODE_GENERATION_FAILED` |
| Two visitors hit a link simultaneously | `findOneAndUpdate` + `$inc`; no lost update |
| Visit to expired link | `410`, count unchanged |
| Visit to deleted link | `404` |
| `expiresAt` in the past at create | `400 INVALID_EXPIRY` |
| Mongo unreachable | `503 SERVICE_UNAVAILABLE`; UI shows a retryable banner, form stays filled |
| Network failure mid-create | Thunk rejects, error banner, input value preserved |
| `navigator.clipboard` undefined (non-HTTPS origin) | `execCommand` fallback, then manual-copy hint |
| `localStorage` unavailable | In-memory owner id; links work for the session, list resets |
| Missing `X-Owner-Id` | `400 MISSING_OWNER` |
| Rapid repeat submits | Button disabled while in flight; server rate limit as backstop |
| Body over 10 KB | `413` from the JSON body limit |

Unexpected server errors are caught by a single Express error middleware that logs the stack
server-side and returns the generic envelope — **stack traces and Mongo error text are never
sent to the client.**

---

## Out of scope

- Custom aliases / vanity codes (reserved-word handling deliberately deferred with them).
- User accounts, login, JWT, password reset. `ownerId` is scoping, not identity.
- Per-click event logs, referrer/user-agent capture, charts, CSV export.
- Editing a link's destination after creation.
- QR codes, link previews, OG-tag scraping.
- Malware / phishing / blocklist scanning of destinations.
- Password-protected or one-time-use links.
- Deduplicating identical URLs to one code.
- Bulk import, an admin console, moderation tooling.
- i18n / localization.
- Deployment, CI, containerization.

---

## Test plan

Two runners: `react-scripts test` only picks up `src/`, so the backend needs its own Jest
invocation (`npm run test:server`, config in `server/jest.config.js`) with `npm run test:all`
running both.

### Backend unit

`server/utils/validateUrl.test.js` — table-driven over every row in the edge-case table:
valid http/https, scheme-less normalization, case normalization, each blocked scheme, each
private/loopback/link-local range, boundary lengths 2048 and 2049, self-referential.

`server/utils/generateCode.test.js` — alphabet and length (AC-2); collision path retries and
succeeds; exhaustion after 5 attempts throws the typed error.

`server/services/linkService.test.js` — model mocked: create persists normalized URL with
`clickCount: 0`; `resolveCode` returns null for unknown, throws `ExpiredLinkError` for
expired; `deleteForOwner` scopes the query by `ownerId`.

### Backend integration (`supertest` + `mongodb-memory-server`)

`server/routes/links.test.js`

- `POST` valid → `201`, shape matches AC-1, document actually in the DB.
- `POST` for each invalid case → correct status and `error.code`.
- `POST` without `X-Owner-Id` → `400 MISSING_OWNER`.
- `GET /api/links` returns only the caller's links, newest first.
- `DELETE` by owner → `204` then absent; by a different owner → `404` and still present.
- Rate limiter: 21st create in the window → `429` with `Retry-After`.

`server/routes/redirect.test.js`

- Live code → `302`, correct `Location`, `clickCount` incremented.
- 10 concurrent requests → `clickCount === 10` exactly (AC-19).
- Unknown → `404`; expired → `410` and count unchanged; deleted → `404`.

### Frontend unit

`src/utils/validateUrl.test.js` — the same case table as the server test, asserting identical
codes and messages (AC-17).

`src/store/linksSlice.test.js` — reducer transitions for pending/fulfilled/rejected on all
three thunks; `lastCreated` set on create; item removed on delete; error envelope preserved.

`src/services/linksApi.test.js` — `fetch` mocked: header attached, error envelope parsed into
`ApiError`, non-JSON response handled.

### Frontend component (RTL)

`ShortenForm.test.js` — renders labeled input and a button named "Create short URL";
submitting empty shows the message and dispatches nothing; invalid input sets `aria-invalid`
and shows the specific message; valid input dispatches `createLink`; button disabled while
loading.

`ShortUrlResult.test.js` — renders the short URL read-only; region is `aria-live`; copy button
disabled with no result.

`CopyButton.test.js` — `navigator.clipboard.writeText` mocked and asserted with the exact
string; "Copied!" appears then clears; rejection falls through to the fallback and then to the
manual-copy hint.

`LinkList.test.js` — renders click counts; delete dispatches with the right code; empty state
renders.

### Frontend integration (`msw`)

`src/App.test.js` — replaces the CRA template test entirely.

- Happy path: type a long URL → click **Create short URL** → short URL appears in the output
  field → click copy → clipboard holds it.
- Server rejects with `BLOCKED_HOST` → that exact message renders, input keeps its value.
- Network error → retryable banner, no crash.
- On mount, `fetchLinks` populates the list.

### Manual verification

Run `npm run dev`, shorten a URL, open the short URL in a second browser, confirm the
redirect lands and the count increments on the list after refresh.
