import type { Competitor, S3Pricing, StorageClass } from './types';

export type Workload = {
  storageGB: number;
  puts: number; // per month
  gets: number; // per month
  egressGB: number; // internet egress per month
  retrievalGB: number; // data read back from IA/Glacier classes per month
  avgObjectKB: number;
};

// Tiered internet egress for S3 (AWS-wide free allowance applied first).
export function s3EgressCost(gb: number, p: S3Pricing): number {
  let rest = Math.max(0, gb - (p.egressFreeGBPerMonth ?? 0));
  let cost = 0;
  let prevTB = 0;
  for (const tier of p.egressTiers) {
    const capGB = tier.uptoTB == null ? Infinity : (tier.uptoTB - prevTB) * 1024;
    const used = Math.min(rest, capGB);
    cost += used * tier.pricePerGB;
    rest -= used;
    prevTB = tier.uptoTB ?? prevTB;
    if (rest <= 0) break;
  }
  return cost;
}

export type CostBreakdown = {
  storage: number;
  requests: number;
  retrieval: number;
  egress: number;
  total: number;
};

export function s3ClassCost(
  c: StorageClass,
  w: Workload,
  p: S3Pricing,
  standardPricePerGB = 0.023,
): CostBreakdown {
  // Objects smaller than the minimum billable size are charged as that size.
  const minKB = c.minBillableKB ?? 0;
  const factor = minKB > 0 && w.avgObjectKB > 0 && w.avgObjectKB < minKB ? minKB / w.avgObjectKB : 1;
  const objects = w.avgObjectKB > 0 ? (w.storageGB * 1024 * 1024) / w.avgObjectKB : 0;
  const overheadGB = (kb = 0) => (objects * kb) / 1024 / 1024;
  const storage =
    w.storageGB * factor * (c.pricePerGBMonth ?? 0) +
    overheadGB(c.overheadClassKB) * (c.pricePerGBMonth ?? 0) +
    overheadGB(c.overheadStandardKB) * standardPricePerGB;
  // Intelligent-Tiering does not monitor (or charge for) objects under 128 KB.
  const monitoring =
    c.monitoringPer1kObjects && w.avgObjectKB >= 128 ? (objects / 1000) * c.monitoringPer1kObjects : 0;
  const requests = (w.puts / 1000) * (c.putPer1k ?? 0) + (w.gets / 1000) * (c.getPer1k ?? 0) + monitoring;
  const retrieval = w.retrievalGB * (c.retrievalFeePerGB ?? 0);
  const egress = s3EgressCost(w.egressGB, p);
  return { storage, requests, retrieval, egress, total: storage + requests + retrieval + egress };
}

export function competitorCost(c: Competitor, w: Workload): CostBreakdown | null {
  if (c.storagePricePerGBMonth == null) return null;
  const storage = w.storageGB * c.storagePricePerGBMonth;
  const requests = (w.puts / 1000) * (c.putPer1k ?? 0) + (w.gets / 1000) * (c.getPer1k ?? 0);
  const egress = w.egressGB * (c.egressPricePerGB ?? 0);
  return { storage, requests, retrieval: 0, egress, total: storage + requests + egress };
}
