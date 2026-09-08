const { GuestRequest, Booking, User } = require('../models');
const ApiError = require('../utils/ApiError');
const campService = require('./camp.service');
const bookingService = require('./booking.service');
const emailService = require('./email.service');
const settingsService = require('./settings.service');
const env = require('../config/env');

const REQUEST_TYPES = ['booking', 'adjustment', 'early_checkout', 'extension'];

const staffRecipients = async () => {
  const [users, settings] = await Promise.all([
    User.find({ isActive: true }).select('email').lean(),
    settingsService.getSettings(),
  ]);
  return [...new Set([
    ...users.map((user) => user.email),
    settings.supportEmail,
    env.support.email,
  ].filter(Boolean))];
};

const notify = async (request, guest) => {
  try {
    await emailService.sendGuestRequestNotification(request, guest, await staffRecipients());
  } catch (_) {
    // Email delivery must not prevent a request being recorded.
  }
};

const assertDates = (arrivalDate, departureDate) => {
  const arrival = new Date(arrivalDate);
  const departure = new Date(departureDate);
  if (Number.isNaN(arrival.getTime()) || Number.isNaN(departure.getTime()) || departure <= arrival) {
    throw ApiError.badRequest('Departure date must be after arrival date.');
  }
  return { arrival, departure };
};

const createBookingRequest = async (guest, payload) => {
  if (!payload.campId || !payload.arrivalDate || !payload.departureDate) {
    throw ApiError.badRequest('Camp, arrival date and departure date are required.');
  }
  const { arrival, departure } = assertDates(payload.arrivalDate, payload.departureDate);
  const camp = await campService.getCampById(payload.campId);
  if (!camp.isActive) throw ApiError.conflict('The selected camp is not active.');
  const request = await GuestRequest.create({
    guest: guest._id,
    type: 'booking',
    camp: camp._id,
    arrivalDate: arrival,
    departureDate: departure,
    stayType: payload.stayType || 'Short Stay',
    reason: payload.reason || '',
    requestedData: {
      firstName: payload.firstName || guest.firstName,
      lastName: payload.lastName || guest.lastName,
      phone: payload.phone || guest.phone,
      organisation: payload.organisation || '',
      gender: payload.gender || '',
      contractType: payload.contractType || '',
      kenyaOffice: payload.kenyaOffice || '',
      internationalCountry: payload.internationalCountry || '',
      departureCountry: payload.departureCountry || '',
      reasonForVisit: payload.reasonForVisit || payload.reason || '',
      remarks: payload.remarks || '',
      driverPickup: Boolean(payload.driverPickup),
    },
  });
  await notify(request, guest);
  return request;
};

const getGuestBooking = async (guest, bookingId) => {
  const booking = await Booking.findOne({
    _id: bookingId,
    $or: [{ guestAccount: guest._id }, { 'guest.email': guest.email }],
  });
  if (!booking) throw ApiError.notFound('Booking not found.');
  return booking;
};

const createBookingRequestForGuest = async (guest, payload) => {
  const type = payload.type;
  if (!REQUEST_TYPES.includes(type) || type === 'booking') {
    if (type !== 'booking') throw ApiError.badRequest('A valid guest request type is required.');
    return createBookingRequest(guest, payload);
  }
  if (!payload.bookingId) throw ApiError.badRequest('A booking is required for this request.');
  const booking = await getGuestBooking(guest, payload.bookingId);
  if (!String(payload.reason || '').trim()) {
    throw ApiError.badRequest('A reason is required for this guest request.');
  }
  const requestedData = {};
  if (type === 'adjustment') {
    [
      'firstName', 'lastName', 'phone', 'organisation', 'reasonForVisit',
      'remarks', 'departureCountry', 'kenyaOffice', 'internationalCountry',
    ].forEach((field) => {
      if (payload[field] !== undefined) requestedData[field] = payload[field];
    });
    if (!Object.keys(requestedData).length) throw ApiError.badRequest('Provide at least one booking adjustment.');
  }
  if (type === 'extension') {
    const { departure } = assertDates(booking.arrivalDate, payload.newDepartureDate);
    if (departure <= booking.departureDate) {
      throw ApiError.badRequest('The new departure date must be after the current departure date.');
    }
    requestedData.newDepartureDate = payload.newDepartureDate;
  }
  const request = await GuestRequest.create({
    guest: guest._id,
    type,
    booking: booking._id,
    reason: payload.reason || '',
    requestedData,
  });
  await notify(request, guest);
  return request;
};

