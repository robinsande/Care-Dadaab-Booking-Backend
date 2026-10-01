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

const dateParts = (value) => {
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return [date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()];
};

const compareDateParts = (left, right) =>
  left[0] - right[0] || left[1] - right[1] || left[2] - right[2];

const daysInMonth = (year, month) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

/** Count calendar-month billing periods, rounding any partial period up. */
const calculateBillableMonths = (arrivalDate, departureDate) => {
  const arrival = dateParts(arrivalDate);
  const departure = dateParts(departureDate);
  if (!arrival || !departure || compareDateParts(departure, arrival) <= 0) return 0;

  const monthDifference = (departure[0] - arrival[0]) * 12 + departure[1] - arrival[1];
  const targetMonthIndex = arrival[1] + monthDifference;
  const targetYear = arrival[0] + Math.floor(targetMonthIndex / 12);
  const targetMonth = targetMonthIndex % 12;
  const arrivalIsMonthEnd = arrival[2] === daysInMonth(arrival[0], arrival[1]);
  const anniversaryDay = arrivalIsMonthEnd
    ? daysInMonth(targetYear, targetMonth)
    : Math.min(arrival[2], daysInMonth(targetYear, targetMonth));
  const anniversary = [targetYear, targetMonth, anniversaryDay];

  return Math.max(1, monthDifference + (compareDateParts(departure, anniversary) > 0 ? 1 : 0));
};

module.exports = {
  startOfDay,
  endOfDay,
  startOfToday,
  calculateNights,
  calculateBillableMonths,
};
