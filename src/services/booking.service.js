const { Booking, Invoice } = require('../models');
const ApiError = require('../utils/ApiError');
const referenceService = require('./reference.service');
const roomService = require('./room.service');
const campService = require('./camp.service');
const blockService = require('./block.service');
const rateService = require('./rate.service');
const invoiceService = require('./invoice.service');
const emailService = require('./email.service');
const settingsService = require('./settings.service');
const auditService = require('./audit.service');
const logger = require('../utils/logger');
const {
  BOOKING_STATUS,
  ACTOR_TYPE,
  AUDIT_ACTIONS,
} = require('../utils/constants');

const recordEmailSent = (booking, emailType) =>
  auditService.record({
    action: AUDIT_ACTIONS.EMAIL_SENT,
    booking,
    actorType: ACTOR_TYPE.SYSTEM,
    metadata: { emailType, to: booking.guest.email },
    message: `${emailType} email dispatched to ${booking.guest.email}.`,
  });

const buildGuestPayload = (payload) => ({
  firstName: payload.firstName,
  lastName: payload.lastName,
  email: payload.email,
  phone: payload.phone,
  organisation: payload.organisation,
  gender: payload.gender,
  contractType: payload.contractType,
  kenyaOffice: payload.kenyaOffice,
  internationalCountry: payload.internationalCountry,
  departureCountry: payload.departureCountry,
});

const resolveLocation = async ({ campId, blockId, roomId }) => {
  const camp = await campService.getCampById(campId);
  if (!camp.isActive) throw ApiError.conflict('The selected camp is not active.');

  const block = await blockService.getBlockById(blockId);
  if (String(block.camp._id || block.camp) !== String(camp._id)) {
    throw ApiError.badRequest('Block does not belong to the selected camp.');
  }
  if (!block.isActive) throw ApiError.conflict('The selected block is not active.');

  const room = await roomService.assertRoomAssignable({
    roomId,
    campId: camp._id,
    blockId: block._id,
  });

  return { camp, block, room };
};

const snapshotRate = async (campId, stayType) => {
  const rate = await rateService.getCurrentRate(campId, stayType);
  return {
    rateId: rate._id,
    amount: rate.amount,
    currency: rate.currency,
    stayType: rate.stayType,
  };
};

const createBooking = async (payload, actor) => {
  const { camp, block, room } = await resolveLocation({
    campId: payload.campId,
    blockId: payload.blockId,
    roomId: payload.roomId,
  });

  await roomService.assertRoomAssignable({
    roomId: room._id,
    campId: camp._id,
    blockId: block._id,
    arrivalDate: payload.arrivalDate,
    departureDate: payload.departureDate,
  });

  const appliedRate = await snapshotRate(camp._id, payload.stayType);
  const bookingReference = await referenceService.generateBookingReference();

  const booking = await Booking.create({
    bookingReference,
    guest: buildGuestPayload(payload),
    reasonForVisit: payload.reasonForVisit,
    remarks: payload.remarks,
    driverPickup: payload.driverPickup || false,
    arrivalDate: payload.arrivalDate,
    departureDate: payload.departureDate,
    status: BOOKING_STATUS.BOOKED,
    camp: camp._id,
    campName: camp.name,
    block: block._id,
    blockName: block.name,
    room: room._id,
    roomNumber: room.roomNumber,
    stayType: payload.stayType,
    appliedRate,
    createdBy: actor._id,
  });

  await auditService.record({
    action: AUDIT_ACTIONS.BOOKING_CREATED,
    booking,
    actorType: ACTOR_TYPE.USER,
    actor,
    actorLabel: actor.email,
    message: `Booking ${booking.bookingReference} created.`,
  });

  await roomService.syncRoomStatus(room._id);

  const settings = await settingsService.getSettings();
  if (settings.notifications?.sendBookingConfirmation !== false) {
    const recipients = [...new Set([booking.guest.email, actor.email].filter(Boolean))];
    emailService.sendBookingCreated(booking, recipients)
      .then(() => recordEmailSent(booking, 'Booking Created'))
      .catch((error) => {
        logger.warn(`Booking confirmation email failed: ${error.message}`);
      });
  }

  let invoice = null;
  try {
    invoice = await invoiceService.generateInvoiceForBooking(booking, { mode: 'createIfMissing' });
  } catch (invErr) {
    auditService.record({
      action: AUDIT_ACTIONS.EMAIL_SENT,
      booking,
      actorType: ACTOR_TYPE.SYSTEM,
      metadata: { error: invErr.message },
      message: `Invoice autogeneration skipped for ${booking.bookingReference}: ${invErr.message}.`,
    }).catch(() => {});
  }

  return { booking, invoice };
};

