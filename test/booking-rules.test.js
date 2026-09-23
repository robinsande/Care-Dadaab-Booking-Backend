const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveAppliedRate } = require('../src/services/booking.service');
const { buildPaymentRows, INDIVIDUAL_MONTHLY_RATE } = require('../src/services/mou.service');

const overlaps = (arrival, departure, existingArrival, existingDeparture) =>
  new Date(arrival) < new Date(existingDeparture)
  && new Date(departure) > new Date(existingArrival);

test('adjacent stays do not overlap', () => {
  assert.equal(overlaps('2026-09-10', '2026-09-12', '2026-09-12', '2026-09-15'), false);
});

test('same-room overlapping stays are rejected by interval rules', () => {
  assert.equal(overlaps('2026-09-10', '2026-09-13', '2026-09-12', '2026-09-15'), true);
});

test('one-night stays are valid intervals', () => {
  assert.equal(overlaps('2026-09-10', '2026-09-11', '2026-09-11', '2026-09-12'), false);
  assert.ok(new Date('2026-09-11') > new Date('2026-09-10'));
});

test('month and year boundary dates compare chronologically', () => {
  assert.ok(new Date('2027-01-01') > new Date('2026-12-31'));
  assert.equal(overlaps('2026-12-31', '2027-01-02', '2027-01-01', '2027-01-03'), true);
});

test('booking updates keep the existing rate when the stay type has not changed', async () => {
  const existingRate = {
    rateId: 'rate-123',
    amount: 2500,
    currency: 'KES',
    stayType: 'Short Stay',
  };

  const nextRate = await resolveAppliedRate({
    campId: 'camp-1',
    stayType: 'Short Stay',
    fallbackRate: existingRate,
    rateId: undefined,
  });

  assert.deepEqual(nextRate, existingRate);
});

test('individual MOU payment schedules generate twelve monthly payments', () => {
  const rows = buildPaymentRows({
    _id: 'mou-1',
    startDate: new Date('2026-10-01'),
    endDate: new Date('2027-10-01'),
    paymentFrequency: 'monthly',
    rateAmount: INDIVIDUAL_MONTHLY_RATE,
  });

  assert.equal(rows.length, 12);
  assert.equal(rows[0].periodLabel, '2026-10');
  assert.equal(rows[11].periodLabel, '2027-09');
  assert.equal(rows.every((row) => row.amountDue === 6000), true);
});

test('short stay boundary is 21 nights', () => {
  const nights = (arrival, departure) => Math.ceil((new Date(departure) - new Date(arrival)) / 86400000);
  assert.equal(nights('2026-10-01', '2026-10-22'), 21);
  assert.equal(nights('2026-10-01', '2026-10-23') > 21, true);
});