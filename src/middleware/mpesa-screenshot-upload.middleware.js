const multer = require('multer');
const ApiError = require('../utils/ApiError');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!['image/jpeg', 'image/png'].includes(file.mimetype)) {
      callback(ApiError.badRequest('Upload an M-Pesa screenshot as a JPEG or PNG image.'));
      return;
    }
    callback(null, true);
  },
}).single('screenshot');

const hasSupportedImageSignature = (buffer) =>
  buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  || (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff);

const uploadMpesaScreenshot = (req, res, next) => {
  upload(req, res, (error) => {
    if (error) {
      if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
        return next(new ApiError(413, 'M-Pesa screenshots must be 5 MB or smaller.'));
      }
      if (error instanceof multer.MulterError) {
        return next(ApiError.badRequest('Upload one JPEG or PNG M-Pesa screenshot.'));
      }
      return next(error);
    }

    if (!req.file) {
      return next(ApiError.badRequest('Choose an M-Pesa screenshot to upload.'));
    }
    if (!hasSupportedImageSignature(req.file.buffer)) {
      return next(ApiError.badRequest('The uploaded file is not a valid JPEG or PNG image.'));
    }
    return next();
  });
};

module.exports = { uploadMpesaScreenshot };
