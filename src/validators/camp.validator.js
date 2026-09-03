const { body } = require('express-validator');

const createCampRules = [
  body('name').trim().notEmpty().withMessage('Camp name is required.'),
  body('code').optional().trim(),
  body('description').optional().trim(),
  body('isActive').optional().isBoolean(),
];

const updateCampRules = [
  body('name').optional().trim().notEmpty(),
  body('code').optional().trim(),
  body('description').optional().trim(),
  body('isActive').optional().isBoolean(),
];

module.exports = { createCampRules, updateCampRules };
