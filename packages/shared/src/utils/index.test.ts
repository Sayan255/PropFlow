import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatINR, maskPhone, slugify, pricePerSqftRupees, istToUtc } from './index.ts';

describe('shared utils', () => {
  it('formats Indian currency', () => {
    assert.equal(formatINR(1_500_000 * 100), '₹15 Lakh'); // ₹15 Lakh in paisa
    assert.equal(formatINR(12_000_000 * 100), '₹1.2 Crore');
    assert.equal(formatINR(8_000 * 100), '₹8,000');
  });

  it('masks phones like 98300 •••21', () => {
    assert.equal(maskPhone('9830012321'), '98300 •••21');
    assert.equal(maskPhone(null), '');
  });

  it('slugifies company names', () => {
    assert.equal(slugify('Sharma Realty & Associates!'), 'sharma-realty-associates');
  });

  it('computes price per sqft', () => {
    assert.equal(pricePerSqftRupees(8_000_000_00, 1000), 8000);
    assert.equal(pricePerSqftRupees(100, 0), 0);
  });

  it('converts 10:00 IST to 04:30 UTC', () => {
    const utc = istToUtc('2026-03-15T10:00');
    assert.equal(utc.toISOString().slice(0, 16), '2026-03-15T04:30');
  });
});
