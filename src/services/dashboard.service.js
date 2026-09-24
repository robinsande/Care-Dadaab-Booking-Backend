const { Booking, Room, Invoice, Camp, GuestRequest } = require('../models');
const {
  BOOKING_STATUS,
  ACTIVE_BOOKING_STATUSES,
  ROOM_STATUS,
  INVOICE_PAYMENT_STATUS,
} = require('../utils/constants');
const { startOfDay, endOfDay } = require('../utils/dates');

const DASHBOARD_CACHE_TTL_MS = 15 * 1000;
let dashboardCache = { expiresAt: 0, value: null };
let dashboardFetchPromise = null;

const getOccupiedRoomCount = async () => {
  const occupiedRoomIds = await Booking.distinct('room', {
    status: BOOKING_STATUS.CHECKED_IN,
    checkedOutAt: null,
    departureDate: { $gt: new Date() },
  });

  return new Set(occupiedRoomIds.map(String)).size;
};

const getDashboard = async () => {
  const now = Date.now();
  if (dashboardCache.value && now < dashboardCache.expiresAt) {
    return dashboardCache.value;
  }

  if (dashboardFetchPromise) return dashboardFetchPromise;

  dashboardFetchPromise = (async () => {
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
      bookingsByCamp,
      pendingGuestRequests,
    ] = await Promise.all([
      Booking.countDocuments({
        status: { $in: [BOOKING_STATUS.BOOKED, BOOKING_STATUS.CHECKED_IN] },
        checkedOutAt: null,
        arrivalDate: { $gte: todayStart, $lte: todayEnd },
      }),
      Booking.countDocuments({
        status: { $in: [BOOKING_STATUS.CHECKED_IN, BOOKING_STATUS.BOOKED] },
        checkedOutAt: null,
        departureDate: { $gte: todayStart, $lte: todayEnd },
      }),
      getOccupiedRoomCount(),
      Room.countDocuments({ isActive: true }),
      Booking.distinct('room', {
        status: BOOKING_STATUS.BOOKED,
        checkedOutAt: null,
        arrivalDate: { $lte: todayEnd },
        departureDate: { $gt: todayStart },
      }),
      Room.countDocuments({ status: ROOM_STATUS.MAINTENANCE, isActive: true }),
      Invoice.countDocuments({ paymentStatus: INVOICE_PAYMENT_STATUS.UNPAID }),
      Booking.find()
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('camp', 'name')
        .select('bookingReference status campName guest arrivalDate departureDate createdAt')
        .lean(),
      Camp.find({ isActive: true }).sort({ name: 1 }).lean(),
      Room.find({ isActive: true })
        .populate('camp', 'name')
        .sort({ campName: 1, blockName: 1, roomNumber: 1 })
        .select('camp blockName roomNumber status')
        .lean(),
      Booking.aggregate([
        { $match: { status: { $in: ACTIVE_BOOKING_STATUSES } } },
        { $group: { _id: '$campName', count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      GuestRequest.find({ type: 'booking', status: 'pending' })
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('guest', 'firstName lastName email')
        .populate('camp', 'name')
        .select('guest camp arrivalDate departureDate stayType reason createdAt')
        .lean(),
    ]);

    const bookedRoomCount = new Set(bookedRooms.map(String)).size;
    const availableRooms = Math.max(
      totalActiveRooms - occupiedRooms - bookedRoomCount - maintenanceRooms,
      0,
    );

    const result = {
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
        pendingGuestRequests,
      camps: camps.map((c) => ({ id: c._id, name: c.name })),
      roomStatuses: roomStatusRows.map((room) => ({
        campName: room.camp?.name || '—',
        blockName: room.blockName,
        roomNumber: room.roomNumber,
        status: room.status,
      })),
    };

    dashboardCache = {
      expiresAt: Date.now() + DASHBOARD_CACHE_TTL_MS,
      value: result,
    };

    return result;
  })();

  try {
    return await dashboardFetchPromise;
  } finally {
    dashboardFetchPromise = null;
  }
};

module.exports = { getDashboard, getOccupiedRoomCount };
