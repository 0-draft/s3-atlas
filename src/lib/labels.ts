import type { Competitor, EcoItem, TimelineCategory } from './types';

// Depth ramp tokens, surface → seabed.
export const DEPTH_VARS = ['--d0', '--d1', '--d2', '--d3', '--d4', '--d5', '--d6', '--d6'];

export const TYPE_COLOR: Record<Competitor['type'], string> = {
  hyperscaler: 'var(--series-1)',
  'alt-cloud': 'var(--series-2)',
  'self-hosted': 'var(--series-3)',
  'on-prem': 'var(--series-3)',
};

export const TYPE_LABEL = {
  hyperscaler: { en: 'Hyperscaler', ja: 'ハイパースケーラー' },
  'alt-cloud': { en: 'Alternative cloud', ja: '代替クラウド' },
  'self-hosted': { en: 'Self-hosted', ja: 'セルフホスト' },
  'on-prem': { en: 'On-premises', ja: 'オンプレミス' },
} as const;

export const CATEGORY: Record<TimelineCategory, { en: string; ja: string }> = {
  launch: { en: 'Launches', ja: 'ローンチ' },
  'storage-class': { en: 'Storage classes', ja: 'ストレージクラス' },
  security: { en: 'Security', ja: 'セキュリティ' },
  performance: { en: 'Performance', ja: 'パフォーマンス' },
  data: { en: 'Data features', ja: 'データ機能' },
  ai: { en: 'AI & analytics', ja: 'AI・分析' },
  incident: { en: 'Incidents', ja: '障害' },
  pricing: { en: 'Pricing', ja: '料金' },
};

export const ECO_GROUP: Record<EcoItem['group'], { en: string; ja: string }> = {
  analytics: { en: 'Analytics', ja: '分析' },
  compute: { en: 'Compute', ja: 'コンピュート' },
  ai: { en: 'AI & ML', ja: 'AI・ML' },
  delivery: { en: 'Content delivery', ja: 'コンテンツ配信' },
  network: { en: 'Networking', ja: 'ネットワーク' },
  governance: { en: 'Governance', ja: 'ガバナンス' },
  migration: { en: 'Migration & transfer', ja: '移行・転送' },
  oss: { en: 'Open source & third party', ja: 'OSS・サードパーティ' },
};
