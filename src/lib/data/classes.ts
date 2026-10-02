import type { S3Pricing, StorageClass } from '../types';
import storageClassesJson from '../../../data/storage-classes.json';
import s3PricingJson from '../../../data/s3-pricing.json';

export const storageClasses = storageClassesJson as unknown as StorageClass[];
export const s3Pricing = s3PricingJson as unknown as S3Pricing;

// Storage classes from hottest (surface) to coldest (seabed). Legacy/special classes sink to the end.
const DEPTH: Record<string, number> = {
  EXPRESS_ONEZONE: 0,
  STANDARD: 1,
  INTELLIGENT_TIERING: 2,
  STANDARD_IA: 3,
  ONEZONE_IA: 4,
  GLACIER_IR: 5,
  GLACIER: 6,
  DEEP_ARCHIVE: 7,
};

export function depthRank(id: string): number {
  return DEPTH[id] ?? 99;
}

export const columnClasses = storageClasses
  .filter((c) => depthRank(c.id) < 99 && c.pricePerGBMonth !== null)
  .sort((a, b) => depthRank(a.id) - depthRank(b.id));
