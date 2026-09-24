const { Booking, Room, Invoice, Camp, Mou, MouPayment } = require('../models');
const ApiError = require('../utils/ApiError');
const XLSX = require('xlsx');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const {
  REPORT_TYPES,
  REPORT_TYPE_VALUES,
  ACTIVE_BOOKING_STATUSES,
  INVOICE_PAYMENT_STATUS,
  BOOKING_STATUS,
  ROOM_STATUS,
} = require('../utils/constants');
const { startOfDay, endOfDay } = require('../utils/dates');
const { normalizeReportFormat } = require('../utils/reportExport');
const dashboardService = require('./dashboard.service');

const buildDateFilter = (query, field = 'arrivalDate') => {
  const filter = {};
  const year = /^\d{4}$/.test(String(query.year || '')) ? Number(query.year) : null;
  if (query.from || query.to || year) {
    filter[field] = {};
    if (query.from) filter[field].$gte = startOfDay(query.from);
    else if (year) filter[field].$gte = startOfDay(`${year}-01-01`);
    if (query.to) filter[field].$lte = endOfDay(query.to);
    else if (year) filter[field].$lte = endOfDay(`${year}-12-31`);
  }
  return filter;
};

const buildCommonFilters = (query) => {
  const filter = { ...buildDateFilter(query) };
  if (query.campId) filter.camp = query.campId;
  if (query.stayType) filter.stayType = query.stayType;
  if (query.bookingReference) filter.bookingReference = String(query.bookingReference).trim();
  return filter;
};

