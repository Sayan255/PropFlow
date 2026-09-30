import ExcelJS from 'exceljs';
import { maskPhone, propertyQuerySchema } from '@propflow/shared';
import config from '../config.js';
import { sequelize, Property } from '../models.js';
import { buildPropertyWhere, SORT_COLUMNS } from '../util/async-handler.js';

const HEADERS = [
  { header: 'ID', key: 'id', width: 18 },
  { header: 'Title', key: 'title', width: 32 },
  { header: 'Type', key: 'propertyType', width: 12 },
  { header: 'Sale/Rent', key: 'listingType', width: 10 },
  { header: 'BHK', key: 'bhk', width: 6 },
  { header: 'Status', key: 'status', width: 12 },
  { header: 'Building', key: 'buildingName', width: 24 },
  { header: 'Unit', key: 'unitNo', width: 10 },
  { header: 'Locality', key: 'locality', width: 20 },
  { header: 'City', key: 'city', width: 16 },
  { header: 'Price (INR)', key: 'priceInr', width: 16 },
  { header: 'Carpet Sqft', key: 'carpetAreaSqft', width: 12 },
  { header: 'Owner', key: 'ownerName', width: 20 },
  { header: 'Owner Phone', key: 'ownerPhone', width: 18 },
  { header: 'Assignee', key: 'assigneeId', width: 38 },
  { header: 'Created At (UTC)', key: 'createdAt', width: 24 },
];

/** Streams the CURRENT filtered view as XLSX; batched reads keep memory flat. */
export async function streamPropertiesExport(req, res) {
  const query = propertyQuerySchema.parse(req.query);
  const where = buildPropertyWhere(query, req.user.tid, {
    forceAssigneeId: req.user.role === 'AGENT' ? req.user.sub : null,
  });
  const sortCol = SORT_COLUMNS[query.sortBy] ?? 'updated_at';

  const total = await Property.count({ where });
  if (total > config.exportMaxRows) {
    res.status(413).json({
      error: { code: 'EXPORT_TOO_LARGE', message: `Refine filters; export is capped at ${config.exportMaxRows} rows`, details: {} },
    });
    return;
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="propflow-export-${Date.now()}.xlsx"`);
  res.setHeader('Transfer-Encoding', 'chunked');

  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res, useStyles: false });
  const sheet = workbook.addWorksheet('Properties');
  sheet.columns = HEADERS;

  const batchSize = config.exportBatchSize;
  let offset = 0;
  let exported = 0;

  // Batching: ordered keyset-ish pagination via offset on the indexed sort column.
  while (offset < total) {
    const rows = await Property.findAll({
      where,
      attributes: [
        'id', 'title', 'propertyType', 'listingType', 'bhk', 'status',
        'buildingName', 'unitNo', 'locality', 'city', 'priceInr', 'carpetAreaSqft',
        'ownerName', 'ownerPhone', 'assigneeId', 'createdAt',
      ],
      limit: batchSize,
      offset,
      // Mirror the list endpoint's ordering so the export matches the on-screen view.
      order: [[sequelize.literal(`\`Property\`.${sortCol}`), query.sortDir.toUpperCase()]],
      raw: true,
    });
    if (rows.length === 0) break;
    for (const r of rows) {
      sheet
        .addRow({
          id: String(r.id),
          title: r.title,
          propertyType: r.propertyType,
          listingType: r.listingType,
          bhk: r.bhk,
          status: r.status,
          buildingName: r.buildingName,
          unitNo: r.unitNo,
          locality: r.locality,
          city: r.city,
          priceInr: String(r.priceInr),
          carpetAreaSqft: r.carpetAreaSqft,
          ownerName: r.ownerName,
          ownerPhone: req.user.role === 'ADMIN' || req.user.role === 'MANAGER' ? r.ownerPhone : maskPhone(r.ownerPhone),
          assigneeId: r.assigneeId,
          createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : '',
        })
        .commit();
    }
    exported += rows.length;
    offset += batchSize;
  }

  sheet.commit();
  await workbook.commit();
  req.log?.info({ exported, total }, 'export complete');
}
