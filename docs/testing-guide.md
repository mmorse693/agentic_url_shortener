# Setup & Testing Guide

For someone who has not seen this project before. Getting it running takes two commands and no
database install.

**What it is:** paste a long URL, get a short one back, copy it in one click. Short links redirect
and count their visits.

---

## 1. Prerequisites

- **Node.js 18 or newer.** Check with `node -v`.
- **A browser.** Chrome, Firefox, Edge, or Safari.
- **No database needed** for the quick path below.

---

## 2. Setup

### Option A — quick start, no database (recommended for testing)

```bash
npm install
npm run dev:mem
```

Then open **http://localhost:3000**.

`dev:mem` starts a throwaway in-memory MongoDB alongside the app, so there is nothing to install
and nothing to configure.

Two things to know:

- **The first run downloads a MongoDB binary (~100 MB)** and caches it. Expect a wait of a minute
  or two the first time and a couple of seconds after that.
- **Data is discarded when you stop the process.** Every run starts clean. That is usually what you
  want for testing — but if you are checking that links survive a restart, use Option B.

### Option B — persistent data, real MongoDB

Needs MongoDB running locally (or an Atlas connection string).

```bash
npm install
cp .env.example .env        # Windows: copy .env.example .env
# edit .env and set MONGODB_URI if it is not the local default
npm run dev
```

`.env` is not in version control, so this step is required — the API refuses to start without
`MONGODB_URI` and you will see a 504 in the browser if you skip it.

### Either way

`npm run dev` / `npm run dev:mem` runs **two processes together** and labels their output `api`
and `web`. Leave the terminal open; both need to stay running.

---

## 3. Confirm it is working

Before testing the UI, check the API is up:

```bash
curl http://localhost:5000/api/health
```

Expected: `{"status":"ok","db":"connected"}`

If that fails, the browser will fail too — see Troubleshooting.

---

## 4. Automated tests

```bash
npm run test:all
```

Expected: **240 tests passing** — 129 backend across 5 suites, then 111 frontend across 8. Takes
about 20 seconds. Run them separately with `npm run test:server` and `npm run test:client`.

These need no running server and no database; the backend suite starts its own in-memory MongoDB.

---

## 5. Manual test script

Work through these in the browser at http://localhost:3000. Each says what to do and what should
happen. Anything different is worth reporting.

### A — Core flow

| # | Do this | Expect |
| --- | --- | --- |
| A1 | Paste `https://example.com/a/very/long/path?utm_source=test` and press **Create short URL** | A short URL appears in the **Short URL** field, of the form `http://localhost:3000/r/XXXXXXX` (7 characters) |
| A2 | Press **Copy** | The button reads **Copied!** for about two seconds, then returns to **Copy**. Paste elsewhere to confirm the clipboard holds the exact short URL |
| A3 | Open the short URL in a new tab | You land on the original long URL |
| A4 | Return to the app and reload | The link is listed under **Your links** with a click count of **1** |
| A5 | Visit the short URL twice more, reload the app | Count reads **3** |
| A6 | Type `example.com/no-scheme` and create | Accepted. The listed destination reads `https://example.com/no-scheme` — the scheme is added for you |

### B — Validation

Each of these should show a message **under the input** and create nothing. The wording should
match exactly.

| # | Enter this | Expected message |
| --- | --- | --- |
| B1 | *(nothing — just press the button)* | Enter a URL to shorten. |
| B2 | Only spaces | Enter a URL to shorten. |
| B3 | `not a url` | That doesn't look like a valid URL. Try something like https://example.com/page |
| B4 | `javascript:alert(1)` | Only http and https links can be shortened. |
| B5 | `http://192.168.1.1/` | Links to local or private network addresses can't be shortened. |
| B6 | `http://169.254.169.254/` | Links to local or private network addresses can't be shortened. |
| B7 | Paste a short URL this app produced | That's already a short link from this service. |
| B8 | `ftp://example.com/file` | Only http and https links can be shortened. |

B5 and B6 are deliberate: a shortener that will forward to private addresses can be used to probe
someone's internal network, and `169.254.169.254` is the cloud metadata endpoint.

### C — Error behaviour

