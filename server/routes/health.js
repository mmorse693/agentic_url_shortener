'use strict';

const express = require('express');
const mongoose = require('mongoose');

const READY_STATE = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

function createHealthRouter() {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.json({
      status: 'ok',
      db: READY_STATE[mongoose.connection.readyState] || 'unknown',
    });
  });

  return router;
}

module.exports = createHealthRouter;
