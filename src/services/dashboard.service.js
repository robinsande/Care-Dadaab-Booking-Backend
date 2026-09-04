const { Booking, Room, Invoice, Camp } = require('../models');
const {
  BOOKING_STATUS,
  ACTIVE_BOOKING_STATUSES,
  ROOM_STATUS,
  INVOICE_PAYMENT_STATUS,
} = require('../utils/constants');
const { startOfDay, endOfDay } = require('../utils/dates');

const getOccupiedRoomCount = async (date = new Date()) => {
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);

  const [bookingRoomIds, roomStatusIds] = await Promise.all([
    Booking.distinct('room', {
      status: { $in: ACTIVE_BOOKING_STATUSES },
      arrivalDate: { $lte: dayEnd },
      departureDate: { $gt: dayStart },
    }),
    Room.distinct('_id', { status: ROOM_STATUS.OCCUPIED }),
  ]);

  return new Set([...bookingRoomIds, ...roomStatusIds].map(String)).size;
};

const getDashboard = async () => {
  const todayStart = startOfDay();
  const todayEnd = endOfDay();

  const [
    todaysArrivals,
    todaysDepartures,
    occupiedRooms,
    totalActiveRooms,
    bookedRooms,
    maintenanceRooms,
    outstandingInvoices,
    recentBookings,
    camps,
    roomStatusRows,
  ] = await Promise.all([
    Booking.countDocuments({
      status: { $in: [BOOKING_STATUS.BOOKED, BOOKING_STATUS.CHECKED_IN] },
      arrivalDate: { $gte: todayStart, $lte: todayEnd },
    }),
    Booking.countDocuments({
      status: { $in: [BOOKING_STATUS.CHECKED_IN, BOOKING_STATUS.BOOKED] },
      departureDate: { $gte: todayStart, $lte: todayEnd },
    }),
    getOccupiedRoomCount(),
    Room.countDocuments({ isActive: true, status: { $ne: ROOM_STATUS.MAINTENANCE } }),
    Booking.distinct('room', {
      status: BOOKING_STATUS.BOOKED,
      arrivalDate: { $lte: todayEnd },
      departureDate: { $gt: todayStart },
    }),
    Room.countDocuments({ status: ROOM_STATUS.MAINTENANCE, isActive: true }),
    Invoice.countDocuments({ paymentStatus: INVOICE_PAYMENT_STATUS.UNPAID }),
    Booking.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('camp', 'name')
      .select('bookingReference status campName guest arrivalDate departureDate createdAt'),
    Camp.find({ isActive: true }).sort({ name: 1 }),
    Room.find({ isActive: true })
      .populate('camp', 'name')
      .sort({ campName: 1, blockName: 1, roomNumber: 1 })
      .select('camp blockName roomNumber status'),
  ]);

  const bookingsByCamp = await Booking.aggregate([
    {
      $match: {
        status: { $in: ACTIVE_BOOKING_STATUSES },
      },
    },
    {
      $group: {
        _id: '$campName',
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const bookedRoomCount = new Set(bookedRooms.map(String)).size;
  const availableRooms = Math.max(totalActiveRooms - occupiedRooms - bookedRoomCount, 0);

  return {
    todaysArrivals,
    todaysDepartures,
    occupiedRooms,
    availableRooms,
    maintenanceRooms,
    outstandingInvoices,
    recentBookings,
    bookingsByCamp: bookingsByCamp.map((row) => ({
      campName: row._id,
      count: row.count,
    })),
    camps: camps.map((c) => ({ id: c._id, name: c.name })),
    roomStatuses: roomStatusRows.map((room) => ({
      campName: room.camp?.name || '—',
      blockName: room.blockName,
      roomNumber: room.roomNumber,
      status: room.status,
    })),
  };
};

module.exports = { getDashboard, getOccupiedRoomCount };
