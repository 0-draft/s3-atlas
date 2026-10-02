import type { EcoItem } from '../types';
import json from '../../../data/ecosystem.json';

export const ecosystem = json as unknown as EcoItem[];
