const { Mou, MouPayment } = require('../models');
const ApiError = require('../utils/ApiError');

const INDIVIDUAL_MONTHLY_RATE = 6000;
const EXPIRING_SOON_DAYS = 60;

const normalizeDates = (startDate, endDate) => {
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : new Date(start);
  if (Number.isNaN(start.getTime())) throw ApiError.badRequest('A valid MOU start date is required.');
  if (!endDate) end.setFullYear(start.getFullYear() + 1);
  if (Number.isNaN(end.getTime()) || end <= start) throw ApiError.badRequest('MOU end date must be after the start date.');
  return { start, end };
};

const buildPaymentRows = (mou) => {
  const rows = [];
  const cursor = new Date(mou.startDate);
  const end = new Date(mou.endDate);
  if (mou.paymentFrequency === 'monthly') {
    while (cursor < end) {
      const periodLabel = cursor.toISOString().slice(0, 7);
      rows.push({ mou: mou._id, periodLabel, dueDate: new Date(cursor), amountDue: mou.rateAmount });
      cursor.setMonth(cursor.getMonth() + 1);
    }
  } else {
    rows.push({
      mou: mou._id,
      periodLabel: String(new Date(mou.startDate).getFullYear()),
      dueDate: new Date(mou.startDate),
      amountDue: mou.rateAmount,
    });
  }
  return rows;
};

const refreshStatus = async (mou) => {
  if (['draft', 'terminated', 'renewed'].includes(mou.status)) return mou;
  const now = new Date();
  const soon = new Date(now);
  soon.setDate(soon.getDate() + EXPIRING_SOON_DAYS);
  const status = mou.endDate <= now ? 'expired' : (mou.endDate <= soon ? 'expiring_soon' : 'active');
  if (mou.status !== status) {
    mou.status = status;
    await mou.save();
  }
  return mou;
};

const create = async (payload) => {
  const { start, end } = normalizeDates(payload.startDate, payload.endDate);
  const individual = payload.mouType === 'individual';
  const mou = await Mou.create({
    mouType: payload.mouType,
    partyName: payload.partyName,
    linkedPartnerOrgId: payload.linkedPartnerOrgId || null,
    counterpartyCategory: payload.counterpartyCategory,
    startDate: start,
    endDate: end,
    paymentFrequency: individual ? 'monthly' : 'annual',
    rateAmount: payload.rateAmount ?? (individual ? INDIVIDUAL_MONTHLY_RATE : 0),
    rateCurrency: payload.rateCurrency || 'KES',
    ratePeriod: individual ? 'per_month' : 'per_year',
    status: payload.status || 'draft',
    documentRef: payload.documentRef || '',
    linkedGuests: payload.linkedGuests || [],
  });
  await MouPayment.insertMany(buildPaymentRows(mou));
  return mou;
};

const getActiveById = async (id) => {
  const mou = await Mou.findById(id);
  if (!mou) throw ApiError.notFound('MOU not found.');
  await refreshStatus(mou);
  if (mou.status !== 'active') {
    throw ApiError.badRequest('The selected MOU is not active or has expired.');
  }
  return mou;
};

const list = async (query = {}) => {
  const filter = {};
  if (query.mouType) filter.mouType = query.mouType;
  if (query.status) filter.status = query.status;
  if (query.search) filter.$text = { $search: query.search };
  const mous = await Mou.find(filter).sort({ endDate: 1, partyName: 1 });
  for (const mou of mous) await refreshStatus(mou);
  return mous;
};

const listPayments = (mouId, query = {}) => {
  const filter = { mou: mouId };
  if (query.periodLabel) filter.periodLabel = query.periodLabel;
  if (query.status) filter.status = query.status;
  return MouPayment.find(filter).sort({ dueDate: 1 });
};

const updatePayment = async (id, payload) => {
  const payment = await MouPayment.findById(id);
  if (!payment) throw ApiError.notFound('MOU payment not found.');
  if (payload.amountPaid !== undefined) payment.amountPaid = Number(payload.amountPaid);
  if (payload.paidDate !== undefined) payment.paidDate = payload.paidDate || null;
  if (payload.status !== undefined) payment.status = payload.status;
  await payment.save();
  return payment;
};

module.exports = {
  INDIVIDUAL_MONTHLY_RATE,
  create,
  getActiveById,
  list,
  listPayments,
  updatePayment,
  buildPaymentRows,
};
