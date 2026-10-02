import type { TimelineEvent } from '../types';
import json from '../../../data/timeline.json';

export const timeline = (json as unknown as TimelineEvent[]).slice().sort((a, b) => a.date.localeCompare(b.date));
