const mongoose = require('mongoose');
const env = require('./env');
const logger = require('../utils/logger');

const MONGO_OPTIONS = {
  serverSelectionTimeoutMS: 15000,
  socketTimeoutMS: 45000,
  connectTimeoutMS: 20000,
  heartbeatFrequencyMS: 5000,
  family: 4,
  autoIndex: true,
  maxPoolSize: 20,
  minPoolSize: 3,
  maxIdleTimeMS: 60000,
};

const connectDB = async () => {
  mongoose.set('strictQuery', true);

  try {
    const conn = await mongoose.connect(env.mongoUri, MONGO_OPTIONS);
    logger.info(`MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);
  } catch (error) {
    logger.error(`MongoDB connection error: ${error.message}`);
    process.exit(1);
  }

  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected');
  });

  mongoose.connection.on('error', (error) => {
    logger.error(`MongoDB runtime error: ${error.message}`);
  });

  mongoose.connection.on('reconnected', () => {
    logger.info('MongoDB reconnected');
  });
};

module.exports = { connectDB };
