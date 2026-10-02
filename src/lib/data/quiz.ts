import type { QuizItem } from '../types';
import json from '../../../data/quiz.json';

export const quiz = json as unknown as QuizItem[];
