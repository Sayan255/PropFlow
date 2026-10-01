import { Op } from 'sequelize';
import { Property, PropertyNote, ChatMessage, SiteVisit } from '../models.js';
import { seedDefaultMasterData } from './seed-master-data.js';
import { logger } from '../logger.js';

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';
const AGENTS = {
  [TENANT_A]: ['11111111-1111-4111-8111-0000000000a3', '11111111-1111-4111-8111-0000000000a4'],
  [TENANT_B]: ['22222222-2222-4222-8222-0000000000b3', '22222222-2222-4222-8222-0000000000b4'],
};

const FIRST = ['Rahul', 'Priya', 'Amit', 'Sneha', 'Vikram', 'Anjali', 'Rohan', 'Kavita', 'Sanjay', 'Pooja', 'Arjun', 'Neha', 'Karan', 'Divya', 'Rajesh', 'Meera'];
const LAST = ['Sharma', 'Patel', 'Gupta', 'Singh', 'Kumar', 'Das', 'Mehta', 'Joshi', 'Reddy', 'Nair', 'Iyer', 'Chopra'];
const BUILDINGS_A = ['Prestige Shantiniketan', 'Lodha Splendora', 'Hiranandani Gardens', 'Oberoi Sky City', 'Rustomjee Seasons', 'Kalpataru Radiance', 'L&T Raintree Boulevard', 'Godrej Platinum', 'Runwal Anthurium', 'Omkar 1973'];
const CITIES = { WEST: 'Mumbai', SOUTH: 'Bengaluru', NORTH: 'Gurugram' };

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick(arr) {
  return arr[rand(0, arr.length - 1)];
}
function weightedStatus() {
  const r = Math.random();
  if (r < 0.18) return 'Draft';
  if (r < 0.45) return 'Listed';
  if (r < 0.62) return 'SiteVisit';
  if (r < 0.78) return 'Negotiation';
  if (r < 0.9) return 'Closed';
  return 'Withdrawn';
}
function makePhone() {
  return `9${rand(100000000, 999999999)}`; // starts with 9, 10 digits
}

function buildProperty(tenantId, index, cityZone) {
  const city = CITIES[cityZone];
  const localitiesByCity = {
    Mumbai: ['Bandra West', 'Andheri East', 'Powai', 'Worli', 'Lower Parel', 'Juhu', 'Khar West', 'Malad West', 'Goregaon East', 'Chembur'],
    Bengaluru: ['Whitefield', 'Koramangala', 'Indiranagar', 'HSR Layout', 'Jayanagar'],
    Gurugram: ['Sector 62 Noida', 'Golf Course Road', 'DLF Phase 3', 'Sushant Lok', 'Sohna Road'],
  };
  const locality = pick(localitiesByCity[city]);
  const propertyType = pick(['Apartment', 'Apartment', 'Apartment', 'Villa', 'Plot', 'Commercial']);
  const isRent = Math.random() < 0.35;
  const listingType = isRent ? 'Rent' : 'Sale';
  const bhk = propertyType === 'Plot' || propertyType === 'Commercial' ? 0 : pick([1, 2, 2, 3, 3, 4, 5]);
  const carpetAreaSqft =
    propertyType === 'Plot'
      ? rand(600, 5000)
      : propertyType === 'Commercial'
        ? rand(300, 8000)
        : { 0: 300, 1: 400, 2: 750, 3: 1100, 4: 1600, 5: 2400 }[bhk];
  let priceInr;
  if (isRent) priceInr = rand(10_000, 200_000);
  else if (propertyType === 'Plot') priceInr = rand(1_500_000, 50_000_000);
  else priceInr = carpetAreaSqft * rand(6500, 18000);
  priceInr = Math.min(priceInr, isRent ? 200_000 : 50_000_000);

  const createdAt = new Date(Date.now() - rand(0, 365) * 24 * 3600 * 1000);
  const updatedAt = new Date(createdAt.getTime() + rand(0, Math.max(1, Date.now() - createdAt.getTime())));

  return {
    tenantId,
    title: `${bhk > 0 ? `${bhk} BHK ` : ''}${propertyType} in ${locality}`,
    listingType,
    bhk,
    furnishing: pick(['Unfurnished', 'Semi-Furnished', 'Furnished']),
    status: weightedStatus(),
    propertyType,
    buildingName: `${pick(BUILDINGS_A)} ${String.fromCharCode(65 + (index % 26))}`,
    unitNo: `${rand(1, 40)}0${rand(1, 9)}`,
    floor: rand(0, 24),
    totalFloors: rand(4, 40),
    locality,
    city,
    address: `${rand(1, 500)}, ${locality}, ${city}`,
    ownerName: `${pick(FIRST)} ${pick(LAST)}`,
    ownerPhone: makePhone(),
    priceInr,
    carpetAreaSqft,
    amenities: ['Lift', 'Parking', 'Security'].slice(0, rand(1, 3)),
    assigneeId: pick(AGENTS[tenantId]),
    version: rand(1, 4),
    isStale: false,
    createdAt,
    updatedAt,
  };
}

