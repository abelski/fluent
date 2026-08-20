// Tiles for the "assemble it from fragments" study stage ('2a' in QuizSession).
//
// Feature #5: assembly used to be reserved for single-word entries, which quietly
// skipped every phrase, every slash/comma multi-form entry and every one-syllable
// word. It now works for all of them by picking the fragment size that suits the
// entry: whole words for a phrase, syllables for a normal word, letters when a word
// is too short to have two syllables.
//
// Pure module — no React, no DOM — so the scheduling/grading rules can be tested
// directly. `splitSyllables` / `shuffleSyllables` / `parseForms` live here (moved out
// of QuizSession.tsx) so the quiz and the tile builder share one implementation.

export type AssemblyMode = 'word' | 'syllable' | 'letter';

export interface AssemblyTiles {
  /** The exact string the tiles must spell once joined with `separator`. */
  target: string;
  /** Shuffled fragments to present. */
  tiles: string[];
  /** '' for syllable/letter tiles, ' ' for whole-word tiles. */
  separator: string;
  /** Which fragment size was chosen — drives the card's prompt copy. */
  mode: AssemblyMode;
}

/** Split a "vyras / moteris" or "esu, būnu" entry into its individual forms. */
export function parseForms(lithuanian: string): string[] {
  const parts = lithuanian.split(/[,/]/).map((s) => s.trim()).filter(Boolean);
  return parts.length > 1 ? parts : [lithuanian.trim()];
}

const LT_DIPHTHONGS = new Set(['ie', 'uo', 'ai', 'ei', 'ui', 'au', 'ia', 'ua']);

export function splitSyllables(word: string): string[] {
  const isVowel = (c: string) => /[aeiouąęėįųūy]/i.test(c);
  const vowelIdx: number[] = [];
  for (let i = 0; i < word.length; i++) if (isVowel(word[i])) vowelIdx.push(i);
  if (vowelIdx.length <= 1) return [word];

  const splits: number[] = [0];
  let i = 0;
  while (i < vowelIdx.length - 1) {
    const v1 = vowelIdx[i];
    const v2 = vowelIdx[i + 1];
    const gap = v2 - v1 - 1;
    if (gap === 0) {
      const pair = (word[v1] + word[v2]).toLowerCase().replace(/[ąęėįųū]/g, (c) =>
        ({ ą: 'a', ę: 'e', ė: 'e', į: 'i', ų: 'u', ū: 'u' }[c] ?? c));
      if (LT_DIPHTHONGS.has(pair)) { i++; continue; }
      splits.push(v2);
    } else if (gap === 1) {
      splits.push(v1 + 1);
    } else {
      splits.push(v1 + 1 + Math.floor(gap / 2));
    }
    i++;
  }
  splits.push(word.length);
  return splits.slice(0, -1).map((s, idx) => word.slice(s, splits[idx + 1])).filter(Boolean);
}

/**
 * Shuffled tiles for the assembly stage. Reshuffles up to 10x if the order still
 * matches the answer (a single tile just stays as itself).
 */
export function shuffleSyllables(syllables: string[]): string[] {
  const tiles = syllables.slice();
  for (let i = 0; i < 10; i++) {
    tiles.sort(() => Math.random() - 0.5);
    if (tiles.join('') !== syllables.join('') || tiles.length <= 1) break;
  }
  return tiles;
}

/**
 * Build the tiles for one assembly card.
 *
 * `formIndex` is the form the *type* stage will ask for, so a multi-form entry
 * ("airis / airė") assembles exactly the form the learner is about to be asked to
 * write — not the raw stored string.
 *
 * Fragment size, in order:
 *   1. target contains a space  → whole-word tiles (the issue #145 phrase pattern)
 *   2. otherwise                → syllable tiles
 *   3. fewer than 2 tiles       → letter tiles, so a one-syllable word like "kas"
 *                                 is still a real challenge instead of one free click
 */
export function buildAssemblyTiles(lithuanian: string, formIndex: number): AssemblyTiles {
  const forms = parseForms(lithuanian);
  const target = (forms[formIndex] ?? forms[0] ?? lithuanian).trim();

  if (/\s/.test(target)) {
    const words = target.split(/\s+/).filter(Boolean);
    return { target, tiles: shuffleSyllables(words), separator: ' ', mode: 'word' };
  }

  let mode: AssemblyMode = 'syllable';
  let pieces = splitSyllables(target).filter(Boolean);
  if (pieces.length < 2) {
    mode = 'letter';
    pieces = target.split('').filter(Boolean);
  }
  return { target, tiles: shuffleSyllables(pieces), separator: '', mode };
}
