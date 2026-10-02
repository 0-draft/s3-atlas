import type { Market } from '../types';
import json from '../../../data/market.json';

export const market = json as unknown as Market;
