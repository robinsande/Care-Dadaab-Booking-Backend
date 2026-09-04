const app = require('./app');
const env = require('./config/env');
const { connectDB } = require('./config/db');
const logger = require('./utils/logger');
const mongoose = require('mongoose');
const { autoCheckOutDueBookings } = require('./services/booking.service');
const { syncAllRoomStatuses } = require('./services/room.service');

/**
 * Application entry point. Connects to MongoDB, then starts the HTTP server.
 * Handles graceful shutdown and unexpected process-level errors.
 */
const start = async () => {
  await connectDB();

  await autoCheckOutDueBookings();
  await syncAllRoomStatuses();
  const checkoutSweep = setInterval(() => {
    autoCheckOutDueBookings()
      .then(() => syncAllRoomStatuses())
      .catch((error) => logger.error(`Automatic checkout failed: ${error.message}`));
  }, 60 * 1000);
  checkoutSweep.unref();

  const server = app.listen(env.port, '0.0.0.0', () => {
    logger.info(`Server running in ${env.nodeEnv} mode on 0.0.0.0:${env.port}`);
    logger.info(`API base path: ${env.apiPrefix}`);
    logger.info(`Local URL:     http://localhost:${env.port}${env.apiPrefix}`);
    logger.info(`IPv4 direct:   http://127.0.0.1:${env.port}${env.apiPrefix}`);
  });

  setTimeout(async () => {
    try {
      const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('syncIndexes timeout (30s)')), 30000));
      await Promise.race([mongoose.connection.syncIndexes(), timeout]);
      logger.info('MongoDB indexes synced for all models.');
    } catch (idxErr) {
      logger.warn(`MongoDB index sync skipped: ${idxErr.message}`);
    }
  }, 2000);

  const shutdown = (signal) => {
    logger.warn(`${signal} received. Shutting down gracefully...`);
    server.close(() => {
      logger.info('HTTP server closed.');
      process.exit(0);
    });
  };

  ['SIGINT', 'SIGTERM'].forEach((signal) => process.on(signal, () => shutdown(signal)));

  process.on('unhandledRejection', (reason) => {
    logger.error(`Unhandled Rejection: ${reason}`);
    server.close(() => process.exit(1));
  });

  process.on('uncaughtException', (error) => {
    logger.error(`Uncaught Exception: ${error.stack || error.message}`);
    process.exit(1);
  });
};

start();
