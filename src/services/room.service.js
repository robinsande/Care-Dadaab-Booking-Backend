const { Room, Booking, Block } = require('../models');
const ApiError = require('../utils/ApiError');
const campService = require('./camp.service');
const blockService = require('./block.service');
const auditService = require('./audit.service');
const {
  ACTOR_TYPE,
  AUDIT_ACTIONS,
  ROOM_STATUS,
  ACTIVE_BOOKING_STATUSES,
} = require('../utils/constants');

const listRooms = (filter = {}) =>
  Room.find(filter)
    .populate('camp', 'name')
    .populate('block', 'name')
    .sort({ camp: 1, blockName: 1, roomNumber: 1 });

const listRoomsByCamp = (campId, filter = {}) =>
  listRooms({ camp: campId, ...filter });

const listBlocksByCamp = async (campId) => {
  const blocks = await Block.find({ camp: campId, isActive: true })
    .select('name')
    .sort({ name: 1 });
  return blocks.map((block) => block.name);
};

const listAvailableRooms = async ({
  campId,
  blockId,
  arrivalDate,
  departureDate,
} = {}) => {
  const roomFilter = {
    status: { $nin: [ROOM_STATUS.MAINTENANCE, ROOM_STATUS.BOOKED, ROOM_STATUS.OCCUPIED] },
    isActive: true,
  };
  if (campId) roomFilter.camp = campId;
  if (blockId) roomFilter.block = blockId;

  const rooms = await Room.find(roomFilter)
    .populate('camp', 'name')
    .sort({ blockName: 1, roomNumber: 1 });

  if (!arrivalDate || !departureDate) return rooms;

  const conflicting = await Booking.find({
    status: { $in: ACTIVE_BOOKING_STATUSES },
    arrivalDate: { $lt: new Date(departureDate) },
    departureDate: { $gt: new Date(arrivalDate) },
    ...(campId ? { camp: campId } : {}),
  }).select('room');

  const takenRoomIds = new Set(conflicting.map((b) => String(b.room)));
  return rooms.filter((room) => !takenRoomIds.has(String(room._id)));
};

const getRoomById = async (id) => {
  const room = await Room.findById(id).populate('camp', 'name').populate('block', 'name');
  if (!room) throw ApiError.notFound('Room not found.');
  return room;
};

const createRoom = async (data, actor) => {
  const camp = await campService.getCampById(data.campId);
  const block = await blockService.getBlockById(data.blockId);

  if (String(block.camp._id || block.camp) !== String(camp._id)) {
    throw ApiError.badRequest('Block does not belong to the selected camp.');
  }

  const blockName = block.name;
  const existing = await Room.findOne({
    camp: camp._id,
    blockName,
    roomNumber: data.roomNumber.trim(),
  });
  if (existing) {
    throw ApiError.conflict(
      `Room ${blockName} ${data.roomNumber} already exists in ${camp.name}.`
    );
  }

  const room = await Room.create({
    camp: camp._id,
    block: block._id,
    blockName,
    roomNumber: data.roomNumber.trim(),
    capacity: data.capacity,
    status: data.status || ROOM_STATUS.AVAILABLE,
    notes: data.notes,
    isActive: data.isActive !== undefined ? data.isActive : true,
  });

  await auditService.record({
    action: AUDIT_ACTIONS.ROOM_CREATED,
    actorType: ACTOR_TYPE.USER,
    actor,
    actorLabel: actor && actor.email,
    metadata: { roomId: room._id, label: room.label, campId: camp._id },
    message: `Room ${room.label} created in ${camp.name}.`,
  });

  return room;
};

const updateRoom = async (id, data, actor) => {
  const room = await getRoomById(id);

  if (data.blockId && String(data.blockId) !== String(room.block._id || room.block)) {
    const block = await blockService.getBlockById(data.blockId);
    if (String(block.camp._id || block.camp) !== String(room.camp._id || room.camp)) {
      throw ApiError.badRequest('Block does not belong to the room camp.');
    }
    room.block = block._id;
    room.blockName = block.name;
  }

  const nextRoomNumber = data.roomNumber ? data.roomNumber.trim() : room.roomNumber;
  if (nextRoomNumber !== room.roomNumber || (data.blockId && room.blockName)) {
    const clash = await Room.findOne({
      _id: { $ne: room._id },
      camp: room.camp._id || room.camp,
      blockName: room.blockName,
      roomNumber: nextRoomNumber,
    });
    if (clash) {
      throw ApiError.conflict(`Block ${room.blockName} Room ${nextRoomNumber} already exists.`);
    }
    room.roomNumber = nextRoomNumber;
  }

  ['capacity', 'status', 'notes', 'isActive'].forEach((field) => {
    if (data[field] !== undefined) room[field] = data[field];
  });

  await room.save();

  await auditService.record({
    action: AUDIT_ACTIONS.ROOM_UPDATED,
    actorType: ACTOR_TYPE.USER,
    actor,
    actorLabel: actor && actor.email,
    metadata: { roomId: room._id, label: room.label },
    message: `Room ${room.label} updated.`,
  });

  return room;
};

