const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');
const service = require('../services/guest-request.service');
const campService = require('../services/camp.service');

const listCamps = asyncHandler(async (_req, res) => {
  sendSuccess(res, { message: 'Camps retrieved.', data: await campService.listActiveCamps() });
});
const create = asyncHandler(async (req, res) => {
  sendSuccess(res, {
    statusCode: 201,
    message: 'Guest request submitted.',
    data: await service.createBookingRequestForGuest(req.guest, req.body),
  });
});
const listMine = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Guest requests retrieved.', data: await service.listForGuest(req.guest) });
});
const listBookings = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Guest bookings retrieved.', data: await service.listBookingsForGuest(req.guest) });
});
const createForBooking = asyncHandler(async (req, res) => {
  sendSuccess(res, {
    statusCode: 201,
    message: 'Guest request submitted.',
    data: await service.createBookingRequestForGuest(req.guest, { ...req.body, type: req.body.type, bookingId: req.params.id }),
  });
});
const listStaff = asyncHandler(async (req, res) => {
  const filter = req.query.status ? { status: req.query.status } : {};
  sendSuccess(res, { message: 'Guest requests retrieved.', data: await service.listForStaff(filter) });
});
const resolve = asyncHandler(async (req, res) => {
  sendSuccess(res, {
    message: 'Guest request resolved.',
    data: await service.resolve(req.params.id, req.user, req.body),
  });
});

module.exports = { listCamps, create, createForBooking, listMine, listBookings, listStaff, resolve };
