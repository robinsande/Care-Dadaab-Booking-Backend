/* eslint-disable no-console */
const path = require('path');
const mongoose = require('mongoose');
const env = require('../config/env');
const {
  User,
  Camp,
  Block,
  Room,
  Rate,
  Settings,
  Booking,
  AuditLog,
} = require('../models');
const {
  ROLES,
  ROOM_STATUS,
  STAY_TYPE,
  BOOKING_STATUS,
  GENDER,
  AUDIT_ACTIONS,
  ACTOR_TYPE,
} = require('../utils/constants');
const roomInventory = require('./room-inventory.json');

const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return startOfDay(d);
};

const CAMP_DEFINITIONS = [
  {
    name: 'CARE Dadaab',
    code: 'dmo',
    description: 'CARE accommodation facility at Dadaab (DMO).',
  },
  {
    name: 'CARE Hagadera',
    code: 'hag',
    description: 'CARE accommodation facility at Hagadera (HAG).',
  },
  {
    name: 'CARE Ifo',
    code: 'ifo',
    description: 'CARE accommodation facility at Ifo (IFO).',
  },
];

const DEFAULT_RATES = {
  [STAY_TYPE.SHORT_STAY]: 3500,
  [STAY_TYPE.LONG_STAY]: 2500,
};

const seedCampsBlocksAndRooms = async () => {
  const campByName = new Map();
  const blockByCampAndName = new Map();

  for (const definition of CAMP_DEFINITIONS) {
    const camp = await Camp.create({
      name: definition.name,
      code: definition.code,
      description: definition.description,
      isActive: true,
    });
    campByName.set(definition.name, camp);
  }

  for (const entry of roomInventory.rooms) {
    const camp = campByName.get(entry.camp);
    if (!camp) {
      throw new Error(`Unknown camp in room inventory: ${entry.camp}`);
    }

    const blockKey = `${entry.camp}::${entry.block}`;
    let block = blockByCampAndName.get(blockKey);
    if (!block) {
      block = await Block.create({
        camp: camp._id,
        name: entry.block,
        isActive: true,
      });
      blockByCampAndName.set(blockKey, block);
    }

    await Room.create({
      camp: camp._id,
      block: block._id,
      blockName: entry.block,
      roomNumber: entry.roomNumber,
      capacity: 1,
      status: ROOM_STATUS.AVAILABLE,
      isActive: true,
    });
  }

  return { campByName, blockCount: blockByCampAndName.size };
};

const seedRates = async (campByName, superAdmin) => {
  const effectiveFrom = new Date(2026, 0, 1);

  for (const camp of campByName.values()) {
    for (const stayType of [STAY_TYPE.SHORT_STAY, STAY_TYPE.LONG_STAY]) {
      await Rate.create({
        camp: camp._id,
        stayType,
        amount: DEFAULT_RATES[stayType],
        currency: 'KES',
        effectiveFrom,
        effectiveTo: null,
        createdBy: superAdmin._id,
        notes: `Default ${stayType} rate for ${camp.name}.`,
      });
    }
  }
};

