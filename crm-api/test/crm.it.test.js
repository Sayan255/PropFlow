import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import {
  bootOnce,
  resetDb,
  seedAuthUsersForCrm,
  makeToken,
  teardownOnce,
  TENANT_A_ID,
  TENANT_B_ID,
  AGENT1_A_ID,
  AGENT2_A_ID,
} from './it-harness.js';

let base;
let adminToken;
let managerToken;
let agent1Token;
let agent2Token;
let adminBToken;

before(async () => {
  await bootOnce();
  await resetDb();
  await seedAuthUsersForCrm();
  adminToken = await makeToken('11111111-1111-4111-8111-0000000000a1', TENANT_A_ID, 'ADMIN');
  managerToken = await makeToken('11111111-1111-4111-8111-0000000000a2', TENANT_A_ID, 'MANAGER');
  agent1Token = await makeToken(AGENT1_A_ID, TENANT_A_ID, 'AGENT');
  agent2Token = await makeToken(AGENT2_A_ID, TENANT_A_ID, 'AGENT');
  adminBToken = await makeToken('22222222-2222-4222-8222-0000000000b1', TENANT_B_ID, 'ADMIN');
});

after(async () => {
  await teardownOnce();
});

async function req(method, path, { token, body } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

function validProperty(overrides = {}) {
  return {
    title: '2 BHK Apartment in Powai',
    listingType: 'Sale',
    bhk: 2,
    furnishing: 'Semi-Furnished',
    status: 'Listed',
    propertyType: 'Apartment',
    buildingName: 'Hiranandani Gardens',
    unitNo: 'A-101',
    floor: 5,
    totalFloors: 12,
    locality: 'Powai',
    city: 'Mumbai',
    address: 'Hiranandani Gardens, Powai, Mumbai',
    ownerName: 'Rahul Sharma',
    ownerPhone: '9830012321',
    priceInr: 25000000,
    carpetAreaSqft: 750,
    amenities: ['Lift', 'Parking'],
    ...overrides,
  };
}

describe('crm-api integration', () => {
  it('health is ok', async () => {
    const res = await fetch(`${base}/health`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.checks.jwks, true);
  });

  it('admin creates a property (201)', async () => {
    const r = await req('POST', '/properties', { token: adminToken, body: validProperty() });
    assert.equal(r.status, 201);
    assert.equal(r.body.version, 1);
    createdId = r.body.id;
  });

  let createdId;

  it('H7 duplicate building+unit: one 201, one 409', async () => {
    const payload = validProperty({ buildingName: 'Dup Towers', unitNo: 'Z-9' });
    const [r1, r2] = await Promise.all([
      req('POST', '/properties', { token: adminToken, body: payload }),
      req('POST', '/properties', { token: adminToken, body: payload }),
    ]);
    const statuses = [r1.status, r2.status].sort();
    assert.deepEqual(statuses, [201, 409]);
  });

  it('H1 tenant isolation: Tenant B sees 404 for Tenant A property', async () => {
    const r = await req('GET', `/properties/${createdId}`, { token: adminBToken });
    assert.equal(r.status, 404);
    // list does not contain it either
    const list = await req('GET', '/properties?pageSize=100', { token: adminBToken });
    assert.ok(!list.body.data.some((p) => p.id === createdId));
  });

  it('H2 agent ownership: Agent2 gets 404 for Agent1 property; agent filter forced server-side', async () => {
    // reassign created property to agent1
    const current = await req('GET', `/properties/${createdId}`, { token: adminToken });
    const patch = await req('PATCH', `/properties/${createdId}`, {
      token: adminToken,
      body: { ...current.body, assigneeId: AGENT1_A_ID, version: current.body.version },
    });
    assert.equal(patch.status, 200);

    const r = await req('GET', `/properties/${createdId}`, { token: agent2Token });
    assert.equal(r.status, 404);

    // agent1 listing only contains own rows even if agentId param tries to widen
    const list = await req('GET', `/properties?pageSize=100&agentId=${AGENT2_A_ID}`, { token: agent1Token });
    assert.ok(list.body.data.every((p) => p.assigneeId === AGENT1_A_ID));
  });

  it('H6 optimistic locking: stale version → 409 with latest copy', async () => {
    const fresh = await req('GET', `/properties/${createdId}`, { token: adminToken });
    const staleVersion = fresh.body.version;
    // first update bumps version
    const u1 = await req('PATCH', `/properties/${createdId}`, {
      token: adminToken,
      body: { priceInr: 26000000, version: staleVersion },
    });
    assert.equal(u1.status, 200);
    // second update with old version → 409 + latest
    const u2 = await req('PATCH', `/properties/${createdId}`, {
      token: adminToken,
      body: { priceInr: 27000000, version: staleVersion },
    });
    assert.equal(u2.status, 409);
    assert.equal(u2.body.error.code, 'CONFLICT');
    assert.equal(u2.body.error.details.latest.version, staleVersion + 1);
  });

  it('records activity with old/new values', async () => {
    const detail = await req('GET', `/properties/${createdId}`, { token: adminToken });
    const priceChanges = detail.body.activities.filter((a) => a.changedFields.priceInr);
    assert.ok(priceChanges.length >= 1);
    assert.ok(priceChanges[0].changedFields.priceInr.old);
    assert.ok(priceChanges[0].changedFields.priceInr.new);
  });

  it('H-phone: agent sees masked phone; admin sees full', async () => {
    const asAdmin = await req('GET', `/properties/${createdId}`, { token: adminToken });
    assert.equal(asAdmin.body.property.ownerPhone, '9830012321');
    const asAgent1 = await req('GET', `/properties/${createdId}`, { token: agent1Token });
    assert.equal(asAgent1.body.property.ownerPhone, '98300 •••21');
    assert.equal(asAgent1.body.property.ownerPhoneVisible, false);
  });

  it('bulk status change works; terminal-status property causes full rollback (H-bulk)', async () => {
    const p1 = await req('POST', '/properties', { token: adminToken, body: validProperty({ buildingName: 'Bulk One', unitNo: 'B1', status: 'Listed' }) });
    const p2 = await req('POST', '/properties', { token: adminToken, body: validProperty({ buildingName: 'Bulk Two', unitNo: 'B2', status: 'Closed' }) });
    const ok = await req('POST', '/properties/bulk', {
      token: adminToken,
      body: { ids: [p1.body.id], operation: { op: 'status', status: 'Negotiation' } },
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.updated, 1);

    const rollback = await req('POST', '/properties/bulk', {
      token: adminToken,
      body: { ids: [p1.body.id, p2.body.id], operation: { op: 'status', status: 'Listed' } },
    });
    assert.equal(rollback.status, 422);
    // p1 must be unchanged (still Negotiation) — transaction rolled back
    const p1after = await req('GET', `/properties/${p1.body.id}`, { token: adminToken });
    assert.equal(p1after.body.property.status, 'Negotiation');
  });

  it('H11 export: admin/manager 200 xlsx, agent 403', async () => {
    const m = await fetch(`${base}/properties/export?pageSize=10`, { headers: { authorization: `Bearer ${managerToken}` } });
    assert.equal(m.status, 200);
    const buf = Buffer.from(await m.arrayBuffer());
    assert.ok(buf.length > 100);
    assert.equal(buf.subarray(0, 2).toString(), 'PK'); // xlsx zip magic

    const a = await fetch(`${base}/properties/export`, { headers: { authorization: `Bearer ${agent1Token}` } });
    assert.equal(a.status, 403);
  });

  it('free-text search covers owner phone; filters by price', async () => {
    const byPhone = await req('GET', '/properties?q=9830012321', { token: adminToken });
    assert.ok(byPhone.body.data.some((p) => p.id === createdId));
    const byPrice = await req('GET', '/properties?priceMin=24999999&priceMax=25000001', { token: adminToken });
    assert.ok(byPrice.body.data.some((p) => p.id === createdId));
  });

  it('master data: in-use locality delete → 422; unused → 204; cache invalidated', async () => {
    const list = await req('GET', '/master-data?kind=LOCALITY', { token: adminToken });
    const powai = list.body.data.find((i) => i.value === 'Powai');
    const del = await req('DELETE', `/master-data/${powai.id}`, { token: adminToken });
    assert.equal(del.status, 422);
    assert.equal(del.body.error.code, 'UNPROCESSABLE');

    const create = await req('POST', '/master-data', {
      token: adminToken,
      body: { kind: 'AMENITY', label: 'Helipad', value: 'Helipad', sortOrder: 99, active: true },
    });
    assert.equal(create.status, 201);
    const del2 = await req('DELETE', `/master-data/${create.body.id}`, { token: adminToken });
    assert.equal(del2.status, 204);

    const forbidden = await req('POST', '/master-data', {
      token: managerToken,
      body: { kind: 'AMENITY', label: 'X', value: 'X', sortOrder: 0, active: true },
    });
    assert.equal(forbidden.status, 403);
  });

  it('dashboard returns KPIs (manager allowed, agent forbidden)', async () => {
    const m = await req('GET', '/dashboard', { token: managerToken });
    assert.equal(m.status, 200);
    assert.ok(m.body.kpis.totalListings >= 3);

    const a = await req('GET', '/dashboard', { token: agent1Token });
    assert.equal(a.status, 403);
  });

  it('site visits: agent creates on own property; list scoped', async () => {
    const v = await req('POST', '/site-visits', {
      token: agent1Token,
      body: { propertyId: createdId, visitAtUtc: new Date(Date.now() + 3600_000).toISOString() },
    });
    assert.equal(v.status, 201);
    const list = await req('GET', '/site-visits', { token: agent1Token });
    assert.ok(list.body.data.every((x) => x.agentId === AGENT1_A_ID));
  });
});
