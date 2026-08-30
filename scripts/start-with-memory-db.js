'use strict';

/**
 * Starts the API against a throwaway in-memory MongoDB.
 *
 * For evaluation and manual testing on a machine with no MongoDB installed.
 * Data lives only as long as the process, which makes every run a clean slate.
 * `npm run server` is the real thing and needs a real database.
 *
 * The first run downloads a mongod binary (~100 MB) and caches it; later runs
 * start in a second or two.
 */

const { MongoMemoryServer } = require('mongodb-memory-server');

async function main() {
  console.log('[mem] starting an in-memory MongoDB (first run downloads mongod, please wait)…');

  const mongod = await MongoMemoryServer.create();

  // Set before requiring the server: loadConfig() reads process.env once, and
  // dotenv does not overwrite values that are already set.
  process.env.MONGODB_URI = mongod.getUri();

  const { start } = require('../server/index.js');
  await start();

  console.log('[mem] in-memory database ready — data is discarded when this process stops');

  const stop = async () => {
    await mongod.stop();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((err) => {
  console.error('[mem] failed to start:', err.message);
  process.exit(1);
});
