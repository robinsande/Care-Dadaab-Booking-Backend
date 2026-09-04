const express = require('express');
const userController = require('../controllers/user.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { superAdminOnly } = require('../middleware/role.middleware');
const { validate } = require('../middleware/validate.middleware');
const { mongoIdParam } = require('../validators/common.validator');
const { createUserRules, updateUserRules } = require('../validators/user.validator');

const router = express.Router();

// User management is restricted to Super Admins.
router.use(authenticate, superAdminOnly);

router.get('/', userController.listUsers);
router.get('/:id', validate([mongoIdParam('id')]), userController.getUser);
router.post('/', validate(createUserRules), userController.createUser);
router.put('/:id', validate([mongoIdParam('id'), ...updateUserRules]), userController.updateUser);
router.post('/:id/reset-password', validate([mongoIdParam('id')]), userController.resetPassword);
router.delete('/:id', validate([mongoIdParam('id')]), userController.deactivateUser);

module.exports = router;
