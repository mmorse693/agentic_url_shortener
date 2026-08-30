'use strict';

const linkService = require('../services/linkService');

/**
 * Thin by design: parse the request, call the service, format the response.
 * No validation logic and no model access lives here.
 */

async function postLink(req, res) {
  const config = req.app.get('config');
  const body = req.body || {};

  const link = await linkService.createLink({
    url: body.url,
    expiresAt: body.expiresAt,
    ownerId: req.ownerId,
    baseUrl: config.baseUrl,
  });

  res.status(201).json(link.toApi(config.baseUrl));
}

async function getLinks(req, res) {
  const config = req.app.get('config');
  const links = await linkService.listForOwner(req.ownerId);
  res.status(200).json({ links: links.map((link) => link.toApi(config.baseUrl)) });
}

async function deleteLink(req, res) {
  await linkService.deleteForOwner(req.params.code, req.ownerId);
  res.status(204).end();
}

module.exports = { postLink, getLinks, deleteLink };