const reportBookingsByCamp = async (query) => {
  const match = buildCommonFilters(query);
  const rows = await Booking.aggregate([
    { $match: match },
    { $group: { _id: '$campName', count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  return {
    title: 'Bookings by Camp',
    rows: rows.map((r) => ({ camp: r._id, bookings: r.count })),
  };
};

const reportBookingsByDate = async (query) => {
  const match = buildCommonFilters(query);
  const rows = await Booking.aggregate([
    { $match: match },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$arrivalDate' } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  return {
    title: 'Bookings by Date',
    rows: rows.map((r) => ({ date: r._id, bookings: r.count })),
  };
};

const reportStayTypeBreakdown = async (query) => {
  const match = buildCommonFilters(query);
  const rows = await Booking.aggregate([
    { $match: match },
    { $group: { _id: '$stayType', count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  return {
    title: 'Short Stay vs Long Stay',
    rows: rows.map((r) => ({ stayType: r._id, bookings: r.count })),
  };
};

const reportRoomUtilization = async (query) => {
  const campFilter = query.campId ? { camp: query.campId, isActive: true } : { isActive: true };
  const rooms = await Room.find(campFilter)
    .select('blockName roomNumber camp')
    .lean();
  const camps = await Camp.find(query.campId ? { _id: query.campId } : { isActive: true }).select('_id name').lean();
  const campNames = new Map(camps.map((camp) => [String(camp._id), camp.name]));

  const bookingFilter = {
    status: { $in: ACTIVE_BOOKING_STATUSES },
    ...buildDateFilter(query),
  };
  if (query.campId) bookingFilter.camp = query.campId;

  const activeBookings = await Booking.find(bookingFilter).select('room').lean();

  const bookedRoomIds = new Set(activeBookings.map((b) => String(b.room)));

  const rows = rooms.map((room) => ({
    camp: campNames.get(String(room.camp)) || '',
    block: room.blockName,
    roomNumber: room.roomNumber,
    utilized: bookedRoomIds.has(String(room._id)),
  }));

  const utilized = rows.filter((r) => r.utilized).length;

  return {
    title: 'Room Utilization',
    summary: { totalRooms: rows.length, utilizedRooms: utilized },
    rows,
  };
};

const reportOccupancy = async (query) => {
  const date = query.date ? new Date(query.date) : new Date();
  const occupied = await dashboardService.getOccupiedRoomCount(date);

  const roomFilter = { isActive: true };
  if (query.campId) roomFilter.camp = query.campId;

  const totalRooms = await Room.countDocuments({
    ...roomFilter,
    status: { $nin: [ROOM_STATUS.MAINTENANCE, ROOM_STATUS.OCCUPIED] },
  });

  return {
    title: 'Occupancy',
    date: startOfDay(date).toISOString().split('T')[0],
    occupiedRooms: occupied,
    totalRooms,
    occupancyRate: totalRooms > 0 ? Math.round((occupied / totalRooms) * 10000) / 100 : 0,
  };
};

const reportRevenue = async (query) => {
  const filter = { ...buildDateFilter(query, 'generatedAt') };
  if (query.campId) {
    const camp = await Camp.findById(query.campId);
    if (camp) filter.campName = camp.name;
  }
  if (query.stayType) filter.stayType = query.stayType;

  const rows = await Invoice.aggregate([
    { $match: filter },
    {
      $group: {
        _id: '$campName',
        totalRevenue: { $sum: '$totalAmount' },
        invoiceCount: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const grandTotal = rows.reduce((sum, r) => sum + r.totalRevenue, 0);

  return {
    title: 'Revenue',
    grandTotal,
    rows: rows.map((r) => ({
      camp: r._id,
      totalRevenue: r.totalRevenue,
      invoiceCount: r.invoiceCount,
    })),
  };
};

const reportOutstandingInvoices = async (query) => {
  const filter = { paymentStatus: INVOICE_PAYMENT_STATUS.UNPAID };
  if (query.campId) {
    const camp = await Camp.findById(query.campId);
    if (camp) filter.campName = camp.name;
  }
  Object.assign(filter, buildDateFilter(query, 'generatedAt'));

  const invoices = await Invoice.find(filter)
    .sort({ generatedAt: -1 })
    .select('invoiceNumber bookingReference guest campName totalAmount generatedAt paymentStatus');

  return {
    title: 'Outstanding Invoices',
    count: invoices.length,
    rows: invoices,
  };
};

const reportArrivals = async (query) => {
  const filter = {
    status: { $in: [BOOKING_STATUS.BOOKED, BOOKING_STATUS.CHECKED_IN] },
    ...buildDateFilter(query, 'arrivalDate'),
  };
  if (query.campId) filter.camp = query.campId;
  if (query.stayType) filter.stayType = query.stayType;

  const bookings = await Booking.find(filter)
    .sort({ arrivalDate: 1 })
    .select(
      'bookingReference guest campName blockName roomNumber arrivalDate departureDate status stayType'
    );

  return {
    title: 'Booking Guest Log',
    count: bookings.length,
    rows: bookings.map((booking) => ({
      date: new Date(booking.arrivalDate).toLocaleDateString('en-GB'),
      guestName: `${booking.guest?.firstName || ''} ${booking.guest?.lastName || ''}`.trim(),
      checkIn: new Date(booking.arrivalDate).toLocaleDateString('en-GB'),
      checkOut: new Date(booking.departureDate).toLocaleDateString('en-GB'),
      contactNumber: booking.guest?.phone || '',
      room: `Block ${booking.blockName} Room ${booking.roomNumber}`,
      status: booking.status,
    })),
  };
};

const reportDepartures = async (query) => {
  const filter = {
    status: { $in: [BOOKING_STATUS.BOOKED, BOOKING_STATUS.CHECKED_IN] },
    ...buildDateFilter(query, 'departureDate'),
  };
  if (query.campId) filter.camp = query.campId;
  if (query.stayType) filter.stayType = query.stayType;

  const bookings = await Booking.find(filter)
    .sort({ departureDate: 1 })
    .select(
      'bookingReference guest campName blockName roomNumber arrivalDate departureDate status stayType'
    );

  return {
    title: 'Booking Guest Log',
    count: bookings.length,
    rows: bookings.map((booking) => ({
      date: new Date(booking.departureDate).toLocaleDateString('en-GB'),
      guestName: `${booking.guest?.firstName || ''} ${booking.guest?.lastName || ''}`.trim(),
      checkIn: new Date(booking.arrivalDate).toLocaleDateString('en-GB'),
      checkOut: new Date(booking.departureDate).toLocaleDateString('en-GB'),
      contactNumber: booking.guest?.phone || '',
      room: `Block ${booking.blockName} Room ${booking.roomNumber}`,
      status: booking.status,
    })),
  };
};

const reportReservationLog = async (query) => {
  const filter = {
    status: { $in: [BOOKING_STATUS.BOOKED, BOOKING_STATUS.CHECKED_IN] },
    ...buildDateFilter(query, 'arrivalDate'),
  };
  if (query.campId) filter.camp = query.campId;
  if (query.stayType) filter.stayType = query.stayType;
  if (query.bookingReference) filter.bookingReference = String(query.bookingReference).trim();
  if (query.counterpartyCategory) {
    const mous = await Mou.find({ counterpartyCategory: query.counterpartyCategory }).select('_id').lean();
    filter.mou = { $in: mous.map((mou) => mou._id) };
  }
  if (query.mouId) filter.mou = query.mouId;

  const bookings = await Booking.find(filter)
    .sort({ arrivalDate: 1, createdAt: 1 })
    .select('bookingReference guest campName blockName roomNumber arrivalDate departureDate status stayType durationNights appliedRate remarks reasonForVisit mou')
    .populate('mou', 'partyName counterpartyCategory')
    .lean();

  const rows = bookings.map((booking, index) => ({
      bookingReference: booking.bookingReference || '',
      roomType: `${booking.blockName || ''} / Room ${booking.roomNumber || ''}`.trim(),
      checkInDate: new Date(booking.arrivalDate).toLocaleDateString('en-GB'),
      departureDate: new Date(booking.departureDate).toLocaleDateString('en-GB'),
      unitPrice: `${booking.appliedRate?.currency || 'KES'} ${Number(booking.appliedRate?.amount || 0).toLocaleString('en-KE')} / ${booking.appliedRate?.ratePeriod === 'per_month' ? 'month' : booking.appliedRate?.ratePeriod === 'per_year' ? 'year' : 'night'}`,
      rooms: 1,
      numberOfDays: booking.durationNights || '',
      typeOfRoom: booking.stayType || '',
      remark: [
        `Booking: ${booking.bookingReference || ''}`,
        `${booking.guest?.firstName || ''} ${booking.guest?.lastName || ''}`.trim(),
        booking.guest?.organisation,
        booking.mou ? `MOU: ${booking.mou.partyName} (${booking.mou.counterpartyCategory})` : '',
        booking.remarks || booking.reasonForVisit,
      ].filter(Boolean).join(' | '),
    }));
  return {
    title: 'Reservation Log',
    count: bookings.length,
    summary: { totalRevenue: bookings.reduce((sum, booking) => sum + calculateBookingRevenue(booking), 0), totalBookings: bookings.length },
    rows,
  };
};

const mouStatusFilter = (query) => ({
  ...(query.status ? { status: query.status } : { status: { $in: ['active', 'expiring_soon', 'expired'] } }),
  ...(query.counterpartyCategory ? { counterpartyCategory: query.counterpartyCategory } : {}),
});

const reportMouMonthly = async (query) => {
  const mous = await Mou.find({ ...mouStatusFilter(query), mouType: 'individual', ...(query.mouId ? { _id: query.mouId } : {}) }).lean();
  const mouIds = mous.map((mou) => mou._id);
  const paymentFilter = { mou: { $in: mouIds } };
  if (query.period) paymentFilter.periodLabel = query.period;
  const payments = await MouPayment.find(paymentFilter).sort({ dueDate: 1 }).lean();
  const byId = new Map(mous.map((mou) => [String(mou._id), mou]));
  const rows = payments.map((payment) => {
    const mou = byId.get(String(payment.mou));
    const amountPaid = payment.amountPaid || 0;
    return {
      mouId: mou?._id,
      staffName: mou?.partyName || '',
      counterparty: mou?.counterpartyCategory || '',
      startDate: mou?.startDate,
      endDate: mou?.endDate,
      monthlyRateKes: mou?.rateAmount || 0,
      month: payment.periodLabel,
      amountDue: payment.amountDue,
      amountPaid,
      paymentStatus: payment.status,
      outstandingBalance: Math.max(payment.amountDue - amountPaid, 0),
    };
  });
  return {
    title: 'Monthly-paying MOUs',
    summary: { totalDue: rows.reduce((sum, row) => sum + row.amountDue, 0), totalCollected: rows.reduce((sum, row) => sum + row.amountPaid, 0) },
    rows,
  };
};

const reportMouAnnual = async (query) => {
  const mous = await Mou.find({ ...mouStatusFilter(query), mouType: 'partner', ...(query.mouId ? { _id: query.mouId } : {}) }).lean();
  const mouIds = mous.map((mou) => mou._id);
  const paymentFilter = { mou: { $in: mouIds } };
  if (query.year) paymentFilter.periodLabel = String(query.year);
  const payments = await MouPayment.find(paymentFilter).lean();
  const paymentByMou = new Map(payments.map((payment) => [String(payment.mou), payment]));
  const renewalCutoff = new Date();
  renewalCutoff.setDate(renewalCutoff.getDate() + 60);
  return {
    title: 'Annual-paying MOUs',
    rows: mous.map((mou) => {
      const payment = paymentByMou.get(String(mou._id));
      const amountPaid = payment?.amountPaid || 0;
      return {
        mouId: mou._id,
        partnerName: mou.partyName,
        startDate: mou.startDate,
        endDate: mou.endDate,
        annualRateKes: mou.rateAmount,
        paymentStatus: payment?.status || 'pending',
        amountPaid,
        outstandingBalance: Math.max((payment?.amountDue || mou.rateAmount) - amountPaid, 0),
        renewalDueDate: mou.endDate,
        renewalDueWithin60Days: new Date(mou.endDate) <= renewalCutoff,
      };
    }),
  };
};

const calculateBookingRevenue = (booking) => {
  if (/^(?:care\s*)?staff$/i.test(String(booking.guest?.contractType || '').trim())) return 0;
  const rate = Number(booking.appliedRate?.amount || 0);
  const nights = Number(booking.durationNights || 0);
  if (booking.appliedRate?.ratePeriod === 'per_month') {
    return rate * Number(booking.durationMonths || Math.ceil(nights / 30));
  }
  if (booking.appliedRate?.ratePeriod === 'per_year') {
    return rate * Math.ceil(nights / 365);
  }
  return rate * nights;
};

const reportMouRevenue = async (query) => {
  const filter = {
    mou: query.mouId || { $ne: null },
    stayType: 'Long Stay',
    status: { $in: [BOOKING_STATUS.BOOKED, BOOKING_STATUS.CHECKED_IN, BOOKING_STATUS.CHECKED_OUT] },
    ...buildDateFilter(query, 'arrivalDate'),
  };
  if (query.counterpartyCategory || query.revenueCategory) {
    const mous = await Mou.find({ counterpartyCategory: query.counterpartyCategory || query.revenueCategory }).select('_id').lean();
    filter.mou = { $in: mous.map((mou) => mou._id) };
    if (query.mouId) filter.mou = query.mouId;
  }
  if (query.bookingReference) filter.bookingReference = String(query.bookingReference).trim();
  if (query.guestCategory) filter['guest.contractType'] = String(query.guestCategory).trim();

  const bookings = await Booking.find(filter)
    .sort({ arrivalDate: 1, createdAt: 1 })
    .select('bookingReference guest campName blockName roomNumber arrivalDate departureDate durationNights durationMonths appliedRate mou createdBy status')
    .populate('mou', 'partyName counterpartyCategory')
    .populate('createdBy', 'firstName lastName email')
    .lean();

  const rows = bookings.map((booking) => {
    const revenue = calculateBookingRevenue(booking);
    const person = `${booking.guest?.firstName || ''} ${booking.guest?.lastName || ''}`.trim();
    return {
      bookingReference: booking.bookingReference,
      mouId: String(booking.mou?._id || booking.mou || ''),
      person,
      organisation: booking.guest?.organisation || '',
      mou: booking.mou?.partyName || '',
      mouCategory: booking.mou?.counterpartyCategory || '',
      room: `${booking.campName || ''} / ${booking.blockName || ''} / Room ${booking.roomNumber || ''}`,
      checkIn: new Date(booking.arrivalDate).toLocaleDateString('en-GB'),
      checkOut: new Date(booking.departureDate).toLocaleDateString('en-GB'),
      days: booking.durationNights || 0,
      rooms: 1,
      rate: `${booking.appliedRate?.currency || 'KES'} ${Number(booking.appliedRate?.amount || 0).toLocaleString('en-KE')} / ${booking.appliedRate?.ratePeriod || 'per_night'}`,
      amountAccumulated: revenue,
      bookedBy: `${booking.createdBy?.firstName || ''} ${booking.createdBy?.lastName || ''}`.trim() || booking.createdBy?.email || '',
      status: booking.status,
      typeOfRoom: `Long Stay - ${booking.mou?.counterpartyCategory || 'MOU'}`,
      remark: [
        `Booking: ${booking.bookingReference}`,
        `Guest: ${person}`,
        booking.guest?.organisation,
        `MOU: ${booking.mou?.partyName || ''}`,
        `Accumulated: ${revenue.toLocaleString('en-KE', { maximumFractionDigits: 2 })}`,
        `Booked by: ${`${booking.createdBy?.firstName || ''} ${booking.createdBy?.lastName || ''}`.trim() || booking.createdBy?.email || ''}`,
        `Status: ${booking.status}`,
      ].filter(Boolean).join(' | '),
      roomType: `${booking.campName || ''} / ${booking.blockName || ''} / Room ${booking.roomNumber || ''}`,
      checkInDate: new Date(booking.arrivalDate).toLocaleDateString('en-GB'),
      departureDate: new Date(booking.departureDate).toLocaleDateString('en-GB'),
      unitPrice: `${booking.appliedRate?.currency || 'KES'} ${Number(booking.appliedRate?.amount || 0).toLocaleString('en-KE')} / ${booking.appliedRate?.ratePeriod || 'per_night'}`,
      numberOfDays: booking.durationNights || 0,
    };
  });
  const personTotals = [...rows.reduce((totals, row) => {
    const current = totals.get(row.person) || { person: row.person, bookings: 0, amountAccumulated: 0 };
    current.bookings += 1;
    current.amountAccumulated += row.amountAccumulated;
    totals.set(row.person, current);
    return totals;
  }, new Map()).values()];
  const totalsByPerson = new Map(personTotals.map((total) => [total.person, total]));
  rows.forEach((row) => {
    row.personBookings = totalsByPerson.get(row.person)?.bookings || 0;
    row.personTotalRevenue = totalsByPerson.get(row.person)?.amountAccumulated || 0;
    row.remark += ` | Guest total: ${row.personTotalRevenue.toLocaleString('en-KE', { maximumFractionDigits: 2 })}`;
  });

  return {
    title: query.bookingReference ? `MOU Revenue - ${String(query.bookingReference).trim()}` : 'MOU Revenue by Occupant',
    summary: {
      totalRevenue: rows.reduce((sum, row) => sum + row.amountAccumulated, 0),
      totalBookings: rows.length,
      totalPeople: personTotals.length,
      period: query.year ? String(query.year) : query.from || query.to ? `${query.from || 'Beginning'} to ${query.to || 'Today'}` : 'All selected dates',
      personTotals,
    },
    rows,
  };
};

const reportShortStayRevenue = async (query) => {
  const filter = {
    mou: null,
    stayType: 'Short Stay',
    status: { $in: [BOOKING_STATUS.BOOKED, BOOKING_STATUS.CHECKED_IN, BOOKING_STATUS.CHECKED_OUT] },
    ...buildDateFilter(query, 'arrivalDate'),
  };
  if (query.campId) filter.camp = query.campId;
  if (query.bookingReference) filter.bookingReference = String(query.bookingReference).trim();
  const bookings = await Booking.find(filter)
    .sort({ arrivalDate: 1, createdAt: 1 })
    .select('bookingReference guest campName blockName roomNumber arrivalDate departureDate durationNights appliedRate createdBy status remarks reasonForVisit')
    .populate('createdBy', 'firstName lastName email')
    .lean();
  const rows = bookings.map((booking, index) => {
    const revenue = calculateBookingRevenue(booking);
    const person = `${booking.guest?.firstName || ''} ${booking.guest?.lastName || ''}`.trim();
    return {
      bookingReference: booking.bookingReference,
      mouId: 'short-stay',
      mou: 'Short Stay',
      person,
      room: `${booking.campName || ''} / ${booking.blockName || ''} / Room ${booking.roomNumber || ''}`,
      checkIn: new Date(booking.arrivalDate).toLocaleDateString('en-GB'),
      checkOut: new Date(booking.departureDate).toLocaleDateString('en-GB'),
      days: booking.durationNights || 0,
      rooms: 1,
      rate: `${booking.appliedRate?.currency || 'KES'} ${Number(booking.appliedRate?.amount || 0).toLocaleString('en-KE')} / night`,
      amountAccumulated: revenue,
      bookedBy: `${booking.createdBy?.firstName || ''} ${booking.createdBy?.lastName || ''}`.trim() || booking.createdBy?.email || '',
      status: booking.status,
      typeOfRoom: 'Short Stay',
      remark: `Booking: ${booking.bookingReference} | Guest: ${person} | Accumulated: ${revenue.toLocaleString('en-KE', { maximumFractionDigits: 2 })} | Booked by: ${`${booking.createdBy?.firstName || ''} ${booking.createdBy?.lastName || ''}`.trim() || booking.createdBy?.email || ''}`,
      roomType: `${booking.campName || ''} / ${booking.blockName || ''} / Room ${booking.roomNumber || ''}`,
      checkInDate: new Date(booking.arrivalDate).toLocaleDateString('en-GB'),
      departureDate: new Date(booking.departureDate).toLocaleDateString('en-GB'),
      unitPrice: `${booking.appliedRate?.currency || 'KES'} ${Number(booking.appliedRate?.amount || 0).toLocaleString('en-KE')} / night`,
      numberOfDays: booking.durationNights || 0,
      tableNo: index + 1,
    };
  });
  return {
    title: 'Short Stay Revenue',
    summary: {
      totalRevenue: rows.reduce((sum, row) => sum + row.amountAccumulated, 0),
      totalBookings: rows.length,
      totalPeople: new Set(rows.map((row) => row.person)).size,
      period: query.from || query.to ? `${query.from || 'Beginning'} to ${query.to || 'Today'}` : 'All selected dates',
    },
    rows,
  };
};

const generators = {
  [REPORT_TYPES.BOOKINGS_BY_CAMP]: reportBookingsByCamp,
  [REPORT_TYPES.BOOKINGS_BY_DATE]: reportBookingsByDate,
  [REPORT_TYPES.STAY_TYPE_BREAKDOWN]: reportStayTypeBreakdown,
  [REPORT_TYPES.ROOM_UTILIZATION]: reportRoomUtilization,
  [REPORT_TYPES.OCCUPANCY]: reportOccupancy,
  [REPORT_TYPES.REVENUE]: reportRevenue,
  [REPORT_TYPES.OUTSTANDING_INVOICES]: reportOutstandingInvoices,
  [REPORT_TYPES.ARRIVALS]: reportArrivals,
  [REPORT_TYPES.DEPARTURES]: reportDepartures,
  [REPORT_TYPES.RESERVATION_LOG]: reportReservationLog,
  [REPORT_TYPES.MOU_MONTHLY]: reportMouMonthly,
  [REPORT_TYPES.MOU_ANNUAL]: reportMouAnnual,
  [REPORT_TYPES.MOU_REVENUE]: reportMouRevenue,
  [REPORT_TYPES.SHORT_STAY_REVENUE]: reportShortStayRevenue,
};

const flattenRowsToCsv = (report) => {
  if (!report.rows || report.rows.length === 0) return 'No data\n';

  const firstRow = report.rows[0];
  if (typeof firstRow === 'object' && !Array.isArray(firstRow)) {
    const headers = Object.keys(
      typeof firstRow.toJSON === 'function' ? firstRow.toJSON() : firstRow
    );
    const lines = [headers.join(',')];
    report.rows.forEach((row) => {
      const data = typeof row.toJSON === 'function' ? row.toJSON() : row;
      lines.push(
        headers
          .map((h) => {
            let val = data[h];
            if (val && typeof val === 'object') val = JSON.stringify(val);
            val = val == null ? '' : String(val);
            return `"${val.replace(/"/g, '""')}"`;
          })
          .join(',')
      );
    });
    return lines.join('\n');
  }

  return JSON.stringify(report.rows, null, 2);
};

const normalizeReportRows = (report) => {
  if (!report.rows || report.rows.length === 0) return [];

  const firstRow = report.rows[0];
  if (typeof firstRow !== 'object' || Array.isArray(firstRow)) {
    return report.rows;
  }

  return report.rows.map((row) =>
    typeof row.toJSON === 'function' ? row.toJSON() : row
  );
};

const displayHeader = (header) =>
  String(header)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/^./, (character) => character.toUpperCase());

const displayValue = (value) => {
  if (value && typeof value === 'object') return JSON.stringify(value);
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  return value == null ? '' : String(value);
};

const reportSummaryText = (summary = {}) => Object.entries(summary)
  .filter(([key]) => !['personTotals'].includes(key))
  .map(([key, value]) => `${displayHeader(key)}: ${typeof value === 'number' ? value.toLocaleString('en-KE', { maximumFractionDigits: 2 }) : displayValue(value)}`)
  .join(' | ');

const isMouRevenueReport = (report) => report.title === 'MOU Revenue by Occupant'
  || String(report.title || '').startsWith('MOU Revenue -');

const isRevenueFormReport = (report) => isMouRevenueReport(report) || report.title === 'Short Stay Revenue';

const RESERVATION_COLUMNS = [
  { key: 'bookingReference', label: 'Booking Reference', width: 20 },
  { key: 'roomType', label: 'Room Type / Room', width: 22 },
  { key: 'checkInDate', label: 'Check-in Date', width: 15 },
  { key: 'departureDate', label: 'Departure Date', width: 15 },
  { key: 'unitPrice', label: 'Unit Price', width: 19 },
  { key: 'rooms', label: 'Rooms', width: 9 },
  { key: 'numberOfDays', label: 'No. of Days', width: 12 },
  { key: 'typeOfRoom', label: 'Stay Type', width: 15 },
  { key: 'remark', label: 'Remark / Occupant / MOU', width: 34 },
];

const toReservationFormRow = (row) => {
  const value = (...keys) => keys.map((key) => row[key]).find((item) => item !== undefined && item !== null && item !== '');
  const reservedKeys = new Set(['bookingReference', 'reference', 'room', 'roomType', 'roomNumber', 'camp', 'campName', 'checkIn', 'checkInDate', 'arrivalDate', 'checkOut', 'departureDate', 'departureDate', 'rate', 'unitPrice', 'amountAccumulated', 'totalRevenue', 'totalAmount', 'rooms', 'days', 'numberOfDays', 'stayType', 'typeOfRoom', 'remark']);
  const categories = Object.entries(row)
    .filter(([key, item]) => !reservedKeys.has(key) && item !== undefined && item !== null && item !== '')
    .map(([key, item]) => `${displayHeader(key)}: ${displayValue(item)}`);
  return {
    bookingReference: value('bookingReference', 'reference') || '',
    roomType: value('roomType', 'room', 'roomNumber', 'campName', 'camp') || '',
    checkInDate: value('checkInDate', 'checkIn', 'arrivalDate', 'date') || '',
    departureDate: value('departureDate', 'checkOut', 'departure') || '',
    unitPrice: value('unitPrice', 'rate') || '',
    rooms: value('rooms') || '',
    numberOfDays: value('numberOfDays', 'days', 'nights') || '',
    typeOfRoom: value('typeOfRoom', 'stayType', 'category') || '',
    remark: [value('remark'), ...categories].filter(Boolean).join(' | '),
  };
};

const flattenReservationLogToXlsxBuffer = async (rows, logoPath, report) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Reservation Log');

  worksheet.mergeCells('A1:I1');
  worksheet.getCell('A1').value = 'ROOM RESERVATION FORM 1';
  worksheet.getCell('A1').font = { bold: true, size: 20, color: { argb: 'FFFFFFFF' } };
  worksheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF173B63' } };
  worksheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(1).height = 34;
  worksheet.mergeCells('A2:I2');
  worksheet.getCell('A2').value = 'Room Reservation Form';
  worksheet.getCell('A2').font = { bold: true, size: 14, color: { argb: 'FF173B63' } };
  worksheet.getCell('A2').alignment = { horizontal: 'center' };
  worksheet.getCell('A3').value = 'Recipient';
  worksheet.getCell('B3').value = 'Dadaab Accommodation Team';
  worksheet.getCell('E3').value = 'Sender';
  worksheet.mergeCells('F3:I3');
  worksheet.getCell('F3').value = 'CARE International';
  worksheet.getCell('A4').value = 'Team number';
  worksheet.getCell('B4').value = 'Accommodation';
  worksheet.getCell('E4').value = 'Confirmation date';
  worksheet.mergeCells('F4:I4');
  worksheet.getCell('F4').value = new Date().toLocaleDateString('en-GB');
  worksheet.mergeCells('A5:I5');
  worksheet.getCell('A5').value = 'Payment method: MOU / invoice according to the selected booking agreement';
  worksheet.mergeCells('A6:I6');
  worksheet.getCell('A6').value = `Revenue Calculation: ${reportSummaryText(report.summary) || 'No revenue data'}`;
  ['A3', 'E3', 'A4', 'E4'].forEach((cell) => { worksheet.getCell(cell).font = { bold: true }; });

  if (fs.existsSync(logoPath)) {
    const imageId = workbook.addImage({ filename: logoPath, extension: 'png' });
    worksheet.addImage(imageId, { tl: { col: 6.25, row: 0.12 }, ext: { width: 80, height: 30 } });
  }

  const headerRow = worksheet.getRow(7);
  headerRow.values = RESERVATION_COLUMNS.map((column) => column.label);
  headerRow.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF173B63' } };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  headerRow.height = 30;

  const printableRows = [...rows];
  while (printableRows.length < 20) printableRows.push({});
  printableRows.forEach((row) => {
    const excelRow = worksheet.addRow(RESERVATION_COLUMNS.map((column) => displayValue(row[column.key])));
    excelRow.height = 22;
    excelRow.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    excelRow.eachCell((cell) => {
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    });
  });
  const footerRow = printableRows.length + 8;
  worksheet.mergeCells(`A${footerRow}:I${footerRow}`);
  worksheet.getCell(`A${footerRow}`).value = 'Remark:';
  worksheet.mergeCells(`A${footerRow + 1}:I${footerRow + 1}`);
  worksheet.getCell(`A${footerRow + 1}`).value = 'Hotel confirmation by: ____________________    Confirmation date: ____________________';
  RESERVATION_COLUMNS.forEach((column, index) => { worksheet.getColumn(index + 1).width = column.width; });
  return workbook.xlsx.writeBuffer();
};

const MOU_REVENUE_COLUMNS = [
  { key: 'bookingReference', label: 'Booking Reference', width: 20 },
  { key: 'roomType', label: 'Room Type / Room', width: 22 },
  { key: 'checkInDate', label: 'Check-in Date', width: 15 },
  { key: 'departureDate', label: 'Departure Date', width: 15 },
  { key: 'unitPrice', label: 'Unit Price', width: 19 },
  { key: 'amountAccumulated', label: 'Total Revenue', width: 17 },
  { key: 'rooms', label: 'Rooms', width: 9 },
  { key: 'numberOfDays', label: 'No. of Days', width: 12 },
  { key: 'typeOfRoom', label: 'Stay Type', width: 15 },
  { key: 'remark', label: 'Remark / Occupant / MOU', width: 34 },
];

const groupMouRevenueRows = (rows) => {
  const groups = new Map();
  rows.forEach((row) => {
    const key = row.mouId || row.mou || 'unassigned';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });
  return [...groups.entries()].map(([key, groupedRows]) => ({
    key,
    name: groupedRows[0]?.mou || 'Unassigned MOU',
    rows: groupedRows,
    total: groupedRows.reduce((sum, row) => sum + Number(row.amountAccumulated || 0), 0),
  }));
};

const flattenMouRevenueToXlsxBuffer = async (report, logoPath) => {
  const workbook = new ExcelJS.Workbook();
  const shortStay = report.title === 'Short Stay Revenue';
  const groups = groupMouRevenueRows(normalizeReportRows(report));
  const printableGroups = groups.length ? groups : [{ key: 'empty', name: 'No MOU selected', rows: [], total: 0 }];
  printableGroups.forEach((group, groupIndex) => {
    const baseName = String(group.name).replace(/[\\/*?:\[\]]/g, '').slice(0, 24) || 'MOU';
    const worksheet = workbook.addWorksheet(`${groupIndex + 1}-${baseName}`.slice(0, 31));
    const endColumn = String.fromCharCode(64 + MOU_REVENUE_COLUMNS.length);
    worksheet.mergeCells(`A1:${endColumn}1`);
    worksheet.getCell('A1').value = 'ROOM RESERVATION FORM 1';
    worksheet.getCell('A1').font = { bold: true, size: 18, color: { argb: 'FFFFFFFF' } };
    worksheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF173B63' } };
    worksheet.getCell('A1').alignment = { horizontal: 'center' };
    worksheet.getRow(1).height = 32;
    worksheet.mergeCells(`A2:${endColumn}2`);
    worksheet.getCell('A2').value = shortStay ? `Short Stay Revenue Report - ${group.name}` : `Room Reservation Form - ${group.name}`;
    worksheet.getCell('A2').font = { bold: true, size: 13, color: { argb: 'FF173B63' } };
    worksheet.getCell('A2').alignment = { horizontal: 'center' };
    worksheet.getCell('A3').value = 'Recipient';
    worksheet.getCell('B3').value = 'Dadaab Accommodation Team';
    worksheet.getCell('F3').value = 'Sender';
    worksheet.mergeCells(`G3:${endColumn}3`);
    worksheet.getCell('G3').value = 'CARE International';
    worksheet.getCell('A4').value = 'MOU';
    worksheet.getCell('B4').value = group.name;
    worksheet.getCell('F4').value = 'Total revenue';
    worksheet.mergeCells(`G4:${endColumn}4`);
    worksheet.getCell('G4').value = group.total;
    worksheet.mergeCells(`A5:${endColumn}5`);
    worksheet.getCell('A5').value = `${shortStay ? 'Payment method: nightly room rate' : 'Payment method: MOU agreement'} | Selected period: ${report.summary?.period || 'All selected dates'}`;
    worksheet.mergeCells(`A6:${endColumn}6`);
    worksheet.getCell('A6').value = `Revenue Calculation: Guests ${new Set(group.rows.map((row) => row.person)).size} | Occupied rooms ${group.rows.length} | ${shortStay ? 'Short stay subtotal' : 'MOU subtotal'} ${group.total.toLocaleString('en-KE', { maximumFractionDigits: 2 })}`;
    ['A3', 'F3', 'A4', 'F4'].forEach((cell) => { worksheet.getCell(cell).font = { bold: true }; });
    const headerRow = worksheet.getRow(7);
    headerRow.values = MOU_REVENUE_COLUMNS.map((column) => column.label);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF173B63' } };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    group.rows.forEach((row, index) => {
      const excelRow = worksheet.addRow(MOU_REVENUE_COLUMNS.map((column) => displayValue(row[column.key])));
      excelRow.alignment = { vertical: 'middle', wrapText: true };
      excelRow.eachCell((cell) => { cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }; });
    });
    const footerRow = 8 + group.rows.length;
    worksheet.mergeCells(`A${footerRow}:${endColumn}${footerRow}`);
    worksheet.getCell(`A${footerRow}`).value = 'Remark:';
    worksheet.mergeCells(`A${footerRow + 1}:${endColumn}${footerRow + 1}`);
    worksheet.getCell(`A${footerRow + 1}`).value = 'Hotel confirmation by: ____________________    Confirmation date: ____________________';
    MOU_REVENUE_COLUMNS.forEach((column, index) => { worksheet.getColumn(index + 1).width = column.width; });
    worksheet.pageSetup = { paperSize: worksheet.PAPERSIZE_A4, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1 };
    worksheet.printArea = `A1:${endColumn}${footerRow + 1}`;
    if (fs.existsSync(logoPath)) {
      const imageId = workbook.addImage({ filename: logoPath, extension: 'png' });
      worksheet.addImage(imageId, { tl: { col: endColumn.charCodeAt(0) - 65, row: 0.1 }, ext: { width: 72, height: 30 } });
    }
  });
  return workbook.xlsx.writeBuffer();
};

const flattenRowsToXlsxBuffer = async (report) => {
  const rows = normalizeReportRows(report);
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Report');
  const logoPath = path.resolve(__dirname, '../../assets/care-logo.png');

  if (isRevenueFormReport(report)) {
    return flattenMouRevenueToXlsxBuffer(report, logoPath);
  }

  if (report.title === 'Reservation Log') {
    return flattenReservationLogToXlsxBuffer(rows, logoPath, report);
  }

  const formRows = rows.map(toReservationFormRow);
  const reportEndColumn = String.fromCharCode(64 + RESERVATION_COLUMNS.length);
  worksheet.mergeCells(`A1:${reportEndColumn}1`);
  worksheet.getCell('A1').value = 'ROOM RESERVATION FORM 1';
  worksheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
  worksheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF173B63' } };
  worksheet.getCell('A1').alignment = { vertical: 'middle' };
  worksheet.getRow(1).height = 28;

  worksheet.mergeCells(`A2:${reportEndColumn}2`);
  worksheet.getCell('A2').value = report.title || 'Room Reservation Form';
  worksheet.getCell('A2').font = { bold: true, size: 13, color: { argb: 'FF173B63' } };
  worksheet.getCell('A2').alignment = { horizontal: 'center' };
  worksheet.getCell('A3').value = 'Recipient';
  worksheet.getCell('B3').value = 'Dadaab Accommodation Team';
  worksheet.getCell('D3').value = 'Sender';
  worksheet.mergeCells(`E3:${reportEndColumn}3`);
  worksheet.getCell('E3').value = 'CARE International';
  worksheet.getCell('A4').value = 'Team number';
  worksheet.getCell('B4').value = 'Accommodation';
  worksheet.getCell('D4').value = 'Confirmation date';
  worksheet.mergeCells(`E4:${reportEndColumn}4`);
  worksheet.getCell('E4').value = new Date().toLocaleDateString('en-GB');
  worksheet.mergeCells(`A5:${reportEndColumn}5`);
  worksheet.getCell('A5').value = 'Payment method: MOU / invoice according to the selected booking agreement';
  worksheet.mergeCells(`A6:${reportEndColumn}6`);
  worksheet.getCell('A6').value = `Revenue Calculation: ${reportSummaryText(report.summary) || 'No revenue data'}`;
  worksheet.getCell('A6').font = { italic: true, color: { argb: 'FF374151' } };
  ['A3', 'D3', 'A4', 'D4'].forEach((cell) => { worksheet.getCell(cell).font = { bold: true }; });

  if (fs.existsSync(logoPath)) {
    const imageId = workbook.addImage({ filename: logoPath, extension: 'png' });
    worksheet.addImage(imageId, { tl: { col: 6.4, row: 0.2 }, ext: { width: 110, height: 42 } });
  }

  const printableRows = [...formRows];
  while (printableRows.length < 20) printableRows.push({});
  {
    const headers = RESERVATION_COLUMNS.map((column) => column.key);
    worksheet.getRow(7).values = RESERVATION_COLUMNS.map((column) => column.label);
    worksheet.getRow(7).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF173B63' } };
    worksheet.getRow(7).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    worksheet.getRow(7).height = 28;
    worksheet.getRow(7).eachCell((cell) => {
      cell.border = { top: { style: 'thin', color: { argb: 'FF7F1D1D' } }, bottom: { style: 'thin', color: { argb: 'FF7F1D1D' } }, left: { style: 'thin', color: { argb: 'FFD1D5DB' } }, right: { style: 'thin', color: { argb: 'FFD1D5DB' } } };
    });
    printableRows.forEach((row) => {
      worksheet.addRow(headers.map((header) => {
        return displayValue(row[header]);
      }));
    });
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber < 8) return;
      row.alignment = { vertical: 'middle', wrapText: true };
      row.eachCell((cell) => {
        cell.border = { top: { style: 'thin', color: { argb: 'FFD1D5DB' } }, bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } }, left: { style: 'thin', color: { argb: 'FFD1D5DB' } }, right: { style: 'thin', color: { argb: 'FFD1D5DB' } } };
      });
    });
    worksheet.columns.forEach((column) => {
      let width = 12;
      column.eachCell({ includeEmpty: true }, (cell) => {
        width = Math.min(Math.max(width, String(cell.value ?? '').length + 2), 36);
      });
      column.width = width;
    });
    worksheet.autoFilter = { from: 'A7', to: `${reportEndColumn}${printableRows.length + 7}` };
  }

  const footerRow = Math.max(printableRows.length, 20) + 8;
  worksheet.mergeCells(`A${footerRow}:${reportEndColumn}${footerRow}`);
  worksheet.getCell(`A${footerRow}`).value = 'Remark:';
  worksheet.mergeCells(`A${footerRow + 1}:${reportEndColumn}${footerRow + 1}`);
  worksheet.getCell(`A${footerRow + 1}`).value = 'Hotel confirmation by: ____________________    Confirmation date: ____________________';

  return workbook.xlsx.writeBuffer();
};

const flattenRowsToPdfBuffer = (report) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'portrait' });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const logoPath = path.resolve(__dirname, '../../assets/care-logo.png');
    const rows = normalizeReportRows(report);

    if (isRevenueFormReport(report)) {
      const groups = groupMouRevenueRows(rows);
      const printableGroups = groups.length ? groups : [{ name: 'No MOU selected', rows: [], total: 0 }];
      const columnWidths = [32, 64, 54, 54, 54, 48, 36, 44, 54, 75];
      const labels = MOU_REVENUE_COLUMNS.map((column) => column.label);
      const shortStay = report.title === 'Short Stay Revenue';
      const tableLeft = 40;
      const tableWidth = columnWidths.reduce((sum, width) => sum + width, 0);
      const drawCell = (x, y, width, height, fill, text, color = '#111827', bold = false) => {
        doc.rect(x, y, width, height).fillAndStroke(fill, '#111827');
        doc.fillColor(color).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(6).text(displayValue(text), x + 2, y + 6, { width: width - 4, height: height - 7, align: 'center', ellipsis: true });
      };
      const drawHeader = (group) => {
        doc.rect(tableLeft, 30, tableWidth, 42).fill('#173B63');
        doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(16).text('ROOM RESERVATION FORM 1', tableLeft, 43, { width: tableWidth, align: 'center' });
        doc.fillColor('#173B63').font('Helvetica-Bold').fontSize(11).text(shortStay ? `Short Stay Revenue Report - ${group.name}` : `Room Reservation Form - ${group.name}`, tableLeft, 78, { width: tableWidth, align: 'center' });
        doc.fillColor('#111827').font('Helvetica').fontSize(7).text('Recipient: Dadaab Accommodation Team', tableLeft, 93);
        doc.text('Sender: CARE International', tableLeft + 290, 93);
        doc.text(`Revenue Calculation: ${shortStay ? 'Short stay subtotal' : 'MOU total'} ${Number(group.total || 0).toLocaleString('en-KE', { maximumFractionDigits: 2 })}`, tableLeft, 104);
        doc.text(`Selected period: ${report.summary?.period || 'All selected dates'}`, tableLeft + 290, 104);
        doc.text(shortStay ? 'Payment method: nightly room rate' : 'Payment method: MOU agreement', tableLeft, 115);
      };

      printableGroups.forEach((group, groupIndex) => {
        if (groupIndex) doc.addPage();
        drawHeader(group);
        const headerTop = 130;
        const headerHeight = 28;
        labels.forEach((label, index) => {
          const x = tableLeft + columnWidths.slice(0, index).reduce((sum, width) => sum + width, 0);
          drawCell(x, headerTop, columnWidths[index], headerHeight, '#173B63', label, '#FFFFFF', true);
        });
        let currentY = headerTop + headerHeight;
        group.rows.forEach((row, rowIndex) => {
          if (currentY + 24 > doc.page.height - 90) {
            doc.addPage();
            drawHeader(group);
            currentY = headerTop + headerHeight;
            labels.forEach((label, index) => {
              const x = tableLeft + columnWidths.slice(0, index).reduce((sum, width) => sum + width, 0);
              drawCell(x, headerTop, columnWidths[index], headerHeight, '#173B63', label, '#FFFFFF', true);
            });
          }
          MOU_REVENUE_COLUMNS.forEach((column, columnIndex) => {
            const x = tableLeft + columnWidths.slice(0, columnIndex).reduce((sum, width) => sum + width, 0);
            drawCell(x, currentY, columnWidths[columnIndex], 24, rowIndex % 2 ? '#F4F7FA' : '#FFFFFF', row[column.key]);
          });
          currentY += 24;
        });
        doc.fillColor('#111827').font('Helvetica-Bold').fontSize(8).text(`MOU subtotal: ${Number(group.total || 0).toLocaleString('en-KE', { maximumFractionDigits: 2 })}`, tableLeft, currentY + 10);
        doc.font('Helvetica').fontSize(8).text('Remark:', tableLeft, currentY + 28);
        doc.text('Hotel confirmation by: ____________________    Confirmation date: ____________________', tableLeft, currentY + 55);
      });
      doc.end();
      return;
    }

    if (report.title === 'Reservation Log') {
      const tableLeft = 40;
      const tableTop = 150;
      const columnWidths = [34, 74, 62, 62, 62, 40, 48, 60, 73];
      const headerHeight = 30;
      const rowHeight = 22;
      const labels = RESERVATION_COLUMNS.map((column) => column.label);
      const drawCell = (x, y, width, height, fill, text, color = '#111827', bold = false) => {
        doc.rect(x, y, width, height).fillAndStroke(fill, '#111827');
        doc.fillColor(color).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7).text(text, x + 3, y + 7, { width: width - 6, height: height - 8, align: 'center', ellipsis: true });
      };

      doc.rect(tableLeft, 32, 515, 48).fill('#173B63');
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(20).text('ROOM RESERVATION FORM 1', tableLeft, 45, { width: 515, align: 'center' });
      doc.fillColor('#173B63').font('Helvetica-Bold').fontSize(13).text('Room Reservation Form', tableLeft, 86, { width: 515, align: 'center' });
      doc.fillColor('#111827').font('Helvetica').fontSize(8).text('Recipient: Dadaab Accommodation Team', tableLeft, 101);
      doc.text('Sender: CARE International', 320, 101);
      doc.text('Team number: Accommodation', tableLeft, 112);
      doc.text(`Confirmation date: ${new Date().toLocaleDateString('en-GB')}`, 320, 112);
      if (fs.existsSync(logoPath)) doc.image(logoPath, 462, 38, { width: 72, height: 34 });

      labels.forEach((label, index) => {
        const x = tableLeft + columnWidths.slice(0, index).reduce((sum, width) => sum + width, 0);
        drawCell(x, tableTop, columnWidths[index], headerHeight, '#173B63', label, '#FFFFFF', true);
      });

      const printableRows = [...rows];
      while (printableRows.length < 20) printableRows.push({});
      printableRows.forEach((row, rowIndex) => {
        const y = tableTop + headerHeight + rowIndex * rowHeight;
        RESERVATION_COLUMNS.forEach((column, columnIndex) => {
          const x = tableLeft + columnWidths.slice(0, columnIndex).reduce((sum, width) => sum + width, 0);
          drawCell(x, y, columnWidths[columnIndex], rowHeight, '#FFFFFF', displayValue(row[column.key]));
        });
      });
      doc.fillColor('#111827').font('Helvetica').fontSize(8).text(`Revenue Calculation: ${reportSummaryText(report.summary) || 'No revenue data'}`, tableLeft, 123);
      doc.font('Helvetica').fontSize(8).text('Payment method: MOU / invoice according to the selected booking agreement', tableLeft, 134);
      doc.font('Helvetica-Bold').fontSize(10).text('Remark:', tableLeft, 642);
      doc.font('Helvetica').fontSize(8).text('Hotel confirmation by: ____________________    Confirmation date: ____________________', tableLeft, 680);
      doc.end();
      return;
    }

    doc.rect(40, 32, 515, 48).fill('#173B63');
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(18).text('ROOM RESERVATION FORM 1', 40, 45, { width: 515, align: 'center' });
    doc.fillColor('#173B63').font('Helvetica-Bold').fontSize(13).text(report.title || 'Room Reservation Form', 40, 86, { width: 515, align: 'center' });
    doc.fillColor('#111827').font('Helvetica').fontSize(8).text('Recipient: Dadaab Accommodation Team', 40, 101);
    doc.text('Sender: CARE International', 320, 101);
    doc.text('Team number: Accommodation', 40, 112);
    doc.text(`Confirmation date: ${new Date().toLocaleDateString('en-GB')}`, 320, 112);
    doc.text('Payment method: MOU / invoice according to the selected booking agreement', 40, 123);
    doc.fillColor('#374151').font('Helvetica-Oblique').fontSize(8).text(`Revenue Calculation: ${reportSummaryText(report.summary) || 'No revenue data'}`, 40, 134, { width: 515 });

    const formRows = rows.map(toReservationFormRow);
    const headers = RESERVATION_COLUMNS.map((column) => column.key);
    const tableTop = 152;
    const tableLeft = 40;
    const tableWidth = 515;
    const columnWidth = tableWidth / RESERVATION_COLUMNS.length;
    const headerHeight = 28;
    const rowHeight = 28;

    const drawCell = (x, y, width, height, fill, text, color = '#1f2933', bold = false) => {
      doc.rect(x, y, width, height).fillAndStroke(fill, '#d1d5db');
      doc.fillColor(color).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7).text(text, x + 4, y + 7, {
        width: width - 8,
        height: height - 8,
        align: 'center',
        ellipsis: true,
      });
    };

    RESERVATION_COLUMNS.forEach((column, index) => {
      drawCell(tableLeft + index * columnWidth, tableTop, columnWidth, headerHeight, '#173B63', column.label, '#ffffff', true);
    });

    let currentY = tableTop + headerHeight;
    const printableRows = [...formRows];
    while (printableRows.length < 20) printableRows.push({});
    printableRows.forEach((row, rowIndex) => {
      if (currentY + rowHeight > doc.page.height - 45) {
        doc.addPage();
        doc.fillColor('#173B63').fontSize(14).font('Helvetica-Bold').text(`${report.title || 'Report'} (continued)`, 40, 40);
        RESERVATION_COLUMNS.forEach((column, index) => {
          drawCell(tableLeft + index * columnWidth, 75, columnWidth, headerHeight, '#173B63', column.label, '#ffffff', true);
        });
        currentY = 75 + headerHeight;
      }
      headers.forEach((header, index) => {
        drawCell(tableLeft + index * columnWidth, currentY, columnWidth, rowHeight, rowIndex % 2 ? '#F4F7FA' : '#ffffff', displayValue(row[header]));
      });
      currentY += rowHeight;
    });

    if (currentY + 100 > doc.page.height - 45) {
      doc.addPage();
      currentY = 60;
    }
    doc.fillColor('#111827').font('Helvetica').fontSize(8).text('Payment method: MOU / invoice according to the selected booking agreement', tableLeft, currentY + 10);
    doc.font('Helvetica-Bold').fontSize(10).text('Remark:', tableLeft, currentY + 28);
    doc.font('Helvetica').fontSize(8).text('Hotel confirmation by: ____________________    Confirmation date: ____________________', tableLeft, currentY + 70);

    doc.fillColor('#1f2933');

    doc.end();
  });

const generateReport = async (type, query = {}) => {
  if (!REPORT_TYPE_VALUES.includes(type)) {
    throw ApiError.badRequest(`Unknown report type. Valid types: ${REPORT_TYPE_VALUES.join(', ')}`);
  }

  const report = await generators[type](query);
  const format = normalizeReportFormat(query.format);

  if (format === 'csv') {
    return { format: 'csv', contentType: 'text/csv', filename: `${type}.csv`, data: flattenRowsToCsv(report) };
  }

  if (format === 'xlsx' || format === 'excel') {
    return {
      format: 'xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: `${type}.xlsx`,
      data: await flattenRowsToXlsxBuffer(report),
    };
  }

  if (format === 'pdf') {
    return {
      format: 'pdf',
      contentType: 'application/pdf',
      filename: `${type}.pdf`,
      data: await flattenRowsToPdfBuffer(report),
    };
  }

  return { format: 'json', contentType: 'application/json', data: report };
};

module.exports = {
  generateReport,
  calculateBookingRevenue,
  REPORT_TYPE_VALUES,
};
