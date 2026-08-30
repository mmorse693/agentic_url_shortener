const { createProxyMiddleware } = require('http-proxy-middleware');

/**
 * Read by the CRA dev server automatically.
 *
 * `/r` has to be proxied alongside `/api`, or the dev server swallows every
 * short link and serves index.html instead of letting Express redirect.
 *
 * pathFilter is used rather than an app.use('/api', ...) mount so the original
 * URL reaches the API unchanged.
 */
module.exports = function setupProxy(app) {
  const target = process.env.API_PROXY_TARGET || 'http://localhost:5000';

  app.use(
    createProxyMiddleware({
      pathFilter: ['/api', '/r'],
      target,
      changeOrigin: true,
    })
  );
};
