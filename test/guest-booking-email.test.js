const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const env = require('../src/config/env');
const emailService = require('../src/services/email.service');
const { GuestRequest, Booking, User, ReminderLog, Invoice, Receipt } = require('../src/models');
const invoiceService = require('../src/services/invoice.service');
const auditService = require('../src/services/audit.service');
const bookingService = require('../src/services/booking.service');
const reminderService = require('../src/services/reminder.service');
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

test('marking an invoice paid generates and sends its receipt only on the paid transition', async (t) => {
  const originalFindById = Invoice.findById;
  const originalFindReceipt = Receipt.findOne;
  const originalCreateReceipt = Receipt.create;
  const originalSendInvoicePaid = emailService.sendInvoicePaid;
  let storedReceipt = null;
  const invoice = {
    invoiceNumber: 'INV-000002',
    bookingReference: 'CARE-20261101-000002',
    guest: { firstName: 'Amina', lastName: 'Guest', email: 'amina@example.org' },
    campName: 'Dadaab',
    blockName: 'A',
    roomNumber: '1',
    arrivalDate: new Date('2026-11-01'),
    departureDate: new Date('2026-11-03'),
    numberOfNights: 2,
    stayType: 'Short Stay',
    appliedRate: { currency: 'KES', amount: 1500, ratePeriod: 'per_night' },
    totalAmount: 3000,
    paymentInstructions: {},
    paymentStatus: 'Unpaid',
    save: async () => {},
  };
  const sentReceipts = [];
  Invoice.findById = async () => invoice;
  Receipt.findOne = async () => storedReceipt;
  Receipt.create = async (data) => {
    storedReceipt = {
      ...data,
      emailStatus: 'pending',
      save: async () => {},
    };
    return storedReceipt;
  };
  emailService.sendInvoicePaid = async (_paidInvoice, receipt) => {
    sentReceipts.push(receipt);
    return true;
  };
  t.after(() => {
    Invoice.findById = originalFindById;
    Receipt.findOne = originalFindReceipt;
    Receipt.create = originalCreateReceipt;
    emailService.sendInvoicePaid = originalSendInvoicePaid;
  });

  await invoiceService.updatePaymentStatus('invoice-id', 'Paid', { paymentMethod: 'Cash' });
  await invoiceService.updatePaymentStatus('invoice-id', 'Paid', { paymentMethod: 'Cash' });

  assert.equal(sentReceipts.length, 1);
  assert.equal(sentReceipts[0].filename, 'RCPT-INV-000002.pdf');
  assert.equal(sentReceipts[0].contentType, 'application/pdf');
  assert.equal(sentReceipts[0].content.subarray(0, 4).toString(), '%PDF');
  const pdfObjects = sentReceipts[0].content.toString('latin1');
  assert.ok((pdfObjects.match(/\/Subtype\s*\/Image\b/g) || []).length >= 2);
  assert.equal(invoice.paymentMethod, 'Cash');
  assert.equal(storedReceipt.receiptNumber, 'RCPT-INV-000002');
  assert.equal(storedReceipt.emailStatus, 'sent');
  assert.equal(storedReceipt.documentVersion, 2);
  assert.equal(storedReceipt.invoiceSnapshot.paymentStatus, 'Paid');
  assert.deepEqual(storedReceipt.pdf, sentReceipts[0].content);
});

test('paid invoice email includes the generated receipt PDF', async (t) => {
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

  const receipt = { filename: 'INV-000003-receipt.pdf', content: Buffer.from('%PDF receipt') };
  assert.equal(await emailService.sendInvoicePaid({
    invoiceNumber: 'INV-000003',
    bookingReference: 'CARE-20261101-000003',
    guest: { firstName: 'Amina', email: 'amina@example.org' },
    paymentStatus: 'Paid',
    paymentMethod: 'M-Pesa STK Push',
    paidAt: new Date('2026-11-03'),
    appliedRate: { currency: 'KES' },
    totalAmount: 3000,
  }, receipt), true);

  assert.deepEqual(message.to, [{ email: 'amina@example.org' }]);
  assert.deepEqual(message.attachments, [{
    name: receipt.filename,
    content: receipt.content.toString('base64'),
  }]);
  assert.match(message.subject, /Payment Receipt RCPT-INV-000003/);
});

