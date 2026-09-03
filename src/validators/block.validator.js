const { body } = require('express-validator');

const createBlockRules = [
  body('name').trim().notEmpty().withMessage('Block name is required.'),
  body('isActive').optional().isBoolean(),
];

const updateBlockRules = [
  body('name').optional().trim().notEmpty(),
  body('isActive').optional().isBoolean(),
];

module.exports = { createBlockRules, updateBlockRules };
