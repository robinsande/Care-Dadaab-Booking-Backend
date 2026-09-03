const { param } = require('express-validator');

/**
 * Reusable validator ensuring a route param is a valid Mongo ObjectId.
 * @param {string} name Param name (defaults to 'id').
 */
const mongoIdParam = (name = 'id') =>
  param(name).isMongoId().withMessage(`Invalid ${name}.`);

module.exports = { mongoIdParam };