const resendBookingEmails = async (bookingId, actor) => {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw ApiError.notFound('Booking not found.');

  const invoice = await invoiceService.generateInvoiceForBooking(booking, {
    mode: 'createIfMissing',
    notify: false,
  });
  const recipients = [...new Set([booking.guest.email, actor.email].filter(Boolean))];
  const [bookingEmailSent, invoiceEmailSent] = await Promise.all([
    emailService.sendBookingCreated(booking, recipients),
    invoiceService.resendInvoiceEmail(booking, invoice),
  ]);

  await auditService.record({
    action: AUDIT_ACTIONS.EMAIL_SENT,
    booking,
    actorType: ACTOR_TYPE.USER,
    actor,
    actorLabel: actor.email,
    metadata: {
      emailType: 'Booking and Invoice Resent',
      bookingEmailSent,
      invoiceEmailSent,
      to: recipients,
    },
    message: `Booking and invoice emails resent for ${booking.bookingReference}.`,
  });

  return {
    bookingReference: booking.bookingReference,
    invoiceNumber: invoice.invoiceNumber,
    bookingEmailSent,
    invoiceEmailSent,
  };
};

const listBookings = async (query = {}) => {
  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.campId) filter.camp = query.campId;
  if (query.stayType) filter.stayType = query.stayType;

  if (query.from || query.to) {
    filter.arrivalDate = {};
    if (query.from) filter.arrivalDate.$gte = new Date(query.from);
    if (query.to) filter.arrivalDate.$lte = new Date(query.to);
  }

  if (query.search) {
    const term = query.search.trim();
    const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [
      { bookingReference: regex },
      { 'guest.email': regex },
      { 'guest.firstName': regex },
      { 'guest.lastName': regex },
    ];
  }

  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  const skip = (page - 1) * limit;

  const sortableFields = ['createdAt', 'arrivalDate', 'departureDate', 'status'];
  const sortBy = sortableFields.includes(query.sortBy) ? query.sortBy : 'createdAt';
  const sortOrder = query.sortOrder === 'asc' ? 1 : -1;

  const [items, total] = await Promise.all([
    Booking.find(filter)
      .populate('room', 'blockName roomNumber status capacity')
      .populate('camp', 'name')
      .populate('createdBy', 'firstName lastName email')
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limit),
    Booking.countDocuments(filter),
  ]);

  return {
    items,
    bookings: items,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 1,
  };
};

const getBookingById = async (id) => {
  const booking = await Booking.findById(id)
    .populate('room', 'blockName roomNumber status capacity')
    .populate('camp', 'name')
    .populate('block', 'name')
    .populate('createdBy', 'firstName lastName email')
    .populate('cancelledBy', 'firstName lastName email');

  if (!booking) throw ApiError.notFound('Booking not found.');

  const timeline = await auditService.getBookingTimeline(booking._id);

  let invoice = await Invoice.findOne({ booking: booking._id })
    .select('_id invoiceNumber paymentStatus totalAmount')
    .lean();

  return { booking, timeline, invoice };
};