export async function seedCrm() {
  const withDemo = process.argv.includes('--with-demo');
  const countA = Number(process.env.SEED_PROPERTIES_PER_TENANT ?? 10482);

  await seedDefaultMasterData();

  const existing = await Property.count({ where: { tenantId: TENANT_A } });
  if (existing >= countA) {
    logger.info({ existing }, 'crm seed already present; skipping property generation');
    return;
  }

  logger.info({ countA }, 'seeding properties (batched)…');
  const cityZones = ['WEST', 'SOUTH', 'NORTH'];
  const batchSize = 500;
  let created = 0;
  for (let batch = 0; created < countA; batch++) {
    const rows = [];
    for (let i = 0; i < batchSize && created + i < countA; i++) {
      rows.push(buildProperty(TENANT_A, created + i, cityZones[(created + i) % 3]));
    }
    try {
      await Property.bulkCreate(rows, { ignoreDuplicates: true });
    } catch (err) {
      if (err.name === 'SequelizeUniqueConstraintError') {
        for (const row of rows) {
          await Property.bulkCreate([row], { ignoreDuplicates: true });
        }
      } else {
        throw err;
      }
    }
    created += rows.length;
    if ((batch + 1) % 6 === 0) logger.info({ created }, 'seed progress');
  }

  // Tenant B: smaller set (80)
  const existingB = await Property.count({ where: { tenantId: TENANT_B } });
  if (existingB < 80) {
    const rowsB = [];
    for (let i = 0; i < 80; i++) rowsB.push(buildProperty(TENANT_B, i, 'SOUTH'));
    await Property.bulkCreate(rowsB, { ignoreDuplicates: true });
  }

  await seedInteractions();

  if (withDemo) await seedDemoEditTargets();
  logger.info('crm seed complete');
}

async function seedInteractions() {
  // Visits, notes and chats on ≥50 properties
  const props = await Property.findAll({
    where: { tenantId: TENANT_A, deletedAt: null },
    attributes: ['id', 'assigneeId'],
    order: [['id', 'ASC']],
    limit: 60,
  });
  const now = Date.now();
  for (const [i, p] of props.entries()) {
    const agentId = p.assigneeId ?? AGENTS[TENANT_A][0];
    // Site visits: past, upcoming (incl. one ~10 min ahead for reminder demo), overdue
    await SiteVisit.bulkCreate([
      { propertyId: p.id, tenantId: TENANT_A, agentId, visitAtUtc: new Date(now - rand(1, 20) * 24 * 3600 * 1000), outcome: 'Completed' },
      { propertyId: p.id, tenantId: TENANT_A, agentId, visitAtUtc: new Date(now + (i === 0 ? 10 : rand(2, 240)) * 60_000), outcome: 'Scheduled' },
      { propertyId: p.id, tenantId: TENANT_A, agentId, visitAtUtc: new Date(now - rand(1, 5) * 24 * 3600 * 1000), outcome: 'Scheduled' },
    ]);
    await PropertyNote.bulkCreate([
      { propertyId: p.id, tenantId: TENANT_A, userId: agentId, body: pick([
        'Owner flexible on price after 2nd visit.',
        'Society charges one-time membership ₹25,000.',
        'Tenant leaving next month — vacant possession assured.',
        'Loan approved by HDFC for buyer lead.',
        'RWA NOC pending; follow up next week.',
      ]) },
    ]);
    await ChatMessage.bulkCreate([
      { propertyId: p.id, tenantId: TENANT_A, userId: agentId, clientMsgId: `seed-${p.id}-1`, body: 'Site visit confirmed for this week.' },
      { propertyId: p.id, tenantId: TENANT_A, userId: '11111111-1111-4111-8111-0000000000a2', clientMsgId: `seed-${p.id}-2`, body: 'Share pics with the buyer lead please.' },
    ], { ignoreDuplicates: true });
  }
}

async function seedDemoEditTargets() {
  // Two known properties for the two-tab optimistic-conflict demo
  const demo = await Property.findAll({ where: { tenantId: TENANT_A, title: { [Op.like]: '2 BHK Apartment in Powai%' } }, limit: 2 });
  for (const p of demo) {
    await PropertyNote.create({
      propertyId: p.id,
      tenantId: TENANT_A,
      userId: '11111111-1111-4111-8111-0000000000a1',
      body: 'Demo property for optimistic-lock conflict testing (open in two tabs).',
    });
  }
}

const isDirect = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isDirect) {
  seedCrm()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error({ err }, 'crm seed failed');
      process.exit(1);
    });
}
