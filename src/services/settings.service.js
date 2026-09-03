const { Settings } = require('../models');
const auditService = require('./audit.service');
const { ACTOR_TYPE, AUDIT_ACTIONS } = require('../utils/constants');

const getSettings = async () => {
  let settings = await Settings.findOne().sort({ createdAt: 1 });
  if (!settings) {
    settings = await Settings.create({});
  }
  return settings;
};

const updateSettings = async (data, actor) => {
  const settings = await getSettings();

  ['facilityName', 'supportEmail', 'supportPhone'].forEach((field) => {
    if (data[field] !== undefined) settings[field] = data[field];
  });

  if (data.payment) {
    settings.payment = settings.payment || {};
    ['mpesaPaybillNumber', 'bankName', 'bankAccountName', 'bankAccountNumber'].forEach(
      (field) => {
        if (data.payment[field] !== undefined) settings.payment[field] = data.payment[field];
      }
    );
  }

  await settings.save();

  if (actor) {
    await auditService.record({
      action: AUDIT_ACTIONS.SETTINGS_UPDATED,
      actorType: ACTOR_TYPE.USER,
      actor,
      actorLabel: actor.email,
      message: 'System settings updated.',
    });
  }

  return settings;
};

module.exports = { getSettings, updateSettings };
