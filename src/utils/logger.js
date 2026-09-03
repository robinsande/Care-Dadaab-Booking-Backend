/* eslint-disable no-console */

/**
 * Minimal, dependency-free logger with a consistent, timestamped format.
 * Kept intentionally small; swap for winston/pino if richer logging is needed.
 */
const timestamp = () => new Date().toISOString();

const logger = {
  info: (message) => console.log(`[${timestamp()}] [INFO]  ${message}`),
  warn: (message) => console.warn(`[${timestamp()}] [WARN]  ${message}`),
  error: (message) => console.error(`[${timestamp()}] [ERROR] ${message}`),
  debug: (message) => {
    if ((process.env.NODE_ENV || 'development') !== 'production') {
      console.debug(`[${timestamp()}] [DEBUG] ${message}`);
    }
  },
};

module.exports = logger;
