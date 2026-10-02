import type { ApiOp } from '../types';
import json from '../../../data/api.json';

export const apiOps = json as unknown as ApiOp[];
