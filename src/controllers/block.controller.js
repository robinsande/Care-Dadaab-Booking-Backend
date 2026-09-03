const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');
const blockService = require('../services/block.service');

const listBlocks = asyncHandler(async (req, res) => {
  const filter = req.query.includeInactive === 'true' ? {} : { isActive: true };
  const blocks = await blockService.listBlocksByCamp(req.params.campId, filter);
  sendSuccess(res, { message: 'Blocks retrieved.', data: blocks });
});

const getBlock = asyncHandler(async (req, res) => {
  const block = await blockService.getBlockById(req.params.blockId);
  sendSuccess(res, { message: 'Block retrieved.', data: block });
});

const createBlock = asyncHandler(async (req, res) => {
  const block = await blockService.createBlock(req.params.campId, req.body, req.user);
  sendSuccess(res, { statusCode: 201, message: 'Block created.', data: block });
});

const updateBlock = asyncHandler(async (req, res) => {
  const block = await blockService.updateBlock(req.params.blockId, req.body, req.user);
  sendSuccess(res, { message: 'Block updated.', data: block });
});

const deleteBlock = asyncHandler(async (req, res) => {
  const block = await blockService.deleteBlock(req.params.blockId, req.user);
  sendSuccess(res, { message: 'Block deleted.', data: block });
});

module.exports = { listBlocks, getBlock, createBlock, updateBlock, deleteBlock };