const updateBooking = async (bookingId, payload, actor) => {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw ApiError.notFound('Booking not found.');

  if (booking.status === BOOKING_STATUS.CHECKED_OUT) {
    throw ApiError.badRequest('Checked out bookings cannot be edited.');
  }
  if (booking.status === BOOKING_STATUS.CANCELLED) {
    throw ApiError.badRequest('Cancelled bookings cannot be edited.');
  }

  const isCheckedIn = booking.status === BOOKING_STATUS.CHECKED_IN;
  const previousRoomId = booking.room;

  if (isCheckedIn) {
    const guestFields = [
      'firstName',
      'lastName',
      'email',
      'phone',
      'organisation',
      'gender',
      'contractType',
      'departureCountry',
      'kenyaOffice',
      'internationalCountry',
    ];
    guestFields.forEach((field) => {
      if (payload[field] !== undefined) booking.guest[field] = payload[field];
    });
    if (payload.reasonForVisit !== undefined) booking.reasonForVisit = payload.reasonForVisit;
    if (payload.remarks !== undefined) booking.remarks = payload.remarks;
    if (payload.driverPickup !== undefined) booking.driverPickup = payload.driverPickup;
  } else if (booking.status === BOOKING_STATUS.BOOKED) {
    const guestFields = [
      'firstName',
      'lastName',
      'email',
      'phone',
      'organisation',
      'gender',
      'contractType',
      'departureCountry',
      'kenyaOffice',
      'internationalCountry',
    ];
    guestFields.forEach((field) => {
      if (payload[field] !== undefined) booking.guest[field] = payload[field];
    });

    ['reasonForVisit', 'remarks', 'driverPickup'].forEach((field) => {
      if (payload[field] !== undefined) booking[field] = payload[field];
    });

    const datesChanging =
      payload.arrivalDate !== undefined || payload.departureDate !== undefined;
    const locationChanging =
      payload.campId !== undefined ||
      payload.blockId !== undefined ||
      payload.roomId !== undefined;
    const stayTypeChanging = payload.stayType !== undefined;

    const arrivalDate = payload.arrivalDate || booking.arrivalDate;
    const departureDate = payload.departureDate || booking.departureDate;

    if (locationChanging || datesChanging || stayTypeChanging) {
      const campId = payload.campId || booking.camp;
      const blockId = payload.blockId || booking.block;
      const roomId = payload.roomId || booking.room;
      const stayType = payload.stayType || booking.stayType;

      const { camp, block, room } = await resolveLocation({ campId, blockId, roomId });

      await roomService.assertRoomAssignable({
        roomId: room._id,
        campId: camp._id,
        blockId: block._id,
        arrivalDate,
        departureDate,
        excludeBookingId: booking._id,
      });

      booking.camp = camp._id;
      booking.campName = camp.name;
      booking.block = block._id;
      booking.blockName = block.name;
      booking.room = room._id;
      booking.roomNumber = room.roomNumber;
      booking.stayType = stayType;
      booking.appliedRate = await snapshotRate(camp._id, stayType);
    }

    if (payload.arrivalDate !== undefined) booking.arrivalDate = payload.arrivalDate;
    if (payload.departureDate !== undefined) booking.departureDate = payload.departureDate;
  } else {
    throw ApiError.badRequest(`Bookings in "${booking.status}" cannot be edited.`);
  }

  await booking.save();
  if (String(previousRoomId) !== String(booking.room)) {
    await roomService.syncRoomStatus(previousRoomId);
  }
  await roomService.syncRoomStatus(booking.room);

  await auditService.record({
    action: AUDIT_ACTIONS.BOOKING_UPDATED,
    booking,
    actorType: ACTOR_TYPE.USER,
    actor,
    actorLabel: actor.email,
    message: `Booking ${booking.bookingReference} updated.`,
  });

  await emailService.sendBookingUpdated(booking);
  await recordEmailSent(booking, 'Booking Updated');

  try {
    await invoiceService.generateInvoiceForBooking(booking, { mode: 'upsert' });
  } catch (_) {}

  return booking;
};

const cancelBooking = async (bookingId, { reason }, actor) => {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw ApiError.notFound('Booking not found.');

  const cancellable = [BOOKING_STATUS.BOOKED, BOOKING_STATUS.CHECKED_IN];
  if (!cancellable.includes(booking.status)) {
    throw ApiError.badRequest(
      `Only "Booked" or "Checked In" bookings can be cancelled (current: "${booking.status}").`
    );
  }

  if (!reason || !reason.trim()) {
    throw ApiError.badRequest('Cancellation reason is required.');
  }

  booking.status = BOOKING_STATUS.CANCELLED;
  booking.cancellationReason = reason.trim();
  booking.cancelledBy = actor._id;
  booking.cancelledAt = new Date();
  await booking.save();
  await roomService.syncRoomStatus(booking.room);

  await auditService.record({
    action: AUDIT_ACTIONS.BOOKING_CANCELLED,
    booking,
    actorType: ACTOR_TYPE.USER,
    actor,
    actorLabel: actor.email,
    metadata: { reason: reason.trim() },
    message: `Booking ${booking.bookingReference} cancelled.`,
  });

  await emailService.sendBookingCancelled(booking);
  await recordEmailSent(booking, 'Booking Cancelled');

  return booking;
};

