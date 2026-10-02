import type { L } from './i18n';

export type ChapterGroup = 'foundations' | 'operate' | 'build' | 'landscape' | 'reference';

export type Chapter = {
  slug: string;
  num: number;
  group: ChapterGroup;
  title: L;
  blurb: L;
};

export const GROUPS: { id: ChapterGroup; label: L }[] = [
  { id: 'foundations', label: { en: 'Foundations', ja: '基礎' } },
  { id: 'operate', label: { en: 'Operate & secure', ja: '運用とセキュリティ' } },
  { id: 'build', label: { en: 'Build with S3', ja: 'S3 で作る' } },
  { id: 'landscape', label: { en: 'Market & landscape', ja: '市場と競合' } },
  { id: 'reference', label: { en: 'Reference', ja: 'リファレンス' } },
];

export const CHAPTERS: Chapter[] = [
  {
    slug: '01-overview',
    num: 1,
    group: 'foundations',
    title: { en: 'What S3 is', ja: 'S3 とは何か' },
    blurb: {
      en: 'Data model, consistency, durability, limits and how the machine underneath works.',
      ja: 'データモデル、整合性、耐久性、制限、そして内部アーキテクチャ。',
    },
  },
  {
    slug: '02-storage-classes',
    num: 2,
    group: 'foundations',
    title: { en: 'Storage classes', ja: 'ストレージクラス' },
    blurb: {
      en: 'Every class from Express One Zone to Deep Archive, and when to use which.',
      ja: 'Express One Zone から Deep Archive まで全クラスと使い分け。',
    },
  },
  {
    slug: '08-pricing',
    num: 3,
    group: 'foundations',
    title: { en: 'Pricing', ja: '料金体系' },
    blurb: {
      en: 'Storage, requests, transfer, retrieval — and the bills nobody expected.',
      ja: 'ストレージ、リクエスト、転送、取り出し、そして想定外の請求。',
    },
  },
  {
    slug: '03-security',
    num: 4,
    group: 'operate',
    title: { en: 'Security', ja: 'セキュリティ' },
    blurb: {
      en: 'Policy evaluation, Block Public Access, encryption, Object Lock and data perimeters.',
      ja: 'ポリシー評価、BPA、暗号化、Object Lock、データペリメーター。',
    },
  },
  {
    slug: '04-data-management',
    num: 5,
    group: 'operate',
    title: { en: 'Data management', ja: 'データ管理' },
    blurb: {
      en: 'Versioning, lifecycle, replication, Batch Operations, events and checksums.',
      ja: 'バージョニング、ライフサイクル、レプリケーション、Batch Operations、イベント。',
    },
  },
  {
    slug: '05-performance',
    num: 6,
    group: 'operate',
    title: { en: 'Performance', ja: 'パフォーマンス' },
    blurb: {
      en: 'Request rates, multipart, CRT clients, Mountpoint and reaching 100 Gbps.',
      ja: 'リクエストレート、マルチパート、CRT、Mountpoint、100 Gbps への道。',
    },
  },
  {
    slug: '12-troubleshooting',
    num: 7,
    group: 'operate',
    title: { en: 'Troubleshooting', ja: 'トラブルシューティング' },
    blurb: {
      en: 'Every error code, a 403 decision tree, and how to read a surprise bill.',
      ja: '全エラーコード、403 の決定木、想定外の請求の読み解き方。',
    },
  },
  {
    slug: '06-new-frontiers',
    num: 8,
    group: 'build',
    title: { en: 'New frontiers', ja: '最前線' },
    blurb: {
      en: 'S3 Tables, S3 Vectors, Metadata, conditional writes — S3 as a data substrate.',
      ja: 'S3 Tables、S3 Vectors、Metadata、条件付き書き込み。',
    },
  },
  {
    slug: '11-architecture-patterns',
    num: 9,
    group: 'build',
    title: { en: 'Architecture patterns', ja: '設計パターン' },
    blurb: {
      en: 'Proven designs, Well-Architected mapping and the anti-patterns to avoid.',
      ja: '定番設計、Well-Architected との対応、避けるべきアンチパターン。',
    },
  },
  {
    slug: '16-ecosystem',
    num: 10,
    group: 'build',
    title: { en: 'Ecosystem', ja: 'エコシステム' },
    blurb: {
      en: 'Athena, Iceberg, Spark, DuckDB, Lambda, CloudFront — everything that speaks S3.',
      ja: 'Athena、Iceberg、Spark、DuckDB など S3 とつながる全て。',
    },
  },
  {
    slug: '15-case-studies',
    num: 11,
    group: 'build',
    title: { en: 'Case studies', ja: '企業の活用事例' },
    blurb: {
      en: 'How real companies store exabytes, cut costs and sometimes leave.',
      ja: '実企業がどう使い、どう節約し、時に離れたか。',
    },
  },
  {
    slug: '18-hands-on-labs',
    num: 12,
    group: 'build',
    title: { en: 'Hands-on labs', ja: 'ハンズオン' },
    blurb: {
      en: 'Twelve labs you can run on AWS or locally with MinIO and LocalStack.',
      ja: 'AWS またはローカル (MinIO / LocalStack) で動かせる 12 のラボ。',
    },
  },
  {
    slug: '09-competitors',
    num: 13,
    group: 'landscape',
    title: { en: 'Competitors', ja: '競合比較' },
    blurb: {
      en: 'GCS, Azure Blob, R2, B2, Wasabi, MinIO and more — priced and compared.',
      ja: 'GCS、Azure Blob、R2、B2、Wasabi、MinIO などを価格と機能で比較。',
    },
  },
  {
    slug: '10-industry',
    num: 14,
    group: 'landscape',
    title: { en: 'Industry position', ja: '業界での立ち位置' },
    blurb: {
      en: 'Why the S3 API became the standard, market share, outages and outlook.',
      ja: 'S3 API が標準になった理由、市場シェア、障害、今後。',
    },
  },
  {
    slug: '07-cli-cookbook',
    num: 15,
    group: 'reference',
    title: { en: 'CLI cookbook', ja: 'コマンド大全' },
    blurb: {
      en: 'aws s3, s3api, s3control, SDKs, Terraform and third-party tools.',
      ja: 'aws s3 / s3api / s3control、SDK、Terraform、サードパーティツール。',
    },
  },
  {
    slug: '17-api-reference',
    num: 16,
    group: 'reference',
    title: { en: 'API reference', ja: 'API リファレンス' },
    blurb: {
      en: 'SigV4 signing, raw HTTP, and every operation grouped by purpose.',
      ja: 'SigV4 署名、生 HTTP、目的別の全 API オペレーション。',
    },
  },
  {
    slug: '13-glossary',
    num: 17,
    group: 'reference',
    title: { en: 'Glossary', ja: '用語集' },
    blurb: { en: 'More than 120 S3 terms, explained briefly.', ja: '120 以上の S3 用語を簡潔に解説。' },
  },
  {
    slug: '14-faq-and-quiz',
    num: 18,
    group: 'reference',
    title: { en: 'FAQ & misconceptions', ja: 'FAQ とよくある誤解' },
    blurb: {
      en: 'The things people get wrong about S3, corrected.',
      ja: 'S3 についてよくある誤解とその訂正。',
    },
  },
];

export function chapterBySlug(slug: string): Chapter | undefined {
  return CHAPTERS.find((c) => c.slug === slug);
}
