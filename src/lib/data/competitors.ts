import type { Competitor } from '../types';
import json from '../../../data/competitors.json';

export const competitors = json as unknown as Competitor[];