const deleteRoom = async (id, actor) => {
  const room = await getRoomById(id);

  const activeBooking = await Booking.findOne({
    room: room._id,
    status: { $in: ACTIVE_BOOKING_STATUSES },
  });
  if (activeBooking) {
    throw ApiError.conflict('Cannot delete a room with an active booking.');
  }

  const historicalBooking = await Booking.findOne({ room: room._id });
  if (historicalBooking) {
    throw ApiError.conflict('Cannot delete a room that has been used in a booking.');
  }

  await Room.findByIdAndDelete(room._id);

  await auditService.record({
    action: AUDIT_ACTIONS.ROOM_DELETED,
    actorType: ACTOR_TYPE.USER,
    actor,
    actorLabel: actor && actor.email,
    metadata: { roomId: room._id, label: room.label },
    message: `Room ${room.label} deleted.`,
  });

  return room;
};

const assertRoomAssignable = async ({
  roomId,
  campId,
  blockId,
  arrivalDate,
  departureDate,
  excludeBookingId,
}) => {
  const room = await Room.findById(roomId).populate('camp', 'name isActive');
  if (!room || !room.isActive) throw ApiError.notFound('Room not found.');

  if (campId && String(room.camp._id || room.camp) !== String(campId)) {
    throw ApiError.badRequest('Room does not belong to the selected camp.');
  }

  if (blockId && String(room.block) !== String(blockId)) {
    throw ApiError.badRequest('Room does not belong to the selected block.');
  }

  if (!room.camp.isActive) {
    throw ApiError.conflict('The selected camp is not active.');
  }

  if (room.status === ROOM_STATUS.MAINTENANCE) {
    throw ApiError.conflict(`${room.label} is under maintenance and cannot be assigned.`);
  }

  if ([ROOM_STATUS.BOOKED, ROOM_STATUS.OCCUPIED].includes(room.status)) {
    throw ApiError.conflict(`${room.label} is currently occupied and cannot be assigned.`);
  }

  if (!arrivalDate || !departureDate) {
    return room;
  }

  const overlapFilter = {
    room: room._id,
    status: { $in: ACTIVE_BOOKING_STATUSES },
    arrivalDate: { $lt: new Date(departureDate) },
    departureDate: { $gt: new Date(arrivalDate) },
  };
  if (excludeBookingId) overlapFilter._id = { $ne: excludeBookingId };

  const conflict = await Booking.findOne(overlapFilter);
  if (conflict) {
    throw ApiError.conflict(
      `${room.label} already has an overlapping booking (${conflict.bookingReference}).`
    );
  }

  return room;
};

const syncRoomStatus = async (roomId) => {
  const room = await Room.findById(roomId);
  if (!room || room.status === ROOM_STATUS.MAINTENANCE) return room;

  const activeBookings = await Booking.find({
    room: room._id,
    status: { $in: ACTIVE_BOOKING_STATUSES },
    departureDate: { $gt: new Date() },
  }).select('status').sort({ status: 1 });

  const nextStatus = activeBookings.some((booking) => booking.status === 'Checked In')
    ? ROOM_STATUS.OCCUPIED
    : activeBookings.length
      ? ROOM_STATUS.BOOKED
      : ROOM_STATUS.AVAILABLE;

  if (room.status !== nextStatus) {
    room.status = nextStatus;
    await room.save();
  }
  return room;
};

module.exports = {
  listRooms,
  listRoomsByCamp,
  listBlocksByCamp,
  listAvailableRooms,
  getRoomById,
  syncRoomStatus,
  createRoom,
  updateRoom,
  deleteRoom,
  assertRoomAssignable,
};
