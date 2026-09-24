const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');
const { buildContentDisposition, normalizeReportFormat } = require('../utils/reportExport');
const reportService = require('../services/report.service');

const generateReport = asyncHandler(async (req, res) => {
  const result = await reportService.generateReport(req.params.type, req.query);

  if (normalizeReportFormat(result.format) === 'json') {
    return sendSuccess(res, { message: 'Report generated.', data: result.data });
  }

  res.setHeader('Content-Type', result.contentType || 'application/octet-stream');
  res.setHeader('Content-Disposition', buildContentDisposition(result.filename || `${req.params.type}.${result.format || 'report'}`));
  return res.send(result.data);
});

module.exports = { generateReport };
