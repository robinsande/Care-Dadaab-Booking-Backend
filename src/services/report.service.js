const { Booking, Room, Invoice, Camp } = require('../models');
const ApiError = require('../utils/ApiError');
const XLSX = require('xlsx');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const {
  REPORT_TYPES,
  REPORT_TYPE_VALUES,
  ACTIVE_BOOKING_STATUSES,
  INVOICE_PAYMENT_STATUS,
  BOOKING_STATUS,
  ROOM_STATUS,
} = require('../utils/constants');
const { startOfDay, endOfDay } = require('../utils/dates');
const dashboardService = require('./dashboard.service');

const buildDateFilter = (query, field = 'arrivalDate') => {
  const filter = {};
  if (query.from || query.to) {
    filter[field] = {};
    if (query.from) filter[field].$gte = startOfDay(query.from);
    if (query.to) filter[field].$lte = endOfDay(query.to);
  }
  return filter;
};

const buildCommonFilters = (query) => {
  const filter = { ...buildDateFilter(query) };
  if (query.campId) filter.camp = query.campId;
  if (query.stayType) filter.stayType = query.stayType;
  return filter;
};

const reportBookingsByCamp = async (query) => {
  const match = buildCommonFilters(query);
  const rows = await Booking.aggregate([
    { $match: match },
    { $group: { _id: '$campName', count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  return {
    title: 'Bookings by Camp',
    rows: rows.map((r) => ({ camp: r._id, bookings: r.count })),
  };
};

const reportBookingsByDate = async (query) => {
  const match = buildCommonFilters(query);
  const rows = await Booking.aggregate([
    { $match: match },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$arrivalDate' } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  return {
    title: 'Bookings by Date',
    rows: rows.map((r) => ({ date: r._id, bookings: r.count })),
  };
};

const reportStayTypeBreakdown = async (query) => {
  const match = buildCommonFilters(query);
  const rows = await Booking.aggregate([
    { $match: match },
    { $group: { _id: '$stayType', count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  return {
    title: 'Short Stay vs Long Stay',
    rows: rows.map((r) => ({ stayType: r._id, bookings: r.count })),
  };
};

const reportRoomUtilization = async (query) => {
  const campFilter = query.campId ? { camp: query.campId, isActive: true } : { isActive: true };
  const rooms = await Room.find(campFilter)
    .select('blockName roomNumber camp')
    .populate('camp', 'name');
  const camps = await Camp.find(query.campId ? { _id: query.campId } : { isActive: true });

  const bookingFilter = {
    status: { $in: ACTIVE_BOOKING_STATUSES },
    ...buildDateFilter(query),
  };
  if (query.campId) bookingFilter.camp = query.campId;

  const activeBookings = await Booking.find(bookingFilter).select('room');

  const bookedRoomIds = new Set(activeBookings.map((b) => String(b.room)));

  const rows = rooms.map((room) => ({
    camp: room.camp?.name || camps.find((c) => String(c._id) === String(room.camp))?.name || '',
    block: room.blockName,
    roomNumber: room.roomNumber,
    utilized: bookedRoomIds.has(String(room._id)),
  }));

  const utilized = rows.filter((r) => r.utilized).length;

  return {
    title: 'Room Utilization',
    summary: { totalRooms: rows.length, utilizedRooms: utilized },
    rows,
  };
};

const reportOccupancy = async (query) => {
  const date = query.date ? new Date(query.date) : new Date();
  const occupied = await dashboardService.getOccupiedRoomCount(date);

  const roomFilter = { isActive: true };
  if (query.campId) roomFilter.camp = query.campId;

  const totalRooms = await Room.countDocuments({
    ...roomFilter,
    status: { $nin: [ROOM_STATUS.MAINTENANCE, ROOM_STATUS.OCCUPIED] },
  });

  return {
    title: 'Occupancy',
    date: startOfDay(date).toISOString().split('T')[0],
    occupiedRooms: occupied,
    totalRooms,
    occupancyRate: totalRooms > 0 ? Math.round((occupied / totalRooms) * 10000) / 100 : 0,
  };
};

const reportRevenue = async (query) => {
  const filter = { ...buildDateFilter(query, 'generatedAt') };
  if (query.campId) {
    const camp = await Camp.findById(query.campId);
    if (camp) filter.campName = camp.name;
  }
  if (query.stayType) filter.stayType = query.stayType;

  const rows = await Invoice.aggregate([
    { $match: filter },
    {
      $group: {
        _id: '$campName',
        totalRevenue: { $sum: '$totalAmount' },
        invoiceCount: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const grandTotal = rows.reduce((sum, r) => sum + r.totalRevenue, 0);

  return {
    title: 'Revenue',
    grandTotal,
    rows: rows.map((r) => ({
      camp: r._id,
      totalRevenue: r.totalRevenue,
      invoiceCount: r.invoiceCount,
    })),
  };
};

const reportOutstandingInvoices = async (query) => {
  const filter = { paymentStatus: INVOICE_PAYMENT_STATUS.UNPAID };
  if (query.campId) {
    const camp = await Camp.findById(query.campId);
    if (camp) filter.campName = camp.name;
  }
  Object.assign(filter, buildDateFilter(query, 'generatedAt'));

  const invoices = await Invoice.find(filter)
    .sort({ generatedAt: -1 })
    .select('invoiceNumber bookingReference guest campName totalAmount generatedAt paymentStatus');

  return {
    title: 'Outstanding Invoices',
    count: invoices.length,
    rows: invoices,
  };
};

const reportArrivals = async (query) => {
  const filter = {
    status: { $in: [BOOKING_STATUS.BOOKED, BOOKING_STATUS.CHECKED_IN] },
    ...buildDateFilter(query, 'arrivalDate'),
  };
  if (query.campId) filter.camp = query.campId;
  if (query.stayType) filter.stayType = query.stayType;

  const bookings = await Booking.find(filter)
    .sort({ arrivalDate: 1 })
    .select(
      'bookingReference guest campName blockName roomNumber arrivalDate departureDate status stayType'
    );

  return { title: 'Arrivals', count: bookings.length, rows: bookings };
};

const reportDepartures = async (query) => {
  const filter = {
    status: { $in: [BOOKING_STATUS.BOOKED, BOOKING_STATUS.CHECKED_IN] },
    ...buildDateFilter(query, 'departureDate'),
  };
  if (query.campId) filter.camp = query.campId;
  if (query.stayType) filter.stayType = query.stayType;

  const bookings = await Booking.find(filter)
    .sort({ departureDate: 1 })
    .select(
      'bookingReference guest campName blockName roomNumber arrivalDate departureDate status stayType'
    );

  return { title: 'Departures', count: bookings.length, rows: bookings };
};

const generators = {
  [REPORT_TYPES.BOOKINGS_BY_CAMP]: reportBookingsByCamp,
  [REPORT_TYPES.BOOKINGS_BY_DATE]: reportBookingsByDate,
  [REPORT_TYPES.STAY_TYPE_BREAKDOWN]: reportStayTypeBreakdown,
  [REPORT_TYPES.ROOM_UTILIZATION]: reportRoomUtilization,
  [REPORT_TYPES.OCCUPANCY]: reportOccupancy,
  [REPORT_TYPES.REVENUE]: reportRevenue,
  [REPORT_TYPES.OUTSTANDING_INVOICES]: reportOutstandingInvoices,
  [REPORT_TYPES.ARRIVALS]: reportArrivals,
  [REPORT_TYPES.DEPARTURES]: reportDepartures,
};

const flattenRowsToCsv = (report) => {
  if (!report.rows || report.rows.length === 0) return 'No data\n';

  const firstRow = report.rows[0];
  if (typeof firstRow === 'object' && !Array.isArray(firstRow)) {
    const headers = Object.keys(
      typeof firstRow.toJSON === 'function' ? firstRow.toJSON() : firstRow
    );
    const lines = [headers.join(',')];
    report.rows.forEach((row) => {
      const data = typeof row.toJSON === 'function' ? row.toJSON() : row;
      lines.push(
        headers
          .map((h) => {
            let val = data[h];
            if (val && typeof val === 'object') val = JSON.stringify(val);
            val = val == null ? '' : String(val);
            return `"${val.replace(/"/g, '""')}"`;
          })
          .join(',')
      );
    });
    return lines.join('\n');
  }

  return JSON.stringify(report.rows, null, 2);
};

const normalizeReportRows = (report) => {
  if (!report.rows || report.rows.length === 0) return [];

  const firstRow = report.rows[0];
  if (typeof firstRow !== 'object' || Array.isArray(firstRow)) {
    return report.rows;
  }

  return report.rows.map((row) =>
    typeof row.toJSON === 'function' ? row.toJSON() : row
  );
};

const displayHeader = (header) =>
  String(header)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/^./, (character) => character.toUpperCase());

const displayValue = (value) => {
  if (value && typeof value === 'object') return JSON.stringify(value);
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  return value == null ? '' : String(value);
};

const flattenRowsToXlsxBuffer = async (report) => {
  const rows = normalizeReportRows(report);
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Report');
  const logoPath = path.resolve(__dirname, '../../assets/care-logo.png');

  worksheet.mergeCells('A1:F1');
  worksheet.getCell('A1').value = 'CARE Accommodation Management System';
  worksheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
  worksheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF54206F' } };
  worksheet.getCell('A1').alignment = { vertical: 'middle' };
  worksheet.getRow(1).height = 28;

  worksheet.mergeCells('A2:F2');
  worksheet.getCell('A2').value = report.title || 'Report';
  worksheet.getCell('A2').font = { bold: true, size: 13, color: { argb: 'FFE8721E' } };
  worksheet.getCell('A3').value = 'Generated';
  worksheet.getCell('B3').value = new Date().toLocaleString('en-GB');

  if (fs.existsSync(logoPath)) {
    const imageId = workbook.addImage({ filename: logoPath, extension: 'png' });
    worksheet.addImage(imageId, { tl: { col: 6.4, row: 0.2 }, ext: { width: 110, height: 42 } });
  }

  if (!rows.length) {
    worksheet.getCell('A5').value = 'No data';
  } else {
    const headers = Object.keys(rows[0]);
    worksheet.getRow(5).values = headers;
    worksheet.getRow(5).values = headers.map(displayHeader);
    worksheet.getRow(5).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB42318' } };
    worksheet.getRow(5).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    worksheet.getRow(5).height = 28;
    worksheet.getRow(5).eachCell((cell) => {
      cell.border = { top: { style: 'thin', color: { argb: 'FF7F1D1D' } }, bottom: { style: 'thin', color: { argb: 'FF7F1D1D' } }, left: { style: 'thin', color: { argb: 'FFD1D5DB' } }, right: { style: 'thin', color: { argb: 'FFD1D5DB' } } };
    });
    rows.forEach((row) => {
      worksheet.addRow(headers.map((header) => {
        return displayValue(row[header]);
      }));
    });
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber < 6) return;
      row.alignment = { vertical: 'middle', wrapText: true };
      row.eachCell((cell) => {
        cell.border = { top: { style: 'thin', color: { argb: 'FFD1D5DB' } }, bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } }, left: { style: 'thin', color: { argb: 'FFD1D5DB' } }, right: { style: 'thin', color: { argb: 'FFD1D5DB' } } };
      });
    });
    worksheet.columns.forEach((column) => {
      let width = 12;
      column.eachCell({ includeEmpty: true }, (cell) => {
        width = Math.min(Math.max(width, String(cell.value ?? '').length + 2), 36);
      });
      column.width = width;
    });
    worksheet.autoFilter = { from: 'A5', to: `${String.fromCharCode(64 + headers.length)}${rows.length + 5}` };
  }

  return workbook.xlsx.writeBuffer();
};

const flattenRowsToPdfBuffer = (report) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const logoPath = path.resolve(__dirname, '../../assets/care-logo.png');
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 40, 32, { width: 110, height: 48 });
    }
    doc.fillColor('#54206F').fontSize(18).text('CARE Accommodation Management System', 165, 42);
    doc.fillColor('#E8721E').fontSize(14).text(report.title || 'Report', 40, 100);
    doc.fillColor('#1f2933');
    doc.moveDown(2);

    const rows = normalizeReportRows(report);
    if (rows.length === 0) {
      doc.fontSize(12).text('No data');
      doc.end();
      return;
    }

    const headers = Object.keys(rows[0]);
    const tableTop = 128;
    const tableLeft = 40;
    const tableWidth = 515;
    const columnWidth = tableWidth / headers.length;
    const headerHeight = 28;
    const rowHeight = 28;

    const drawCell = (x, y, width, height, fill, text, color = '#1f2933', bold = false) => {
      doc.rect(x, y, width, height).fillAndStroke(fill, '#d1d5db');
      doc.fillColor(color).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7).text(text, x + 4, y + 7, {
        width: width - 8,
        height: height - 8,
        align: 'center',
        ellipsis: true,
      });
    };

    headers.forEach((header, index) => {
      drawCell(tableLeft + index * columnWidth, tableTop, columnWidth, headerHeight, '#b42318', displayHeader(header), '#ffffff', true);
    });

    let currentY = tableTop + headerHeight;
    rows.forEach((row, rowIndex) => {
      if (currentY + rowHeight > doc.page.height - 45) {
        doc.addPage();
        doc.fillColor('#54206F').fontSize(14).font('Helvetica-Bold').text(`${report.title || 'Report'} (continued)`, 40, 40);
        headers.forEach((header, index) => {
          drawCell(tableLeft + index * columnWidth, 75, columnWidth, headerHeight, '#b42318', displayHeader(header), '#ffffff', true);
        });
        currentY = 75 + headerHeight;
      }
      headers.forEach((header, index) => {
        drawCell(tableLeft + index * columnWidth, currentY, columnWidth, rowHeight, rowIndex % 2 ? '#fff7ed' : '#ffffff', displayValue(row[header]));
      });
      currentY += rowHeight;
    });

    doc.fillColor('#1f2933');

    doc.end();
  });

const generateReport = async (type, query = {}) => {
  if (!REPORT_TYPE_VALUES.includes(type)) {
    throw ApiError.badRequest(`Unknown report type. Valid types: ${REPORT_TYPE_VALUES.join(', ')}`);
  }

  const report = await generators[type](query);
  const format = (query.format || 'json').toLowerCase();

  if (format === 'csv') {
    return { format: 'csv', contentType: 'text/csv', filename: `${type}.csv`, data: flattenRowsToCsv(report) };
  }

  if (format === 'xlsx' || format === 'excel') {
    return {
      format: 'xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: `${type}.xlsx`,
      data: await flattenRowsToXlsxBuffer(report),
    };
  }

  if (format === 'pdf') {
    return {
      format: 'pdf',
      contentType: 'application/pdf',
      filename: `${type}.pdf`,
      data: await flattenRowsToPdfBuffer(report),
    };
  }

  return { format: 'json', contentType: 'application/json', data: report };
};

module.exports = { generateReport, REPORT_TYPE_VALUES };