const seedSampleBooking = async ({ campByName, blockByCampAndName, officer, superAdmin, today }) => {
  const dadaabCamp = campByName.get('CARE Dadaab');
  const rundaBlock = [...blockByCampAndName.values()].find(
    (block) => String(block.camp) === String(dadaabCamp._id) && block.name === 'Runda'
  );
  if (!rundaBlock) return null;

  const room = await Room.findOne({
    camp: dadaabCamp._id,
    block: rundaBlock._id,
    roomNumber: '80',
  });
  if (!room) return null;

  const shortStayRate = await Rate.findOne({
    camp: dadaabCamp._id,
    stayType: STAY_TYPE.SHORT_STAY,
    effectiveTo: null,
  });

  const arrivalDate = addDays(today, 3);
  const departureDate = addDays(arrivalDate, 3);
  const createdAt = addDays(today, -1);

  const booking = new Booking({
    bookingReference: `${env.bookingReferencePrefix}-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}-000001`,
    guest: {
      firstName: 'Lewis',
      lastName: 'Kanyi',
      email: 'lewiskanyi@example.com',
      phone: '+254712000011',
      organisation: 'CARE Kenya',
      gender: GENDER.MALE,
      contractType: 'Staff',
      departureCountry: 'Kenya',
    },
    reasonForVisit: 'Field visit',
    remarks: 'Seed booking for Lewis Kanyi',
    driverPickup: false,
    arrivalDate,
    departureDate,
    status: BOOKING_STATUS.BOOKED,
    camp: dadaabCamp._id,
    campName: dadaabCamp.name,
    block: rundaBlock._id,
    blockName: rundaBlock.name,
    room: room._id,
    roomNumber: room.roomNumber,
    stayType: STAY_TYPE.SHORT_STAY,
    appliedRate: {
      rateId: shortStayRate._id,
      amount: shortStayRate.amount,
      currency: shortStayRate.currency,
      stayType: shortStayRate.stayType,
    },
    createdBy: officer._id,
  });

  booking.createdAt = createdAt;
  booking.updatedAt = createdAt;
  await booking.save();

  const bookingCreatedAudit = new AuditLog({
    action: AUDIT_ACTIONS.BOOKING_CREATED,
    booking: booking._id,
    bookingReference: booking.bookingReference,
    actorType: ACTOR_TYPE.USER,
    actor: officer._id,
    actorLabel: officer.email,
    message: `Booking ${booking.bookingReference} created.`,
  });
  bookingCreatedAudit.createdAt = createdAt;
  await bookingCreatedAudit.save();

  return booking;
};

const run = async () => {
  const today = startOfDay(new Date());

  await mongoose.connect(env.mongoUri);
  console.log(`Connected to MongoDB (${mongoose.connection.name}).`);

  await mongoose.connection.dropDatabase();
  console.log('Cleared database.');

  const password = process.env.SEED_PASSWORD || 'ChangeMe123!';
  const superAdminEmail = process.env.SEED_SUPER_ADMIN_EMAIL || 'admin@care.org';
  const officerEmail = process.env.SEED_OFFICER_EMAIL || 'officer@care.org';

  const superAdmin = await User.create({
    email: superAdminEmail,
    password,
    firstName: 'Super',
    lastName: 'Admin',
    role: ROLES.SUPER_ADMIN,
  });
  console.log(`Created Super Admin: ${superAdminEmail}`);

  const officer = await User.create({
    email: officerEmail,
    password,
    firstName: 'Accommodation',
    lastName: 'Officer',
    role: ROLES.ACCOMMODATION_OFFICER,
  });
  console.log(`Created Accommodation Officer: ${officerEmail}`);

  const { campByName, blockCount } = await seedCampsBlocksAndRooms();
  const roomCount = roomInventory.rooms.length;
  console.log(`Imported ${roomCount} rooms across ${campByName.size} camps and ${blockCount} blocks.`);

  await seedRates(campByName, superAdmin);

  const paymentInstructions = {
    mpesaPaybillNumber: '123456',
    bankName: 'Equity Bank',
    bankAccountName: 'CARE Kenya',
    bankAccountNumber: '0123456789',
  };

  await Settings.create({
    facilityName: 'CARE Accommodation Management System',
    supportEmail: 'support@care.org',
    supportPhone: env.support.phone || '+254700000000',
    payment: paymentInstructions,
  });

  const blockByCampAndName = new Map();
  const blocks = await Block.find();
  blocks.forEach((block) => {
    const camp = [...campByName.values()].find((c) => String(c._id) === String(block.camp));
    if (camp) blockByCampAndName.set(`${camp.name}::${block.name}`, block);
  });

  const booking = await seedSampleBooking({
    campByName,
    blockByCampAndName,
    officer,
    superAdmin,
    today,
  });

  console.log('\nSeed complete.');
  console.log(`  Camps:     ${campByName.size}`);
  console.log(`  Blocks:    ${blockCount}`);
  console.log(`  Rooms:     ${roomCount} (from ${path.basename(roomInventory.source)})`);
  console.log(`  Rates:     ${campByName.size * 2} (Short Stay + Long Stay per camp)`);
  console.log(`  Bookings:  ${booking ? `1 (${booking.bookingReference})` : '0'}`);
  console.log(`\nSuper Admin login: ${superAdminEmail} / ${password}`);
  console.log(`Officer login:     ${officerEmail} / ${password}`);

  await mongoose.disconnect();
  process.exit(0);
};

run().catch((error) => {
  console.error(`Seeding failed: ${error.message}`);
  console.error(error);
  process.exit(1);
});
