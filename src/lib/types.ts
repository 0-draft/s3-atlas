import type { L } from './i18n';

// Display text may be plain (language-neutral) or localized.
export type Txt = string | L<string>;
export type TxtList = string[] | L<string[]>;

export type Tier = 'hot' | 'warm' | 'cold' | 'archive';

export type RetrievalOption = { name: Txt; time: Txt; pricePerGB: number | null };

export type StorageClass = {
  id: string;
  name: Txt;
  tier: Tier;
  pricePerGBMonth: number | null;
  durability: Txt;
  availabilityDesign: Txt;
  availabilitySLA: Txt;
  azs: number | string;
  minDurationDays: number;
  minBillableKB: number | null;
  retrievalFeePerGB: number | null;
  firstByteLatency: Txt;
  retrievalOptions: RetrievalOption[];
  useCases: TxtList;
  notes: Txt;
  putPer1k?: number | null;
  getPer1k?: number | null;
  monitoringPer1kObjects?: number | null;
  // Per-object metadata overhead billed by Glacier Flexible Retrieval and Deep Archive.
  overheadClassKB?: number;
  overheadStandardKB?: number;
};

export type S3Pricing = {
  verifiedDate: string;
  region: string;
  egressTiers: { uptoTB: number | null; pricePerGB: number }[];
  egressFreeGBPerMonth: number;
  notes?: Txt;
};

export type TimelineCategory =
  'launch' | 'storage-class' | 'security' | 'performance' | 'data' | 'ai' | 'incident' | 'pricing';

export type TimelineEvent = {
  date: string;
  title: Txt;
  description: Txt;
  category: TimelineCategory;
  url?: string;
};

export type Command = {
  id: string;
  category: Txt;
  title: Txt;
  command: string;
  description: Txt;
  danger: boolean;
};

export type Compat = 'native' | 'high' | 'partial' | 'none';

export type Competitor = {
  id: string;
  name: string;
  vendor: string;
  type: 'hyperscaler' | 'alt-cloud' | 'self-hosted' | 'on-prem';
  storagePricePerGBMonth: number | null;
  egressPricePerGB: number | null;
  putPer1k: number | null;
  getPer1k: number | null;
  minStorageDays: number | null;
  s3Compatible: Compat;
  strongConsistency: boolean | null;
  features: Record<
    'versioning' | 'objectLock' | 'lifecycle' | 'replication' | 'events' | 'iceberg' | 'vectors' | 'cdn',
    boolean | null
  >;
  strengths: TxtList;
  weaknesses: TxtList;
  bestFor: Txt;
  pricingUrl: string;
  pricingNote?: Txt;
  verifiedDate: string;
};

export type Market = {
  cloudShare: { period: string; aws: number; azure: number; gcp: number; others: number; source: string }[];
  s3Stats: { label: Txt; value: Txt; year: number | string; source: string }[];
  objectStorageMarket: {
    year: number;
    valueUSDBillions: number;
    source: string;
    isForecast: boolean;
    segment?: string;
  }[];
  notes?: Txt;
};

export type CaseStudy = {
  id: string;
  company: string;
  industry: Txt;
  region: 'global' | 'japan' | 'us' | 'eu' | 'asia';
  summary: Txt;
  scale: Txt | null;
  features: string[];
  outcome: Txt;
  year: number;
  kind: 'adopter' | 'built-on-s3' | 'migrated-away';
  url: string;
};

export type EcoItem = {
  id: string;
  name: string;
  group: 'analytics' | 'compute' | 'ai' | 'delivery' | 'network' | 'governance' | 'migration' | 'oss';
  howItUsesS3: Txt;
  url: string;
};

export type ApiOp = {
  name: string;
  service: 's3' | 's3control' | 's3tables' | 's3vectors' | 's3outposts' | 's3files';
  category: string;
  method: string | null;
  description: Txt;
};

export type QuizItem = {
  id: string;
  question: Txt;
  choices: TxtList;
  answer: number;
  explanation: Txt;
  difficulty: 'easy' | 'medium' | 'hard';
  topic: Txt;
};
