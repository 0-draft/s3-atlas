import type { Command } from '../types';
import json from '../../../data/commands.json';

export const commands = json as unknown as Command[];
