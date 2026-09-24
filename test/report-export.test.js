const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeReportFormat, buildContentDisposition } = require('../src/utils/reportExport');

test('normalizeReportFormat converts Excel aliases to xlsx and keeps PDF lowercase', () => {
  assert.equal(normalizeReportFormat('excel'), 'xlsx');
  assert.equal(normalizeReportFormat('Excel'), 'xlsx');
  assert.equal(normalizeReportFormat('PDF'), 'pdf');
  assert.equal(normalizeReportFormat('csv'), 'csv');
  assert.equal(normalizeReportFormat(undefined), 'json');
});

test('buildContentDisposition includes UTF-8 encoded filename for downloads', () => {
  const header = buildContentDisposition('Quarterly report.pdf');

  assert.match(header, /filename="Quarterly report\.pdf"/);
  assert.match(header, /filename\*=UTF-8''Quarterly%20report\.pdf/);
});