const listForGuest = (guest) =>
  GuestRequest.find({ guest: guest._id })
    .populate('booking', 'bookingReference status arrivalDate departureDate campName roomNumber')
    .populate('camp', 'name')
    .sort({ createdAt: -1 });

const listBookingsForGuest = (guest) =>
  Booking.find({
    $or: [{ guestAccount: guest._id }, { 'guest.email': guest.email }],
  })
    .populate('camp', 'name')
    .populate('room', 'blockName roomNumber')
    .sort({ arrivalDate: -1 });

const listForStaff = (query = {}) => GuestRequest.find(query)
  .populate('guest', 'firstName lastName email phone')
  .populate('booking', 'bookingReference status arrivalDate departureDate campName roomNumber')
  .populate('camp', 'name')
  .populate('resolvedBy', 'firstName lastName email')
  .sort({ status: 1, createdAt: -1 });

const resolve = async (requestId, actor, { action = 'approve', resolutionNote = '', campId, blockId, roomId } = {}) => {
  const request = await GuestRequest.findById(requestId).populate('guest');
  if (!request) throw ApiError.notFound('Guest request not found.');
  if (request.status !== 'pending') throw ApiError.badRequest('This guest request has already been resolved.');
  if (action === 'reject') {
    request.status = 'rejected';
    request.resolutionNote = resolutionNote;
    request.resolvedBy = actor._id;
    request.resolvedAt = new Date();
    await request.save();
    await notify(request, request.guest);
    return request;
  }

  let booking = null;
  if (request.type === 'booking') {
    if (!campId || !blockId || !roomId) {
      throw ApiError.badRequest('Camp, block and room assignment are required to approve a booking request.');
    }
    booking = (await bookingService.createBooking({
      firstName: request.requestedData?.firstName || request.guest.firstName,
      lastName: request.requestedData?.lastName || request.guest.lastName,
      email: request.guest.email,
      phone: request.requestedData?.phone || request.guest.phone,
      organisation: request.requestedData?.organisation,
      gender: request.requestedData?.gender,
      contractType: request.requestedData?.contractType,
      kenyaOffice: request.requestedData?.kenyaOffice,
      internationalCountry: request.requestedData?.internationalCountry,
      departureCountry: request.requestedData?.departureCountry,
      arrivalDate: request.arrivalDate,
      departureDate: request.departureDate,
      campId,
      blockId,
      roomId,
      stayType: request.stayType,
      reasonForVisit: request.requestedData?.reasonForVisit || request.reason,
      remarks: request.requestedData?.remarks,
      driverPickup: request.requestedData?.driverPickup,
      guestAccountId: request.guest._id,
    }, actor)).booking;
  } else {
    booking = await getGuestBooking(request.guest, request.booking);
    if (request.type === 'adjustment') {
      await bookingService.updateBooking(booking._id, request.requestedData || {}, actor);
    } else if (request.type === 'extension') {
      await bookingService.extendStay(booking._id, {
        newDepartureDate: request.requestedData.newDepartureDate,
        reason: request.reason || 'Guest requested extension',
      }, actor);
    } else if (request.type === 'early_checkout') {
      await bookingService.checkOut(booking._id, actor, request.reason || 'Guest requested early checkout');
    }
  }

  request.status = 'approved';
  request.booking = booking?._id || request.booking;
  request.resolutionNote = resolutionNote;
  request.resolvedBy = actor._id;
  request.resolvedAt = new Date();
  await request.save();
  await request.populate('booking', 'bookingReference status arrivalDate departureDate campName roomNumber');
  await notify(request, request.guest);
  return request;
};

module.exports = {
  createBookingRequestForGuest,
  listForGuest,
  listBookingsForGuest,
  listForStaff,
  resolve,
  getGuestBooking,
};
