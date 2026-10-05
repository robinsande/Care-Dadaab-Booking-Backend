const test = require('node:test');
const assert = require('node:assert/strict');
const env = require('../src/config/env');
const emailService = require('../src/services/email.service');
const { GuestRequest } = require('../src/models');
const guestRequestService = require('../src/services/guest-request.service');

test('staff cannot complete a booking request without assigning a room', async (t) => {
  const originalFindById = GuestRequest.findById;
  GuestRequest.findById = () => ({
    populate: async () => ({
      status: 'pending',
      type: 'booking',
      guest: { _id: 'guest-id' },
    }),
  });
  t.after(() => {
    GuestRequest.findById = originalFindById;
  });

  await assert.rejects(
    guestRequestService.resolve('request-id', { _id: 'staff-id' }),
    /Select an available room/,
  );
});

test('guest booking emails separate guest acknowledgement from staff request notification', async (t) => {
  const originalFetch = global.fetch;
  const originalApiKey = env.brevoApiKey;
  const messages = [];
  env.brevoApiKey = 'test-api-key';
  global.fetch = async (_url, options) => {
    messages.push(JSON.parse(options.body));
    return { ok: true };
  };
  t.after(() => {
    global.fetch = originalFetch;
    env.brevoApiKey = originalApiKey;
  });

  const guest = {
    firstName: 'Amina',
    lastName: 'Guest',
    email: 'amina@example.org',
    phone: '+254700000000',
  };
  const request = {
    type: 'booking',
    stayType: 'Short Stay',
    camp: { name: 'Dadaab' },
    arrivalDate: new Date('2026-11-01'),
    departureDate: new Date('2026-11-03'),
    requestedData: { phone: guest.phone },
  };

  assert.equal(await emailService.sendGuestBookingRequestConfirmation(request, guest), true);
  assert.equal(await emailService.sendStaffGuestBookingRequestNotification(
    request,
    guest,
    ['officer@example.org', 'admin@example.org'],
  ), true);

  assert.deepEqual(messages[0].to, [{ email: guest.email }]);
  assert.deepEqual(
    messages.slice(1).flatMap((message) => message.to.map((recipient) => recipient.email)).sort(),
    ['admin@example.org', 'officer@example.org'],
  );
  assert.equal(messages[0].subject, 'CARE accommodation booking request received');
  assert.ok(messages.slice(1).every((message) => message.subject.includes('requires room assignment')));
});

test('booking confirmation sends its PDF invoice to the guest email', async (t) => {
  const originalFetch = global.fetch;
  const originalApiKey = env.brevoApiKey;
  let message;
  env.brevoApiKey = 'test-api-key';
  global.fetch = async (_url, options) => {
    message = JSON.parse(options.body);
    return { ok: true };
  };
  t.after(() => {
    global.fetch = originalFetch;
    env.brevoApiKey = originalApiKey;
  });

  const booking = {
    bookingReference: 'CARE-20261101-000001',
    guest: { firstName: 'Amina', email: 'amina@example.org' },
    campName: 'Dadaab',
    blockName: 'A',
    roomNumber: '1',
    stayType: 'Short Stay',
    arrivalDate: new Date('2026-11-01'),
    departureDate: new Date('2026-11-03'),
    status: 'Booked',
  };
  const invoice = {
    invoiceNumber: 'INV-000001',
    appliedRate: { currency: 'KES', amount: 1500, ratePeriod: 'per_night' },
    totalAmount: 3000,
    paymentInstructions: {},
  };
  const invoicePdf = {
    filename: 'INV-000001.pdf',
    content: Buffer.from('%PDF'),
    contentType: 'application/pdf',
  };

  assert.equal(await emailService.sendBookingConfirmationWithInvoice(
    booking,
    invoice,
    [booking.guest.email],
    invoicePdf,
  ), true);
  assert.deepEqual(message.to, [{ email: booking.guest.email }]);
  assert.deepEqual(message.attachments, [{ name: invoicePdf.filename, content: 'JVBERg==' }]);
  assert.match(message.subject, /Booking Confirmed and Invoice/);
});
