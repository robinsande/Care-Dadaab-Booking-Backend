const normalizeReportFormat = (format = 'json') => {
  const value = String(format || 'json').trim().toLowerCase();

  if (value === 'excel' || value === 'xlsx') return 'xlsx';
  if (value === 'pdf') return 'pdf';
  if (value === 'csv') return 'csv';

  return value || 'json';
};

const buildContentDisposition = (filename = 'report') => {
  const safeName = String(filename || 'report').replace(/[\r\n"]/g, '').trim() || 'report';
  const fallbackName = safeName.replace(/[^\x20-\x7E]/g, '').slice(0, 80) || 'report';
  const encoded = encodeURIComponent(safeName);

  return `attachment; filename="${fallbackName}"; filename*=UTF-8''${encoded}`;
};

module.exports = {
  normalizeReportFormat,
  buildContentDisposition,
};
