/**
 * Single source of truth for enumerations used across CAMS v2.
 * These MUST stay aligned with system-contract.md.
 */

const ROLES = Object.freeze({
  ACCOMMODATION_OFFICER: 'Accommodation Officer',
  SUPER_ADMIN: 'Super Admin',
});

const ROLE_VALUES = Object.freeze(Object.values(ROLES));

const BOOKING_STATUS = Object.freeze({
  BOOKED: 'Booked',
  CHECKED_IN: 'Checked In',
  CHECKED_OUT: 'Checked Out',
  CANCELLED: 'Cancelled',
});

const BOOKING_STATUS_VALUES = Object.freeze(Object.values(BOOKING_STATUS));

/** Statuses that block a room from being assigned to another booking. */
const ACTIVE_BOOKING_STATUSES = Object.freeze([
  BOOKING_STATUS.BOOKED,
  BOOKING_STATUS.CHECKED_IN,
]);

const ROOM_STATUS = Object.freeze({
  AVAILABLE: 'Available',
  OCCUPIED: 'Occupied',
  MAINTENANCE: 'Maintenance',
});

const ROOM_STATUS_VALUES = Object.freeze(Object.values(ROOM_STATUS));

const STAY_TYPE = Object.freeze({
  SHORT_STAY: 'Short Stay',
  LONG_STAY: 'Long Stay',
});

const STAY_TYPE_VALUES = Object.freeze(Object.values(STAY_TYPE));

const INVOICE_PAYMENT_STATUS = Object.freeze({
  UNPAID: 'Unpaid',
  PAID: 'Paid',
  WAIVED: 'Waived',
});

const INVOICE_PAYMENT_STATUS_VALUES = Object.freeze(Object.values(INVOICE_PAYMENT_STATUS));

const GENDER = Object.freeze({
  MALE: 'Male',
  FEMALE: 'Female',
  OTHER: 'Other',
  PREFER_NOT_TO_SAY: 'Prefer not to say',
});

const GENDER_VALUES = Object.freeze(Object.values(GENDER));

const AUDIT_ACTIONS = Object.freeze({
  BOOKING_CREATED: 'Booking Created',
  BOOKING_UPDATED: 'Booking Updated',
  BOOKING_CANCELLED: 'Booking Cancelled',
  BOOKING_DELETED: 'Booking Deleted',
  CHECKED_IN: 'Checked In',
  CHECKED_OUT: 'Checked Out',
  INVOICE_GENERATED: 'Invoice Generated',
  INVOICE_UPDATED: 'Invoice Updated',
  EMAIL_SENT: 'Email Sent',
  CAMP_CREATED: 'Camp Created',
  CAMP_UPDATED: 'Camp Updated',
  CAMP_DELETED: 'Camp Deleted',
  BLOCK_CREATED: 'Block Created',
  BLOCK_UPDATED: 'Block Updated',
  BLOCK_DELETED: 'Block Deleted',
  ROOM_CREATED: 'Room Created',
  ROOM_UPDATED: 'Room Updated',
  ROOM_DELETED: 'Room Deleted',
  RATE_CREATED: 'Rate Created',
  RATE_UPDATED: 'Rate Updated',
  USER_CREATED: 'User Created',
  USER_UPDATED: 'User Updated',
  USER_DELETED: 'User Deleted',
  USER_LOGIN: 'User Login',
  SETTINGS_UPDATED: 'Settings Updated',
});

const ACTOR_TYPE = Object.freeze({
  USER: 'user',
  SYSTEM: 'system',
});

const REPORT_TYPES = Object.freeze({
  BOOKINGS_BY_CAMP: 'bookings-by-camp',
  BOOKINGS_BY_DATE: 'bookings-by-date',
  STAY_TYPE_BREAKDOWN: 'stay-type-breakdown',
  ROOM_UTILIZATION: 'room-utilization',
  OCCUPANCY: 'occupancy',
  REVENUE: 'revenue',
  OUTSTANDING_INVOICES: 'outstanding-invoices',
  ARRIVALS: 'arrivals',
  DEPARTURES: 'departures',
});

const REPORT_TYPE_VALUES = Object.freeze(Object.values(REPORT_TYPES));

module.exports = {
  ROLES,
  ROLE_VALUES,
  BOOKING_STATUS,
  BOOKING_STATUS_VALUES,
  ACTIVE_BOOKING_STATUSES,
  ROOM_STATUS,
  ROOM_STATUS_VALUES,
  STAY_TYPE,
  STAY_TYPE_VALUES,
  INVOICE_PAYMENT_STATUS,
  INVOICE_PAYMENT_STATUS_VALUES,
  GENDER,
  GENDER_VALUES,
  AUDIT_ACTIONS,
  ACTOR_TYPE,
  REPORT_TYPES,
  REPORT_TYPE_VALUES,
};
