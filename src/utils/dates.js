/**
 * Date helpers shared across booking, invoice and report services.
 */

const startOfDay = (date = new Date()) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const endOfDay = (date = new Date()) => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

const startOfToday = () => startOfDay(new Date());

/**
 * Number of nights between arrival and departure (hotel-style).
 * @param {Date|string} arrivalDate
 * @param {Date|string} departureDate
 * @returns {number}
 */
const calculateNights = (arrivalDate, departureDate) => {
  const arrival = startOfDay(arrivalDate);
  const departure = startOfDay(departureDate);
  const diffMs = departure.getTime() - arrival.getTime();
  return Math.max(Math.round(diffMs / (1000 * 60 * 60 * 24)), 0);
};

module.exports = {
  startOfDay,
  endOfDay,
  startOfToday,
  calculateNights,
};
