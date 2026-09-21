const { performance } = require('node:perf_hooks');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const env = require('../src/config/env');

const runTimed = async (label, fn, iterations = 25) => {
  const times = [];
  for (let i = 0; i < iterations; i += 1) {
    const start = performance.now();
    await fn();
    times.push(performance.now() - start);
  }
  return {
    label,
    iterations,
    averageMs: Number((times.reduce((sum, value) => sum + value, 0) / times.length).toFixed(2)),
    minMs: Number(Math.min(...times).toFixed(2)),
    maxMs: Number(Math.max(...times).toFixed(2)),
  };
};

(async () => {
  const password = 'StrongPassword123!';
  const hashRound = 10;

  const hashMetric = await runTimed('bcryptHash', async () => {
    await bcrypt.hash(password, hashRound);
  });

  const hash = await bcrypt.hash(password, hashRound);
  const compareMetric = await runTimed('bcryptCompare', async () => {
    await bcrypt.compare(password, hash);
  });

  const jwtToken = jwt.sign({ sub: 'user_123', role: 'Accommodation Officer' }, env.jwtSecret || 'benchmark-secret', { expiresIn: '1d' });
  const signMetric = await runTimed('jwtSign', async () => {
    jwt.sign({ sub: 'user_123', role: 'Accommodation Officer' }, env.jwtSecret || 'benchmark-secret', { expiresIn: '1d' });
  });

  const verifyMetric = await runTimed('jwtVerify', async () => {
    jwt.verify(jwtToken, env.jwtSecret || 'benchmark-secret');
  });

  let mongoMetric = null;
  try {
    const start = performance.now();
    await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 12000, family: 4 });
    const pingResult = await mongoose.connection.db.command({ ping: 1 });
    const elapsed = performance.now() - start;
    await mongoose.disconnect();
    mongoMetric = {
      label: 'mongoPing',
      averageMs: Number(elapsed.toFixed(2)),
      minMs: Number(elapsed.toFixed(2)),
      maxMs: Number(elapsed.toFixed(2)),
      ok: pingResult?.ok === 1,
    };
  } catch (error) {
    mongoMetric = {
      label: 'mongoPing',
      averageMs: null,
      minMs: null,
      maxMs: null,
      ok: false,
      error: error.message,
    };
  }

  const result = {
    jwtSecretLength: (env.jwtSecret || 'benchmark-secret').length,
    bcryptRounds: hashRound,
    timings: [hashMetric, compareMetric, signMetric, verifyMetric, mongoMetric].filter(Boolean),
  };

  console.log(JSON.stringify(result, null, 2));
})();
