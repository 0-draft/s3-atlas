import { describe, expect, it } from 'vitest';
import { s3ClassCost, s3EgressCost, competitorCost } from '../lib/cost';
import { yearsPerLoss } from '../lib/format';
import type { Competitor, S3Pricing, StorageClass } from '../lib/types';

const pricing: S3Pricing = {
  verifiedDate: '2026-10-03',
  region: 'us-east-1',
  egressFreeGBPerMonth: 100,
  egressTiers: [
    { uptoTB: 10, pricePerGB: 0.09 },
    { uptoTB: 50, pricePerGB: 0.085 },
    { uptoTB: 150, pricePerGB: 0.07 },
    { uptoTB: null, pricePerGB: 0.05 },
  ],
};

const standardIA: StorageClass = {
  id: 'standard-ia',
  name: 'Standard-IA',
  tier: 'warm',
  pricePerGBMonth: 0.0125,
  durability: '11 9s',
  availabilityDesign: '99.9%',
  availabilitySLA: '99%',
  azs: 3,
  minDurationDays: 30,
  minBillableKB: 128,
  retrievalFeePerGB: 0.01,
  firstByteLatency: 'ms',
  retrievalOptions: [],
  useCases: [],
  notes: '',
  putPer1k: 0.01,
  getPer1k: 0.001,
};

describe('cost model', () => {
  it('applies the free allowance before tiers', () => {
    expect(s3EgressCost(100, pricing)).toBe(0);
    expect(s3EgressCost(1100, pricing)).toBeCloseTo(1000 * 0.09);
  });

  it('crosses egress tiers', () => {
    const gb = 100 + 10 * 1024 + 1000;
    expect(s3EgressCost(gb, pricing)).toBeCloseTo(10 * 1024 * 0.09 + 1000 * 0.085);
  });

  it('bills small objects at the minimum billable size', () => {
    const w = { storageGB: 100, puts: 0, gets: 0, egressGB: 0, retrievalGB: 0, avgObjectKB: 64 };
    expect(s3ClassCost(standardIA, w, pricing).storage).toBeCloseTo(100 * 2 * 0.0125);
  });

  it('adds requests and retrieval', () => {
    const w = { storageGB: 0, puts: 10_000, gets: 100_000, egressGB: 0, retrievalGB: 50, avgObjectKB: 1024 };
    const c = s3ClassCost(standardIA, w, pricing);
    expect(c.requests).toBeCloseTo(0.1 + 0.1);
    expect(c.retrieval).toBeCloseTo(0.5);
  });

  it('skips Intelligent-Tiering monitoring for objects under 128 KB', () => {
    const it_ = {
      ...standardIA,
      id: 'INTELLIGENT_TIERING',
      minBillableKB: null,
      monitoringPer1kObjects: 0.0025,
    };
    const small = { storageGB: 1, puts: 0, gets: 0, egressGB: 0, retrievalGB: 0, avgObjectKB: 4 };
    const large = { ...small, avgObjectKB: 1024 };
    expect(s3ClassCost(it_, small, pricing).requests).toBe(0);
    expect(s3ClassCost(it_, large, pricing).requests).toBeCloseTo((1024 / 1000) * 0.0025);
  });

  it('adds Glacier per-object overhead', () => {
    const deep = {
      ...standardIA,
      id: 'DEEP_ARCHIVE',
      pricePerGBMonth: 0.00099,
      minBillableKB: null,
      overheadClassKB: 32,
      overheadStandardKB: 8,
    };
    const w = { storageGB: 1, puts: 0, gets: 0, egressGB: 0, retrievalGB: 0, avgObjectKB: 1024 };
    const objects = 1024;
    const expected =
      1 * 0.00099 + ((objects * 32) / 1024 / 1024) * 0.00099 + ((objects * 8) / 1024 / 1024) * 0.023;
    expect(s3ClassCost(deep, w, pricing, 0.023).storage).toBeCloseTo(expected, 8);
  });

  it('skips competitors without a price', () => {
    const c = { storagePricePerGBMonth: null } as unknown as Competitor;
    expect(
      competitorCost(c, { storageGB: 1, puts: 0, gets: 0, egressGB: 0, retrievalGB: 0, avgObjectKB: 1 }),
    ).toBeNull();
  });

  it('matches the AWS eleven-nines example', () => {
    expect(yearsPerLoss(10_000_000)).toBeCloseTo(10_000);
  });
});
