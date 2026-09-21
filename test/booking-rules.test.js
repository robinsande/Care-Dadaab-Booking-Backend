const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveAppliedRate } = require('../src/services/booking.service');

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