| # | Do this | Expect |
| --- | --- | --- |
| C1 | Trigger any error from B, then start typing in the field | The message disappears as soon as you edit |
| C2 | Trigger an error and look at the input | Your text is still there — nothing is cleared out from under you |
| C3 | Trigger an error, then fix the URL and submit | It works; no stale message remains |

### D — Your links

| # | Do this | Expect |
| --- | --- | --- |
| D1 | Create two or three links, then reload the page | All of them are still listed, newest first |
| D2 | Press **Delete** on one | The row disappears immediately |
| D3 | Visit the deleted short URL | A **Link not found** page, not a redirect |
| D4 | Open the app in a private/incognito window | **Your links** is empty — lists are scoped per browser |

D4 is expected behaviour, not a bug. There are no user accounts; a browser sees only the links it
created.

### E — Keyboard and accessibility

| # | Do this | Expect |
| --- | --- | --- |
| E1 | Click the input, type a URL, press **Enter** | Submits — no need to reach for the mouse |
| E2 | Create a link | Focus moves to the **Short URL** field and the text is selected, so Ctrl+C works straight away |
| E3 | Tab through the page | Every control is reachable and has a visible focus outline |
| E4 | Trigger a validation error with a screen reader on | The message is announced without moving focus |
| E5 | Switch your OS to dark mode and reload | The page follows; text stays readable |

### F — Edge cases

| # | Do this | Expect |
| --- | --- | --- |
| F1 | Visit `http://localhost:3000/r/zzzzzzz` | A **Link not found** page |
| F2 | Visit `http://localhost:3000/some/unknown/page` | A **Page not found** page with a link back |
| F3 | Create the same URL twice | Two different short codes — this is intended, there is no de-duplication |
| F4 | Stop the `api` process and try to shorten something | An error message appears; the page does not crash or go blank |

### G — Rate limiting (optional, needs a terminal)

```bash
for i in $(seq 1 21); do
  curl -s -o /dev/null -w "%{http_code} " -X POST http://localhost:3000/api/links \
    -H "Content-Type: application/json" \
    -H "X-Owner-Id: 11111111-1111-4111-8111-111111111111" \
    -d "{\"url\":\"https://example.com/$i\"}"
done; echo
```

Expected: twenty `201`s, then a `429`. The limit is 20 creates per hour per IP. Restart the `api`
process to clear the counter.

---

## 6. Not built — please don't report these

These are deliberately out of scope for this version:

- No sign-up, login, or user accounts.
- No custom or vanity short codes — codes are always generated.
- No analytics beyond a click count: no charts, no referrers, no per-visit history.
- No editing a link's destination after it is created.
- No QR codes, link previews, or password-protected links.
- No checking whether a destination is safe to visit — the app validates the shape and network
  location of a URL, not its content.
- No deployment or hosting setup; this runs locally only.

The full list is in [`specs/001-url-shortener.md`](../specs/001-url-shortener.md) under *Out of
scope*.

---

## 7. Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| **504 error when shortening** | The API is not running. Look at the `api` pane in your terminal. Most often `.env` is missing on Option B — use `npm run dev:mem` instead, or copy `.env.example` to `.env` |
| `MONGODB_URI is required` in the api pane | Option B without a `.env`. Copy `.env.example` to `.env` |
| **Nothing at localhost:3000** | The `web` process is not running, or it chose another port. Check the terminal for the port it printed |
| `EADDRINUSE` on 3000 or 5000 | Something else holds the port. Close it, or set `PORT` in `.env` for the API |
| **First `npm run dev:mem` hangs for a minute** | It is downloading the MongoDB binary. Only happens once |
| **Page loads but the link list never fills** | Open the browser console and the `api` pane; usually the API stopped |
| **Tests fail on a fresh clone** | Run `npm install` first. The backend suite also downloads a MongoDB binary on first run |

---

## 8. Reporting a problem

Please include:

1. Which command you started with — `npm run dev:mem` or `npm run dev`.
2. The test number above, if it maps to one.
3. Exactly what you typed into the field.
4. What you expected and what happened, with the **exact** message text.
5. Anything printed in the `api` pane of your terminal at that moment.
6. Browser and OS.

A screenshot of the page plus the terminal is usually enough.
