'use strict';

const express = require('express');

const requireOwner = require('../middleware/requireOwner');
const asyncHandler = require('../utils/asyncHandler');
const { postLink, getLinks, deleteLink } = require('../controllers/linkController');

/**
 * A factory, not a module-level router: the limiters are built per app so each
 * instance owns its counters.
 */
function createLinksRouter({ createLimiter, readLimiter }) {
  const router = express.Router();

  router.post('/', createLimiter, requireOwner, asyncHandler(postLink));
  router.get('/', readLimiter, requireOwner, asyncHandler(getLinks));
  router.delete('/:code', readLimiter, requireOwner, asyncHandler(deleteLink));

  return router;
}

module.exports = createLinksRouter;
