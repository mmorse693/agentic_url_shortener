'use strict';

const express = require('express');

const { getRedirect } = require('../controllers/redirectController');

function createRedirectRouter() {
  const router = express.Router();
  router.get('/:code', getRedirect);
  return router;
}

module.exports = createRedirectRouter;
