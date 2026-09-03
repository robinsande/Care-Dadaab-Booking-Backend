const { query } = require('express-validator');
const { REPORT_TYPE_VALUES, STAY_TYPE_VALUES } = require('../utils/constants');

const reportQueryRules = [
  query('from').optional().isISO8601(),
  query('to').optional().isISO8601(),
  query('campId').optional().isMongoId(),
  query('stayType').optional().isIn(STAY_TYPE_VALUES),
  query('date').optional().isISO8601(),
  query('format').optional().isIn(['json', 'csv', 'xlsx', 'excel', 'pdf']),
];

const reportTypeParam = (req, res, next) => {
  if (!REPORT_TYPE_VALUES.includes(req.params.type)) {
    return res.status(400).json({
      success: false,
      message: `Unknown report type. Valid types: ${REPORT_TYPE_VALUES.join(', ')}`,
      errors: [],
    });
  }
  return next();
};

module.exports = { reportQueryRules, reportTypeParam };
