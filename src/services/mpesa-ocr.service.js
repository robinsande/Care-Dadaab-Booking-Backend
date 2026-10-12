const { createWorker } = require('tesseract.js');
const ApiError = require('../utils/ApiError');

const MINIMUM_OCR_CONFIDENCE = 60;
let workerPromise;

const getWorker = () => {
  if (!workerPromise) workerPromise = createWorker('eng');
  return workerPromise;
};

const readMpesaScreenshot = async (imageBuffer) => {
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
    throw ApiError.badRequest('Choose a valid M-Pesa screenshot to upload.');
  }

  let worker;
  try {
    worker = await getWorker();
  } catch (error) {
    workerPromise = undefined;
    throw error;
  }

  const { data } = await worker.recognize(imageBuffer);
  if (
    !data
    || typeof data.text !== 'string'
    || typeof data.confidence !== 'number'
    || data.confidence < MINIMUM_OCR_CONFIDENCE
    || !data.text.trim()
  ) {
    throw ApiError.badRequest('The screenshot text is unclear. Upload a clearer image or paste the M-Pesa message instead.');
  }
  return { text: data.text, confidence: data.confidence };
};

module.exports = { readMpesaScreenshot };
