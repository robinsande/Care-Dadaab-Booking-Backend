const { body } = require('express-validator');

const updateSettingsRules = [
  body('facilityName').optional().trim(),
  body('supportEmail')
    .optional({ checkFalsy: true })
    .isEmail()
    .withMessage('Support email must be a valid email address.')
    .normalizeEmail(),
  body('supportPhone').optional().trim(),
  body('payment.mpesaPaybillNumber').optional().trim(),
  body('payment.bankName').optional().trim(),
  body('payment.bankAccountName').optional().trim(),
  body('payment.bankAccountNumber').optional().trim(),
  body('notifications.sendBookingConfirmation').optional().isBoolean(),
];

module.exports = { updateSettingsRules };
