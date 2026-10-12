const { Booking, Room, Invoice, Camp, GuestRequest } = require('../models');
const {
  BOOKING_STATUS,
  ACTIVE_BOOKING_STATUSES,
  ROOM_STATUS,
  INVOICE_PAYMENT_STATUS,
  STAY_TYPE_VALUES,
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
    const currentDate = new Date();
    const sixMonthStart = new Date(Date.UTC(
      currentDate.getUTCFullYear(),
      currentDate.getUTCMonth() - 5,
      1,
    ));

    const [
      todaysArrivals,
      todaysDepartures,
      occupiedRooms,
      totalActiveRooms,
      bookedRoomIds,
      maintenanceRooms,
      outstandingInvoices,
      recentBookings,
      camps,
      bookingsByCamp,
      pendingGuestRequests,
      revenueByMonthRows,
      revenueByStayTypeRows,
      bookingsByStayTypeRows,
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
      Booking.aggregate([
        { $match: { status: { $in: ACTIVE_BOOKING_STATUSES } } },
        { $group: { _id: '$campName', count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      GuestRequest.find({ type: 'booking' })
        .sort({ status: 1, createdAt: -1 })
        .limit(50)
        .populate('guest', 'firstName lastName email')
        .populate('camp', 'name')
        .select('guest camp arrivalDate departureDate stayType reason status createdAt')
        .lean(),
      Invoice.aggregate([
        { $match: { generatedAt: { $gte: sixMonthStart, $lte: currentDate } } },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m', date: '$generatedAt', timezone: 'UTC' },
            },
            totalRevenue: { $sum: '$totalAmount' },
            invoiceCount: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Invoice.aggregate([
        { $group: { _id: '$stayType', totalRevenue: { $sum: '$totalAmount' } } },
      ]),
      Booking.aggregate([
        {
          $match: {
            status: {
              $in: [
                BOOKING_STATUS.BOOKED,
                BOOKING_STATUS.CHECKED_IN,
                BOOKING_STATUS.CHECKED_OUT,
              ],
            },
          },
        },
        { $group: { _id: '$stayType', bookingCount: { $sum: 1 } } },
      ]),
    ]);

    const bookedRoomCount = new Set(bookedRoomIds.map(String)).size;
    const availableRooms = Math.max(
      totalActiveRooms - occupiedRooms - bookedRoomCount - maintenanceRooms,
      0,
    );
    const revenueByMonth = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(Date.UTC(
        currentDate.getUTCFullYear(),
        currentDate.getUTCMonth() - 5 + index,
        1,
      ));
      const key = date.toISOString().slice(0, 7);
      const row = revenueByMonthRows.find((item) => item._id === key);
      return {
        month: key,
        label: new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' }).format(date),
        totalRevenue: row?.totalRevenue || 0,
        invoiceCount: row?.invoiceCount || 0,
      };
    });
    const revenueByStayType = new Map(
      revenueByStayTypeRows.map((row) => [row._id, row.totalRevenue]),
    );
    const bookingsByStayType = new Map(
      bookingsByStayTypeRows.map((row) => [row._id, row.bookingCount]),
    );
    const stayTypeStats = STAY_TYPE_VALUES.map((stayType) => ({
      stayType,
      bookingCount: bookingsByStayType.get(stayType) || 0,
      totalRevenue: revenueByStayType.get(stayType) || 0,
    }));

    const result = {
      todaysArrivals,
      todaysDepartures,
      occupiedRooms,
      availableRooms,
      bookedRooms: bookedRoomCount,
      maintenanceRooms,
      totalActiveRooms,
      roomOccupancy: {
        occupied: occupiedRooms,
        booked: bookedRoomCount,
        available: availableRooms,
        maintenance: maintenanceRooms,
        total: totalActiveRooms,
      },
      occupancyRate: totalActiveRooms > maintenanceRooms
        ? Math.round((occupiedRooms / (totalActiveRooms - maintenanceRooms)) * 100)
        : 0,
      revenueByMonth,
      stayTypeStats,
      outstandingInvoices,
      recentBookings,
      bookingsByCamp: bookingsByCamp.map((row) => ({
        campName: row._id,
        count: row.count,
      })),
      pendingGuestRequests,
      camps: camps.map((c) => ({ id: c._id, name: c.name })),
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
