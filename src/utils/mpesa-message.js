const parseMpesaMessage = (message) => {
  const text = String(message || '').trim();
  const transactionId = text.match(/^\s*([A-Z0-9]{8,12})\s+Confirmed\b/i)?.[1]?.toUpperCase();
  const amountText = text.match(/\bKsh\.?\s*([\d,]+(?:\.\d{1,2})?)\b/i)?.[1];

  if (!transactionId || !amountText) return null;
  const amount = Number(amountText.replace(/,/g, ''));
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const phoneNumber = text.match(/(?:\+?254|0)\d{9}\b/)?.[0];
  return { transactionId, amount, phoneNumber };
};

module.exports = { parseMpesaMessage };
