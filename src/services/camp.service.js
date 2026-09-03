const { Camp, Block, Booking } = require('../models');
const ApiError = require('../utils/ApiError');
const auditService = require('./audit.service');
const { ACTOR_TYPE, AUDIT_ACTIONS } = require('../utils/constants');

const listCamps = (filter = {}) =>
  Camp.find(filter).sort({ name: 1 });

const listActiveCamps = () => listCamps({ isActive: true });

const getCampById = async (id) => {
  const camp = await Camp.findById(id);
  if (!camp) throw ApiError.notFound('Camp not found.');
  return camp;
};

const createCamp = async (data, actor) => {
  const existing = await Camp.findOne({ name: data.name.trim() });
  if (existing) throw ApiError.conflict(`Camp "${data.name}" already exists.`);

  const camp = await Camp.create({
    name: data.name.trim(),
    code: data.code ? data.code.trim().toLowerCase() : undefined,
    description: data.description ? data.description.trim() : '',
    isActive: data.isActive !== undefined ? data.isActive : true,
  });

  await auditService.record({
    action: AUDIT_ACTIONS.CAMP_CREATED,
    actorType: ACTOR_TYPE.USER,
    actor,
    actorLabel: actor && actor.email,
    metadata: { campId: camp._id, name: camp.name },
    message: `Camp "${camp.name}" created.`,
  });

  return camp;
};

const updateCamp = async (id, data, actor) => {
  const camp = await getCampById(id);

  if (data.name && data.name.trim() !== camp.name) {
    const clash = await Camp.findOne({ _id: { $ne: camp._id }, name: data.name.trim() });
    if (clash) throw ApiError.conflict(`Camp "${data.name}" already exists.`);
    camp.name = data.name.trim();
  }

  if (data.code !== undefined) camp.code = data.code ? data.code.trim().toLowerCase() : null;
  if (data.description !== undefined) camp.description = data.description.trim();
  if (data.isActive !== undefined) camp.isActive = data.isActive;

  await camp.save();

  await auditService.record({
    action: AUDIT_ACTIONS.CAMP_UPDATED,
    actorType: ACTOR_TYPE.USER,
    actor,
    actorLabel: actor && actor.email,
    metadata: { campId: camp._id, name: camp.name },
    message: `Camp "${camp.name}" updated.`,
  });

  return camp;
};

const deleteCamp = async (id, actor) => {
  const camp = await getCampById(id);

  const blockCount = await Block.countDocuments({ camp: camp._id });
  if (blockCount > 0) {
    throw ApiError.conflict('Cannot delete a camp that has blocks. Remove or reassign blocks first.');
  }

  const bookingCount = await Booking.countDocuments({ camp: camp._id });
  if (bookingCount > 0) {
    throw ApiError.conflict('Cannot delete a camp that has booking history.');
  }

  await Camp.findByIdAndDelete(camp._id);

  await auditService.record({
    action: AUDIT_ACTIONS.CAMP_DELETED,
    actorType: ACTOR_TYPE.USER,
    actor,
    actorLabel: actor && actor.email,
    metadata: { campId: camp._id, name: camp.name },
    message: `Camp "${camp.name}" deleted.`,
  });

  return camp;
};

module.exports = {
  listCamps,
  listActiveCamps,
  getCampById,
  createCamp,
  updateCamp,
  deleteCamp,
};