test('both unpaid invoices and paid receipts embed the CARE stamp', async () => {
  const invoice = {
    invoiceNumber: 'INV-000004',
    bookingReference: 'CARE-20261101-000004',
    guest: { firstName: 'Amina', lastName: 'Guest', email: 'amina@example.org' },
    campName: 'Dadaab',
    blockName: 'A',
    roomNumber: '1',
    arrivalDate: new Date('2026-11-01'),
    departureDate: new Date('2026-11-03'),
    numberOfNights: 2,
    stayType: 'Short Stay',
    appliedRate: { currency: 'KES', amount: 1500, ratePeriod: 'per_night' },
    totalAmount: 3000,
    paymentInstructions: {},
    paymentStatus: 'Unpaid',
    recipientOfficer: { email: 'booking.officer@example.org' },
  };
  const pdfs = await Promise.all([
    invoiceService.generateInvoicePdfBuffer(invoice),
    invoiceService.generateInvoicePdfBuffer({ ...invoice, paymentStatus: 'Paid', paidAt: new Date() }),
  ]);

  for (const pdf of pdfs) {
    const pdfObjects = pdf.toString('latin1');
    assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
    assert.ok((pdfObjects.match(/\/Subtype\s*\/Image\b/g) || []).length >= 2);
    const textStreams = [...pdfObjects.matchAll(/\/Filter\s*\/FlateDecode[\s\S]*?stream\r?\n([\s\S]*?)\r?\nendstream/g)]
      .map(([, stream]) => zlib.inflateSync(Buffer.from(stream, 'latin1')).toString('latin1'))
      .join('\n');
    const decodedText = textStreams.replace(/\[((?:\s*<[\da-f]+>\s*(?:-?\d+(?:\.\d+)?\s*)?)+)\]\s*TJ/gi, (_, fragments) =>
      [...fragments.matchAll(/<([\da-f]+)>/g)]
        .map(([, hex]) => Buffer.from(hex, 'hex').toString('latin1'))
        .join(''));
    assert.match(decodedText, /booking\.officer@example\.org/);
  }
});

test('guest portal requests send staff review alerts', async (t) => {
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

  const request = {
    type: 'extension',
    status: 'pending',
    booking: { bookingReference: 'CARE-20261101-000001' },
    reason: 'Project work has been extended',
    requestedData: { newDepartureDate: new Date('2026-11-10') },
  };
  const guest = {
    firstName: 'Amina',
    lastName: 'Guest',
    email: 'amina@example.org',
    phone: '+254700000000',
  };

  assert.equal(await emailService.sendStaffGuestRequestNotification(
    request,
    guest,
    ['officer@example.org', 'support@example.org'],
  ), true);
  assert.deepEqual(
    messages.map((message) => message.to[0].email).sort(),
    ['officer@example.org', 'support@example.org'],
  );
  assert.ok(messages.every((message) => message.subject.includes('extension request requires review')));
});

test('new booking alerts staff and invoice emails accept officer recipients', async (t) => {
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

  const booking = {
    bookingReference: 'CARE-20261101-000001',
    guest: { firstName: 'Amina', lastName: 'Guest', email: 'amina@example.org' },
    campName: 'Dadaab',
    blockName: 'A',
    roomNumber: '1',
    arrivalDate: new Date('2026-11-01'),
    departureDate: new Date('2026-11-03'),
    status: 'Booked',
  };
  assert.equal(await emailService.sendStaffBookingCreatedNotification(
    booking,
    ['officer@example.org', 'support@example.org'],
  ), true);

  const invoice = {
    invoiceNumber: 'INV-000001',
    bookingReference: booking.bookingReference,
    guest: booking.guest,
    campName: booking.campName,
    blockName: booking.blockName,
    roomNumber: booking.roomNumber,
    arrivalDate: booking.arrivalDate,
    departureDate: booking.departureDate,
    numberOfNights: 2,
    stayType: 'Short Stay',
    appliedRate: { currency: 'KES', amount: 1500, ratePeriod: 'per_night' },
    totalAmount: 3000,
    paymentInstructions: {},
  };
  assert.equal(await emailService.sendInvoiceGenerated(
    booking,
    invoice,
    { filename: 'INV-000001.pdf', content: Buffer.from('%PDF') },
    [booking.guest.email, 'officer@example.org'],
  ), true);

  assert.deepEqual(
    messages.slice(-2).map((message) => message.to[0].email).sort(),
    ['amina@example.org', 'officer@example.org'],
  );
  assert.ok(messages.slice(-2).every((message) => message.attachments.length === 1));
});

