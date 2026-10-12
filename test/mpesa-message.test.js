const test = require('node:test');
const assert = require('node:assert/strict');
const { parseMpesaMessage } = require('../src/utils/mpesa-message');

test('parses transaction code, amount, and phone from a Safaricom confirmation', () => {
  assert.deepEqual(
    parseMpesaMessage('QAB12CD34E Confirmed. Ksh1,250.00 received from 254712345678.'),
    { transactionId: 'QAB12CD34E', amount: 1250, phoneNumber: '254712345678' }
  );
});

test('ignores M-Pesa messages without a confirmed transaction and amount', () => {
  assert.equal(parseMpesaMessage('Payment pending Ksh1,250.00'), null);
  assert.equal(parseMpesaMessage('QAB12CD34E Confirmed but amount is missing'), null);
});

test('parses OCR text with surrounding screenshot labels and line breaks', () => {
  assert.deepEqual(
    parseMpesaMessage('Messages\nSafaricom\nQAB12CD34E\nConfirmed. Ksh 1,250.00 received from 254712345678.'),
    { transactionId: 'QAB12CD34E', amount: 1250, phoneNumber: '254712345678' }
  );
});
