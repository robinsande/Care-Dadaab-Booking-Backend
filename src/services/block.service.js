const { Block, Room } = require('../models');
const ApiError = require('../utils/ApiError');
const campService = require('./camp.service');
const auditService = require('./audit.service');
const { ACTOR_TYPE, AUDIT_ACTIONS } = require('../utils/constants');

const listBlocksByCamp = (campId, filter = {}) =>
  Block.find({ camp: campId, ...filter }).sort({ name: 1 });

const listActiveBlocksByCamp = (campId) => listBlocksByCamp(campId, { isActive: true });

const getBlockById = async (id) => {
  const block = await Block.findById(id).populate('camp', 'name isActive');
  if (!block) throw ApiError.notFound('Block not found.');
  return block;
};

const createBlock = async (campId, data, actor) => {
  const camp = await campService.getCampById(campId);

  const existing = await Block.findOne({ camp: camp._id, name: data.name.trim() });
  if (existing) {
    throw ApiError.conflict(`Block "${data.name}" already exists in ${camp.name}.`);
  }

  const block = await Block.create({
    camp: camp._id,
    name: data.name.trim(),
    isActive: data.isActive !== undefined ? data.isActive : true,
  });

  await auditService.record({
    action: AUDIT_ACTIONS.BLOCK_CREATED,
    actorType: ACTOR_TYPE.USER,
    actor,
    actorLabel: actor && actor.email,
    metadata: { blockId: block._id, campId: camp._id, name: block.name },
    message: `Block "${block.name}" created in ${camp.name}.`,
  });

  return block;
};

const updateBlock = async (id, data, actor) => {
  const block = await getBlockById(id);

  if (data.name && data.name.trim() !== block.name) {
    const clash = await Block.findOne({
      _id: { $ne: block._id },
      camp: block.camp,
      name: data.name.trim(),
    });
    if (clash) throw ApiError.conflict(`Block "${data.name}" already exists in this camp.`);

    const previousName = block.name;
    block.name = data.name.trim();
    await block.save();

    await Room.updateMany(
      { block: block._id },
      { $set: { blockName: block.name } }
    );

    await auditService.record({
      action: AUDIT_ACTIONS.BLOCK_UPDATED,
      actorType: ACTOR_TYPE.USER,
      actor,
      actorLabel: actor && actor.email,
      metadata: { blockId: block._id, name: block.name, previousName },
      message: `Block "${previousName}" renamed to "${block.name}".`,
    });

    return block;
  }

  if (data.isActive !== undefined) block.isActive = data.isActive;

  await block.save();

  await auditService.record({
    action: AUDIT_ACTIONS.BLOCK_UPDATED,
    actorType: ACTOR_TYPE.USER,
    actor,
    actorLabel: actor && actor.email,
    metadata: { blockId: block._id, name: block.name },
    message: `Block "${block.name}" updated.`,
  });

  return block;
};

const deleteBlock = async (id, actor) => {
  const block = await getBlockById(id);

  const roomCount = await Room.countDocuments({ block: block._id });
  if (roomCount > 0) {
    throw ApiError.conflict('Cannot delete a block that has rooms. Remove or reassign rooms first.');
  }

  await Block.findByIdAndDelete(block._id);

  await auditService.record({
    action: AUDIT_ACTIONS.BLOCK_DELETED,
    actorType: ACTOR_TYPE.USER,
    actor,
    actorLabel: actor && actor.email,
    metadata: { blockId: block._id, name: block.name },
    message: `Block "${block.name}" deleted.`,
  });

  return block;
};

module.exports = {
  listBlocksByCamp,
  listActiveBlocksByCamp,
  getBlockById,
  createBlock,
  updateBlock,
  deleteBlock,
};
