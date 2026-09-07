const express = require('express');
const mpesaController = require('../controllers/mpesa.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { anyStaff } = require('../middleware/role.middleware');

const router = express.Router();

router.post('/c2b/validation', mpesaController.validate);
router.post('/c2b/confirmation', mpesaController.confirm);
router.post('/stk/callback', mpesaController.stkCallback);
router.post('/c2b/register', authenticate, anyStaff, mpesaController.register);
router.post('/stk/:invoiceId', authenticate, anyStaff, mpesaController.initiateStkPush);

module.exports = router;