const checkIn = async (bookingId, actor) => {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw ApiError.notFound('Booking not found.');

  if (booking.status !== BOOKING_STATUS.BOOKED) {
    throw ApiError.badRequest(
      `Only "Booked" bookings can be checked in (current: "${booking.status}").`
    );
  }

  booking.status = BOOKING_STATUS.CHECKED_IN;
  booking.checkedInAt = new Date();
  await booking.save();
  await roomService.syncRoomStatus(booking.room);

  await auditService.record({
    action: AUDIT_ACTIONS.CHECKED_IN,
    booking,
    actorType: ACTOR_TYPE.USER,
    actor,
    actorLabel: actor.email,
    message: `${booking.bookingReference} checked in.`,
  });

  return booking;
};

const checkOut = async (bookingId, actor, checkoutReason = null) => {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw ApiError.notFound('Booking not found.');

  if (booking.status !== BOOKING_STATUS.CHECKED_IN) {
    throw ApiError.badRequest(
      `Only "Checked In" bookings can be checked out (current: "${booking.status}").`
    );
  }

  booking.status = BOOKING_STATUS.CHECKED_OUT;
  booking.checkedOutAt = new Date();
  booking.checkoutReason = checkoutReason || null;
  await booking.save();
  await roomService.syncRoomStatus(booking.room);

  await auditService.record({
    action: AUDIT_ACTIONS.CHECKED_OUT,
    booking,
    actorType: ACTOR_TYPE.USER,
    actor,
    actorLabel: actor.email,
    message: `${booking.bookingReference} checked out.`,
  });

  const invoice = await invoiceService.generateInvoiceForBooking(booking, { mode: 'createIfMissing' });

  return { booking, invoice };
};

const autoCheckOutDueBookings = async () => {
  const dueBookings = await Booking.find({
    status: { $in: [BOOKING_STATUS.BOOKED, BOOKING_STATUS.CHECKED_IN] },
    departureDate: { $lte: new Date() },
  });

  for (const booking of dueBookings) {
    booking.status = BOOKING_STATUS.CHECKED_OUT;
    booking.checkedOutAt = new Date();
    await booking.save();
    await roomService.syncRoomStatus(booking.room);
    await auditService.record({
      action: AUDIT_ACTIONS.CHECKED_OUT,
      booking,
      actorType: ACTOR_TYPE.SYSTEM,
      message: `${booking.bookingReference} automatically checked out at the departure time.`,
    });
  }

  return dueBookings.length;
};

const generateInvoiceForBookingId = async (bookingId) => {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw ApiError.notFound('Booking not found.');
  const invoice = await invoiceService.generateInvoiceForBooking(booking, { mode: 'upsert' });
  return invoice;
};

const deleteBooking = async (bookingId, actor) => {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw ApiError.notFound('Booking not found.');

  const invoice = await Invoice.findOne({ booking: booking._id }).select('_id invoiceNumber');
  if (invoice) {
    try {
      await Invoice.deleteOne({ _id: invoice._id });
    } catch (_) {}
  }

  try {
    const { AuditLog } = require('../models');
    await AuditLog.deleteMany({ booking: booking._id });
  } catch (_) {}

  const snapshot = booking.toJSON();
  await Booking.deleteOne({ _id: booking._id });

  try {
    await auditService.record({
      action: AUDIT_ACTIONS.BOOKING_DELETED,
      actorType: ACTOR_TYPE.USER,
      actor,
      actorLabel: actor.email,
      metadata: {
        bookingReference: snapshot.bookingReference,
        guestName: `${snapshot.guest?.firstName ?? ''} ${snapshot.guest?.lastName ?? ''}`.trim(),
        invoiceId: invoice?._id,
        invoiceNumber: invoice?.invoiceNumber,
      },
      message: `Booking ${snapshot.bookingReference} permanently deleted.`,
    });
  } catch (_) {}

  return { deletedId: bookingId, bookingReference: snapshot.bookingReference, deletedInvoice: invoice ? { _id: invoice._id, invoiceNumber: invoice.invoiceNumber } : null };
};

module.exports = {
  createBooking,
  resendBookingEmails,
  listBookings,
  getBookingById,
  updateBooking,
  cancelBooking,
  checkIn,
  checkOut,
  autoCheckOutDueBookings,
  generateInvoiceForBookingId,
  deleteBooking,
};
