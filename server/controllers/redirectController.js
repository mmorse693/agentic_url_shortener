'use strict';

const linkService = require('../services/linkService');
const { NotFoundError, ExpiredLinkError } = require('../utils/errors');

/**
 * These pages are hit by browsers, not by fetch, so the failure cases render
 * HTML rather than the JSON envelope the /api routes use.
 */
function renderLinkError(res, status, heading, detail) {
  res.status(status).type('html').send(
    `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${heading}</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center;
         font: 16px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif;
         background: #f4f6f8; color: #141922; padding: 24px; }
  main { max-width: 32rem; text-align: center; }
  h1 { font-size: 1.5rem; margin: 0 0 .5rem; letter-spacing: -.02em; }
  p { margin: 0; color: #5c6472; }
  code { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: .9em; }
  @media (prefers-color-scheme: dark) {
    body { background: #0d1017; color: #e7ebf3; }
    p { color: #98a1b0; }
  }
</style>
</head>
<body><main><h1>${heading}</h1><p>${detail}</p></main></body>
</html>`
  );
}

async function getRedirect(req, res, next) {
  try {
    const link = await linkService.resolveAndCount(req.params.code);

    // 302, never 301: a 301 is cached permanently by browsers, and every
    // cached visit after the first would stop reaching us and stop counting.
    res.set('Cache-Control', 'no-store');
    return res.redirect(302, link.originalUrl);
  } catch (err) {
    if (err instanceof ExpiredLinkError) {
      return renderLinkError(
        res,
        410,
        'Link expired',
        'This short link has expired and no longer forwards anywhere.'
      );
    }
    if (err instanceof NotFoundError) {
      return renderLinkError(
        res,
        404,
        'Link not found',
        "We don't have a short link with that code."
      );
    }
    return next(err);
  }
}

module.exports = { getRedirect, renderLinkError };
