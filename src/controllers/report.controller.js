const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');
const reportService = require('../services/report.service');

const generateReport = asyncHandler(async (req, res) => {
  const result = await reportService.generateReport(req.params.type, req.query);

  if (result.format === 'json') {
    return sendSuccess(res, { message: 'Report generated.', data: result.data });
  }

  res.setHeader('Content-Type', result.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
  return res.send(result.data);
});

module.exports = { generateReport };
