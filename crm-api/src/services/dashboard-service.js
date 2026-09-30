import { QueryTypes } from 'sequelize';
import { sequelize } from '../db.js';
import config from '../config.js';
import { cacheGetJson, cacheSetJson } from '../redis.js';

/** Aggregates per tenant + date range; cached 60s in Redis. */
export async function getDashboard(tenantId, from, to) {
  const cacheKey = `dash:${tenantId}:${from ?? 'min'}:${to ?? 'max'}`;
  const cached = await cacheGetJson(cacheKey);
  if (cached) return { ...cached, cached: true };

  const fromDate = from ?? '2000-01-01';
  const toDate = to ?? '2999-12-31';

  const [kpisRows, listingsRows, funnelRows, typeRows, agentRows] = await Promise.all([
    sequelize.query(
      `SELECT
         COUNT(*) AS totalListings,
         SUM(status IN ('Listed','SiteVisit','Negotiation')) AS activeListings,
         SUM(status = 'Closed') AS closedCount,
         COALESCE(SUM(CASE WHEN status = 'Closed' THEN price_inr ELSE 0 END), 0) AS closedValueInr
       FROM properties
       WHERE tenant_id = :tenantId AND deleted_at IS NULL
         AND created_at BETWEEN :from AND :toDate`,
      { replacements: { tenantId, from: `${fromDate} 00:00:00.000`, toDate: `${toDate} 23:59:59.999` }, type: QueryTypes.SELECT },
    ),
    sequelize.query(
      `SELECT DATE(created_at) AS day, COUNT(*) AS count
       FROM properties
       WHERE tenant_id = :tenantId AND deleted_at IS NULL
         AND created_at BETWEEN :from AND :toDate
       GROUP BY day ORDER BY day`,
      { replacements: { tenantId, from: `${fromDate} 00:00:00.000`, toDate: `${toDate} 23:59:59.999` }, type: QueryTypes.SELECT },
    ),
    sequelize.query(
      `SELECT status, COUNT(*) AS count FROM properties
       WHERE tenant_id = :tenantId AND deleted_at IS NULL
         AND created_at BETWEEN :from AND :toDate
       GROUP BY status`,
      { replacements: { tenantId, from: `${fromDate} 00:00:00.000`, toDate: `${toDate} 23:59:59.999` }, type: QueryTypes.SELECT },
    ),
    sequelize.query(
      `SELECT property_type AS type, COUNT(*) AS count FROM properties
       WHERE tenant_id = :tenantId AND deleted_at IS NULL
         AND created_at BETWEEN :from AND :toDate
       GROUP BY property_type`,
      { replacements: { tenantId, from: `${fromDate} 00:00:00.000`, toDate: `${toDate} 23:59:59.999` }, type: QueryTypes.SELECT },
    ),
    sequelize.query(
      `SELECT p.assignee_id AS agentId, COUNT(*) AS closedCount,
              COALESCE(SUM(p.price_inr), 0) AS closedValueInr
       FROM properties p
       WHERE p.tenant_id = :tenantId AND p.deleted_at IS NULL AND p.status = 'Closed' AND p.assignee_id IS NOT NULL
         AND p.updated_at BETWEEN :from AND :toDate
       GROUP BY p.assignee_id ORDER BY closedValueInr DESC LIMIT 5`,
      { replacements: { tenantId, from: `${fromDate} 00:00:00.000`, toDate: `${toDate} 23:59:59.999` }, type: QueryTypes.SELECT },
    ),
  ]);

  const payload = {
    kpis: {
      totalListings: Number(kpisRows[0]?.totalListings ?? 0),
      activeListings: Number(kpisRows[0]?.activeListings ?? 0),
      siteVisits: 0,
      closedCount: Number(kpisRows[0]?.closedCount ?? 0),
      closedValueInr: String(kpisRows[0]?.closedValueInr ?? '0'),
    },
    listingsOverTime: listingsRows.map((r) => ({ day: r.day, count: Number(r.count) })),
    funnel: funnelRows.map((r) => ({ status: r.status, count: Number(r.count) })),
    propertyTypeSplit: typeRows.map((r) => ({ type: r.type, count: Number(r.count) })),
    agentLeaderboard: agentRows.map((r) => ({
      agentId: r.agentId,
      closedCount: Number(r.closedCount),
      closedValueInr: String(r.closedValueInr),
    })),
    generatedAt: new Date().toISOString(),
    cached: false,
  };

  // Site visits KPI
  const visits = await sequelize.query(
    `SELECT COUNT(*) AS c FROM site_visits WHERE tenant_id = :tenantId AND visit_at_utc BETWEEN :from AND :toDate`,
    { replacements: { tenantId, from: `${fromDate} 00:00:00.000`, toDate: `${toDate} 23:59:59.999` }, type: QueryTypes.SELECT },
  );
  payload.kpis.siteVisits = Number(visits[0]?.c ?? 0);

  await cacheSetJson(cacheKey, payload, config.dashboardCacheTtlSeconds);
  return payload;
}
