'use client';

import { useCallback, useState } from 'react';
import type { TakPose } from '../components/Tak';

// TAK's mood is per study/practice session: it starts neutral, climbs one step on
// every correct answer and drops one step on every wrong one. Nothing is persisted —
// leaving a session (or reloading) puts him back at neutral.
export const MOOD_MIN = -3;
export const MOOD_MAX = 3;
export const MOOD_NEUTRAL = 0;

const POSE_BY_MOOD: Record<number, TakPose> = {
  3: 'hype',
  2: 'galaxy',
  1: 'grin',
  0: 'talking',
  [-1]: 'sus',
  [-2]: 'fine',
  [-3]: 'lost',
};

// Lithuanian, matching the untranslated bubble phrases already in use
// ("Kartokime!", "Prisimeni?", "Pabandyk!"). At neutral the page keeps its own phrase.
const PHRASE_BY_MOOD: Record<number, string | null> = {
  3: 'Nerealu!',
  2: 'Puiku!',
  1: 'Šaunu!',
  0: null,
  [-1]: 'Hmm…',
  [-2]: 'Nieko tokio',
  [-3]: 'Bandom dar kartą',
};

function clampMood(mood: number): number {
  return Math.max(MOOD_MIN, Math.min(MOOD_MAX, mood));
}

export function moodPose(mood: number): TakPose {
  return POSE_BY_MOOD[clampMood(Math.round(mood))];
}

export function moodPhrase(mood: number, fallback: string): string {
  return PHRASE_BY_MOOD[clampMood(Math.round(mood))] ?? fallback;
}

export function useMascotMood() {
  const [mood, setMood] = useState(MOOD_NEUTRAL);

  const recordAnswer = useCallback((correct: boolean) => {
    setMood((m) => clampMood(m + (correct ? 1 : -1)));
  }, []);

  const reset = useCallback(() => setMood(MOOD_NEUTRAL), []);

  return { mood, recordAnswer, reset };
}
