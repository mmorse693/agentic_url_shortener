'use strict';

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

/**
 * Opt-in database harness.
 *
 * Called from the top of an integration suite. It is deliberately not wired in
 * as a global `setupFilesAfterEnv`: the unit suites never touch Mongo, and
 * booting an in-memory server for them would cost seconds per file for nothing.
 */
function useTestDb() {
  let mongod;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
  });

  afterEach(async () => {
    const { collections } = mongoose.connection;
    await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongod) await mongod.stop();
  });
}

module.exports = { useTestDb };
