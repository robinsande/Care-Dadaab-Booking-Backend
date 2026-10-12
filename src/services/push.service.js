const webpush = require('web-push');
const { GuestPushSubscription } = require('../models');
const env = require('../config/env');
const logger = require('../utils/logger');

const isConfigured = () => Boolean(env.webPush.publicKey && env.webPush.privateKey);

if (isConfigured()) {
  webpush.setVapidDetails(env.webPush.subject, env.webPush.publicKey, env.webPush.privateKey);
}

const getPublicKey = () => env.webPush.publicKey || null;

const saveGuestSubscription = async (guest, subscription) => {
  if (!isConfigured()) throw new Error('Web push is not configured on the server.');
  const endpoint = String(subscription?.endpoint || '').trim();
  const p256dh = String(subscription?.keys?.p256dh || '').trim();
  const auth = String(subscription?.keys?.auth || '').trim();
  if (!endpoint || !p256dh || !auth) throw new Error('A valid browser push subscription is required.');
  await GuestPushSubscription.findOneAndUpdate(
    { endpoint },
    { $set: { guest: guest._id, email: guest.email, endpoint, keys: { p256dh, auth } } },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );
};

const removeGuestSubscription = async (guest, endpoint) => {
  await GuestPushSubscription.deleteOne({ guest: guest._id, endpoint: String(endpoint || '') });
};

const sendBookingStatus = async (booking, event) => {
  const subscriptions = await GuestPushSubscription.find({
    email: String(booking.guest?.email || '').toLowerCase(),
  });
  if (!subscriptions.length) return { sent: 0, failed: 0 };
  if (!isConfigured()) {
    logger.warn(`Push notification delivery is not configured for ${booking.bookingReference}.`);
    return { sent: 0, failed: subscriptions.length };
  }

  const checkedIn = event === 'checked-in';
  const payload = JSON.stringify({
    title: checkedIn ? 'CARE accommodation check-in' : 'CARE accommodation check-out',
    body: checkedIn
      ? `Booking ${booking.bookingReference} has been checked in.`
      : `Booking ${booking.bookingReference} has been checked out.`,
    url: '/guest/index.html',
  });
  const results = await Promise.all(subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: subscription.keys,
      }, payload);
      return true;
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) {
        await GuestPushSubscription.deleteOne({ _id: subscription._id });
      } else {
        logger.warn(`Guest push delivery failed for ${booking.bookingReference}: ${error.message}`);
      }
      return false;
    }
  }));
  return {
    sent: results.filter(Boolean).length,
    failed: results.filter((sent) => !sent).length,
  };
};

module.exports = { getPublicKey, saveGuestSubscription, removeGuestSubscription, sendBookingStatus };
