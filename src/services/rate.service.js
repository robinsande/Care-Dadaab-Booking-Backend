const { Rate } = require('../models');
const ApiError = require('../utils/ApiError');
const campService = require('./camp.service');
const auditService = require('./audit.service');
const { ACTOR_TYPE, AUDIT_ACTIONS, STAY_TYPE_VALUES } = require('../utils/constants');

const getCurrentRatesForCamp = async (campId) => {
  await campService.getCampById(campId);

  const rates = await Promise.all(
    STAY_TYPE_VALUES.map(async (stayType) => {
      const rate = await Rate.findOne({ camp: campId, stayType, effectiveTo: null }).sort({
        effectiveFrom: -1,
      });
      return { stayType, rate };
    })
  );

  return rates;
};

const getRateHistory = async (campId, { stayType } = {}) => {
  await campService.getCampById(campId);

  const filter = { camp: campId };
  if (stayType) filter.stayType = stayType;

  return Rate.find(filter).sort({ effectiveFrom: -1 }).populate('createdBy', 'firstName lastName email');
};

const getCurrentRate = async (campId, stayType) => {
  const rate = await Rate.findOne({ camp: campId, stayType, effectiveTo: null }).sort({
    effectiveFrom: -1,
  });
  if (!rate) {
    throw ApiError.notFound(`No active ${stayType} rate configured for this camp.`);
  }
  return rate;
};

const createRateVersion = async (campId, data, actor) => {
  await campService.getCampById(campId);

  const { stayType, amount, currency, notes } = data;
  if (!STAY_TYPE_VALUES.includes(stayType)) {
    throw ApiError.badRequest(`Stay type must be one of: ${STAY_TYPE_VALUES.join(', ')}.`);
  }

  const now = new Date();
  const current = await Rate.findOne({ camp: campId, stayType, effectiveTo: null });
  if (current) {
    current.effectiveTo = now;
    await current.save();
  }

  const rate = await Rate.create({
    camp: campId,
    stayType,
    amount,
    currency: currency || 'KES',
    effectiveFrom: now,
    effectiveTo: null,
    createdBy: actor._id,
    notes: notes || '',
  });

  await auditService.record({
    action: current ? AUDIT_ACTIONS.RATE_UPDATED : AUDIT_ACTIONS.RATE_CREATED,
    actorType: ACTOR_TYPE.USER,
    actor,
    actorLabel: actor && actor.email,
    metadata: { campId, stayType, amount: rate.amount, currency: rate.currency },
    message: `${stayType} rate for camp set to ${rate.currency} ${rate.amount} per night.`,
  });

  return rate;
};

module.exports = {
  getCurrentRatesForCamp,
  getRateHistory,
  getCurrentRate,
  createRateVersion,
};
