const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');
const roomService = require('../services/room.service');

const listRooms = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.campId) filter.camp = req.query.campId;
  if (req.query.blockId) filter.block = req.query.blockId;
  if (req.query.includeInactive !== 'true') filter.isActive = true;
  const rooms = await roomService.listRooms(filter);
  sendSuccess(res, { message: 'Rooms retrieved.', data: rooms });
});

const listAvailableRooms = asyncHandler(async (req, res) => {
  const rooms = await roomService.listAvailableRooms(req.query);
  sendSuccess(res, { message: 'Available rooms retrieved.', data: rooms });
});

const getRoom = asyncHandler(async (req, res) => {
  const room = await roomService.getRoomById(req.params.id);
  sendSuccess(res, { message: 'Room retrieved.', data: room });
});

const createRoom = asyncHandler(async (req, res) => {
  const room = await roomService.createRoom(req.body, req.user);
  sendSuccess(res, { statusCode: 201, message: 'Room created.', data: room });
});

const updateRoom = asyncHandler(async (req, res) => {
  const room = await roomService.updateRoom(req.params.id, req.body, req.user);
  sendSuccess(res, { message: 'Room updated.', data: room });
});

const deleteRoom = asyncHandler(async (req, res) => {
  const room = await roomService.deleteRoom(req.params.id, req.user);
  sendSuccess(res, { message: 'Room deleted.', data: room });
});

module.exports = {
  listRooms,
  listAvailableRooms,
  getRoom,
  createRoom,
  updateRoom,
  deleteRoom,
};
