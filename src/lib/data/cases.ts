import type { CaseStudy } from '../types';
import json from '../../../data/cases.json';

export const cases = json as unknown as CaseStudy[];
