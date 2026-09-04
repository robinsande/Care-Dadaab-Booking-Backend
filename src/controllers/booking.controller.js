const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');
const bookingService = require('../services/booking.service');

const listBookings = asyncHandler(async (req, res) => {
  const data = await bookingService.listBookings(req.query);
  sendSuccess(res, { message: 'Bookings retrieved.', data });
});

const getBooking = asyncHandler(async (req, res) => {
  const { booking, timeline, invoice } = await bookingService.getBookingById(req.params.id);
  const data = { ...booking.toJSON(), timeline };
  if (invoice) {
    data.invoice = invoice;
    data.invoiceId = invoice._id;
  }
  sendSuccess(res, { message: 'Booking retrieved.', data });
});

const createBooking = asyncHandler(async (req, res) => {
  const result = await bookingService.createBooking(req.body, req.user);
  const booking = result.booking || result;
  const invoice = result.invoice || null;
  const payload = booking.toJSON ? booking.toJSON() : { ...booking };
  if (invoice) {
    payload.invoice = invoice.toJSON ? invoice.toJSON() : { ...invoice };
    payload.invoiceId = invoice._id;
  }
  sendSuccess(res, {
    statusCode: 201,
    message: 'Booking created successfully.',
    data: payload,
  });
});

const generateInvoice = asyncHandler(async (req, res) => {
  const invoice = await bookingService.generateInvoiceForBookingId(req.params.id);
  sendSuccess(res, { message: 'Invoice generated.', data: invoice });
});

const updateBooking = asyncHandler(async (req, res) => {
  const booking = await bookingService.updateBooking(req.params.id, req.body, req.user);
  sendSuccess(res, { message: 'Booking updated.', data: booking });
});

const cancelBooking = asyncHandler(async (req, res) => {
  const booking = await bookingService.cancelBooking(req.params.id, req.body, req.user);
  sendSuccess(res, { message: 'Booking cancelled.', data: booking });
});

const checkIn = asyncHandler(async (req, res) => {
  const booking = await bookingService.checkIn(req.params.id, req.user);
  sendSuccess(res, { message: 'Guest checked in.', data: booking });
});

const checkOut = asyncHandler(async (req, res) => {
  const result = await bookingService.checkOut(req.params.id, req.user, req.body?.checkoutReason);
  sendSuccess(res, {
    message: 'Guest checked out. Invoice generated.',
    data: result,
  });
});

const deleteBooking = asyncHandler(async (req, res) => {
  const result = await bookingService.deleteBooking(req.params.id, req.user);
  sendSuccess(res, { message: `Booking ${result.bookingReference} deleted.`, data: result });
});

module.exports = {
  listBookings,
  getBooking,
  createBooking,
  updateBooking,
  cancelBooking,
  checkIn,
  checkOut,
  generateInvoice,
  deleteBooking,
};
