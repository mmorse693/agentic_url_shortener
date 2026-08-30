'use strict';

const mongoose = require('mongoose');

mongoose.set('strictQuery', true);

async function connect(uri) {
  if (!uri) throw new Error('connect(uri) requires a MongoDB connection string.');

  mongoose.connection.on('error', (err) => {
    console.error('[db] connection error:', err.message);
  });

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  return mongoose.connection;
}

async function disconnect() {
  await mongoose.disconnect();
}

function isConnected() {
  return mongoose.connection.readyState === 1;
}

module.exports = { connect, disconnect, isConnected };