test('resending booking emails alerts guest, booking officers, super admins, and support', async (t) => {
  const originals = {
    fetch: global.fetch,
    apiKey: env.brevoApiKey,
    findBooking: Booking.findById,
    findUser: User.findById,
    findUsers: User.find,
    generateInvoice: invoiceService.generateInvoiceForBooking,
    generatePdf: invoiceService.generateInvoicePdfBuffer,
    auditRecord: auditService.record,
  };
  const messages = [];
  const booking = {
    _id: 'booking-id',
    bookingReference: 'CARE-20261101-000001',
    createdBy: 'creator-id',
    billingType: 'guest',
    guest: { firstName: 'Amina', lastName: 'Guest', email: 'amina@example.org' },
    campName: 'Dadaab',
    blockName: 'A',
    roomNumber: '1',
    stayType: 'Short Stay',
    arrivalDate: new Date('2026-11-01'),
    departureDate: new Date('2026-11-03'),
    status: 'Booked',
    appliedRate: { currency: 'KES', amount: 1500, ratePeriod: 'per_night' },
  };
  env.brevoApiKey = 'test-api-key';
  global.fetch = async (_url, options) => {
    messages.push(JSON.parse(options.body));
    return { ok: true };
  };
  Booking.findById = async () => booking;
  User.findById = () => ({
    select: () => ({
      lean: async () => ({ email: 'creator@example.org' }),
    }),
  });
  User.find = () => ({
    select: () => ({
      lean: async () => [
        { email: 'officer@example.org' },
        { email: 'admin@example.org' },
      ],
    }),
  });
  invoiceService.generateInvoiceForBooking = async () => ({
    invoiceNumber: 'INV-000001',
    appliedRate: { currency: 'KES', amount: 1500, ratePeriod: 'per_night' },
    totalAmount: 3000,
    paymentInstructions: {},
  });
  invoiceService.generateInvoicePdfBuffer = async () => Buffer.from('%PDF');
  auditService.record = async () => {};
  t.after(() => {
    global.fetch = originals.fetch;
    env.brevoApiKey = originals.apiKey;
    Booking.findById = originals.findBooking;
    User.findById = originals.findUser;
    User.find = originals.findUsers;
    invoiceService.generateInvoiceForBooking = originals.generateInvoice;
    invoiceService.generateInvoicePdfBuffer = originals.generatePdf;
    auditService.record = originals.auditRecord;
  });

  const result = await bookingService.resendBookingEmails('booking-id', {
    _id: 'actor-id',
    email: 'actor@example.org',
  });
  assert.equal(result.bookingEmailSent, true);
  assert.equal(result.invoiceEmailSent, true);
  assert.equal(result.staffEmailSent, true);
  assert.deepEqual(
    messages.map((message) => message.to[0].email).sort(),
    [
      'accommodation.dadaab@care.org',
      'actor@example.org',
      'admin@example.org',
      'amina@example.org',
      'creator@example.org',
      'officer@example.org',
    ],
  );
});

test('pending invoice reminders email the guest, booking officer, and active super admins', async (t) => {
  const originals = {
    fetch: global.fetch,
    apiKey: env.brevoApiKey,
    findReminder: ReminderLog.findOne,
    createReminder: ReminderLog.create,
    findUser: User.findById,
    findUsers: User.find,
  };
  const messages = [];
  const booking = {
    _id: 'booking-id',
    bookingReference: 'CARE-20261101-000001',
    createdBy: 'creator-id',
    guest: { firstName: 'Amina', lastName: 'Guest', email: 'amina@example.org' },
    campName: 'Dadaab',
    blockName: 'A',
    roomNumber: '1',
    arrivalDate: new Date('2026-11-01'),
    departureDate: new Date('2026-11-03'),
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
  };
  const invoice = {
    invoiceNumber: 'INV-000001',
    booking: booking._id,
    recipientOfficer: 'creator-id',
    generatedAt: new Date('2026-10-01'),
    appliedRate: { currency: 'KES' },
    totalAmount: 3000,
  };
  env.brevoApiKey = 'test-api-key';
  global.fetch = async (_url, options) => {
    messages.push(JSON.parse(options.body));
    return { ok: true };
  };
  ReminderLog.findOne = () => ({
    select: () => ({ lean: async () => null }),
  });
  ReminderLog.create = async () => ({});
  User.findById = () => ({
    select: () => ({
      lean: async () => ({ email: 'officer@example.org' }),
    }),
  });
  User.find = () => ({
    select: () => ({
      lean: async () => [{ email: 'admin@example.org' }],
    }),
  });
  t.after(() => {
    global.fetch = originals.fetch;
    env.brevoApiKey = originals.apiKey;
    ReminderLog.findOne = originals.findReminder;
    ReminderLog.create = originals.createReminder;
    User.findById = originals.findUser;
    User.find = originals.findUsers;
  });

  assert.equal(await reminderService.sendPendingInvoiceCatchUp(booking, invoice), true);
  const guestMessage = messages.find((message) => message.to[0].email === booking.guest.email);
  const staffMessages = messages.filter((message) => message.to[0].email !== booking.guest.email);
  assert.ok(guestMessage.subject.startsWith('Payment Reminder'));
  assert.deepEqual(
    staffMessages.map((message) => message.to[0].email).sort(),
    ['admin@example.org', 'officer@example.org'],
  );
  assert.ok(staffMessages.every((message) => message.subject.includes('Pending invoice INV-000001')));
});

test('pending invoice catch-up skips invoices with an already successful payment reminder', async (t) => {
  const originalFindReminder = ReminderLog.findOne;
  ReminderLog.findOne = (query) => ({
    select: () => ({
      lean: async () => (query.booking ? { _id: 'existing-reminder' } : null),
    }),
  });
  t.after(() => {
    ReminderLog.findOne = originalFindReminder;
  });

  const sent = await reminderService.sendPendingInvoiceCatchUp(
    { _id: 'booking-id', createdAt: new Date() },
    { generatedAt: new Date() },
  );
  assert.equal(sent, null);
});
