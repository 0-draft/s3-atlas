import { describe, expect, it } from 'vitest';
import * as data from '../lib/data';
import { UI } from '../lib/ui';
import { CHAPTERS, GROUPS } from '../lib/chapters';

type Issue = string;

// Walk any value; every {en, ja} pair must have both sides filled with the same shape.
function checkLocalized(value: unknown, path: string, issues: Issue[]) {
  if (Array.isArray(value)) {
    value.forEach((v, i) => checkLocalized(v, `${path}[${i}]`, issues));
    return;
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if ('en' in obj || 'ja' in obj) {
      const { en, ja } = obj;
      if (typeof en === 'string' || typeof ja === 'string') {
        if (typeof en !== 'string' || !en.trim()) issues.push(`${path}.en is empty`);
        if (typeof ja !== 'string' || !ja.trim()) issues.push(`${path}.ja is empty`);
      } else if (Array.isArray(en) || Array.isArray(ja)) {
        if (!Array.isArray(en) || !Array.isArray(ja)) issues.push(`${path} en/ja arrays mismatch`);
        else if (en.length !== ja.length)
          issues.push(`${path} en has ${en.length} items, ja has ${ja.length}`);
      } else {
        issues.push(`${path} has en/ja with unexpected types`);
      }
      return;
    }
    for (const [k, v] of Object.entries(obj)) checkLocalized(v, `${path}.${k}`, issues);
  }
}

const datasets: Record<string, unknown> = {
  storageClasses: data.storageClasses,
  timeline: data.timeline,
  commands: data.commands,
  competitors: data.competitors,
  market: data.market,
  cases: data.cases,
  ecosystem: data.ecosystem,
  apiOps: data.apiOps,
  quiz: data.quiz,
  s3Pricing: data.s3Pricing,
  UI,
  CHAPTERS,
  GROUPS,
};

describe('localization', () => {
  for (const [name, value] of Object.entries(datasets)) {
    it(`${name} has complete en/ja text`, () => {
      const issues: Issue[] = [];
      checkLocalized(value, name, issues);
      expect(issues).toEqual([]);
    });
  }
});

function uniq(ids: string[]) {
  return ids.filter((id, i) => ids.indexOf(id) !== i);
}

describe('dataset integrity', () => {
  it('ids are unique', () => {
    expect(uniq(data.storageClasses.map((c) => c.id))).toEqual([]);
    expect(uniq(data.commands.map((c) => c.id))).toEqual([]);
    expect(uniq(data.competitors.map((c) => c.id))).toEqual([]);
    expect(uniq(data.cases.map((c) => c.id))).toEqual([]);
    expect(uniq(data.ecosystem.map((c) => c.id))).toEqual([]);
    expect(uniq(data.quiz.map((c) => c.id))).toEqual([]);
    expect(uniq(data.apiOps.map((o) => `${o.service}:${o.name}`))).toEqual([]);
  });

  it('storage classes have sane prices', () => {
    expect(data.storageClasses.length).toBeGreaterThanOrEqual(8);
    // Outposts is capacity-priced, so its per-GB price is null.
    for (const c of data.storageClasses.filter((x) => x.pricePerGBMonth !== null)) {
      expect(c.pricePerGBMonth, c.id).toBeGreaterThan(0);
      expect(c.pricePerGBMonth, c.id).toBeLessThan(1);
    }
    for (const c of data.columnClasses) expect(c.pricePerGBMonth, c.id).not.toBeNull();
    expect(data.columnClasses.length).toBeGreaterThanOrEqual(7);
  });

  it('timeline dates parse and categories are known', () => {
    const cats = ['launch', 'storage-class', 'security', 'performance', 'data', 'ai', 'incident', 'pricing'];
    for (const e of data.timeline) {
      expect(e.date, JSON.stringify(e.title)).toMatch(/^\d{4}-\d{2}(-\d{2})?$/);
      expect(cats).toContain(e.category);
    }
    expect(data.timeline[0].date.startsWith('2006')).toBe(true);
  });

  it('quiz answers point at a real choice', () => {
    expect(data.quiz.length).toBeGreaterThanOrEqual(30);
    for (const q of data.quiz) {
      const choices = q.choices as { en: string[]; ja: string[] };
      expect(choices.en).toHaveLength(4);
      expect(choices.ja).toHaveLength(4);
      expect(q.answer).toBeGreaterThanOrEqual(0);
      expect(q.answer).toBeLessThan(4);
    }
  });

  it('commands are non-empty', () => {
    expect(data.commands.length).toBeGreaterThanOrEqual(60);
    for (const c of data.commands) expect(c.command.trim().length, c.id).toBeGreaterThan(0);
  });

  it('competitors list S3 first and features are booleans or null', () => {
    expect(data.competitors[0].vendor.toLowerCase()).toContain('amazon');
    for (const c of data.competitors) {
      for (const v of Object.values(c.features)) expect([true, false, null]).toContain(v);
    }
  });

  it('market shares add up to roughly 100%', () => {
    for (const r of data.market.cloudShare) {
      const sum = r.aws + r.azure + r.gcp + r.others;
      expect(sum, r.period).toBeGreaterThan(97);
      expect(sum, r.period).toBeLessThan(103);
    }
  });

  it('every external link is https', () => {
    const urls = [
      ...data.timeline.map((e) => e.url).filter(Boolean),
      ...data.cases.map((c) => c.url),
      ...data.ecosystem.map((e) => e.url),
      ...data.competitors.map((c) => c.pricingUrl),
    ] as string[];
    for (const u of urls) expect(u).toMatch(/^https:\/\//);
  });
});
