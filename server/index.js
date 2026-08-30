'use strict';

const { loadConfig } = require('./config/env');
const { connect, disconnect } = require('./db');
const { createApp } = require('./app');

async function start() {
  const config = loadConfig();

  await connect(config.mongoUri);
  console.log(`[api] connected to MongoDB`);

  const server = createApp().listen(config.port, () => {
    console.log(`[api] listening on http://localhost:${config.port}`);
    console.log(`[api] short links are built from ${config.baseUrl}`);
  });

  const shutdown = async (signal) => {
    console.log(`\n[api] ${signal} received, shutting down`);
    server.close(async () => {
      await disconnect();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  return server;
}

if (require.main === module) {
  start().catch((err) => {
    console.error('[api] failed to start:', err.message);
    process.exit(1);
  });
}

module.exports = { start };
