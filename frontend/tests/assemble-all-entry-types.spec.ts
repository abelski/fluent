// Feature #5 — the assemble stage now covers every entry type.
//
// It used to run only for single-word entries (`isSingleWordEntry`), which quietly
// skipped every phrase, every slash/comma multi-form entry, and gave one-syllable
// words a single free click. `buildAssemblyTiles` picks the fragment size instead:
// whole words for a phrase, syllables for a normal word, letters when a word is too
// short to have two syllables.
//
// See documentation/review-flow-stage-graph.md ("Assembly tiles for every entry type").

import { test, expect } from '@playwright/test';
import { buildAssemblyTiles, splitSyllables, parseForms } from '../lib/assembleTiles';
import { mockStudy, stageOf, stageAfter, answerCorrectly, tileMode, tileTexts, type MockWord } from './helpers/studyFlow';

function word(over: Partial<MockWord> & { id: number; lithuanian: string; translation_ru: string }): MockWord {
  return { accented: null, translation_en: 'x', hint: null, status: 'new', mature: false, ...over };
}

// ── The pure module ─────────────────────────────────────────────────────────────

test.describe('buildAssemblyTiles', () => {
  test('a multi-word entry is fragmented into whole words', () => {
    const { target, tiles, separator, mode } = buildAssemblyTiles('senas miestas', 0);
    expect(mode).toBe('word');
    expect(separator).toBe(' ');
    expect(target).toBe('senas miestas');
    expect([...tiles].sort()).toEqual(['miestas', 'senas']);
  });

  test('a normal word is fragmented into syllables', () => {
    const { tiles, separator, mode } = buildAssemblyTiles('mašina', 0);
    expect(mode).toBe('syllable');
    expect(separator).toBe('');
    expect([...tiles].sort()).toEqual([...splitSyllables('mašina')].sort());
    expect(tiles.length).toBeGreaterThan(1);
  });

  test('a one-syllable word falls back to letters instead of one free click', () => {
    const { target, tiles, mode } = buildAssemblyTiles('kas', 0);
    expect(mode).toBe('letter');
    expect(target).toBe('kas');
    expect([...tiles].sort()).toEqual(['a', 'k', 's']);
  });

  test('a slash multi-form entry assembles exactly the form being asked for', () => {
    const entry = 'airis / airė';
    expect(parseForms(entry)).toEqual(['airis', 'airė']);
    expect(buildAssemblyTiles(entry, 0).target).toBe('airis');
    expect(buildAssemblyTiles(entry, 1).target).toBe('airė');
    // ...and it fragments the chosen form, never the raw stored string.
    for (const idx of [0, 1]) {
      const { target, tiles, separator } = buildAssemblyTiles(entry, idx);
      expect(tiles.join('')).not.toContain('/');
      expect(tiles.join('').split('').sort().join('')).toBe(target.split('').sort().join(''));
      expect(separator).toBe('');
    }
  });

  test('a comma multi-form entry behaves the same way', () => {
    expect(buildAssemblyTiles('esu, būnu', 1).target).toBe('būnu');
  });

  test('tiles always spell the target and never drop or invent a fragment', () => {
    for (const entry of ['mašina', 'kas', 'senas miestas', 'airis / airė', 'obuolys', 'namas']) {
      for (const idx of [0, 1]) {
        const { target, tiles, separator } = buildAssemblyTiles(entry, idx);
        const sortedTiles = [...tiles].sort().join('|');
        const rebuilt = tiles.join(separator);
        expect(rebuilt.length).toBe(target.length);
        expect(sortedTiles.length).toBeGreaterThan(0);
        // Some permutation of the tiles spells the target exactly.
        expect(rebuilt.split('').sort().join('')).toBe(target.split('').sort().join(''));
      }
    }
  });

  test('the presented order is shuffled away from the answer when it can be', () => {
    // Not guaranteed for a 1-tile entry, but "mašina" has several syllables.
    let differed = 0;
    for (let i = 0; i < 20; i++) {
      const { tiles, target } = buildAssemblyTiles('mašina', 0);
      if (tiles.join('') !== target) differed++;
    }
    expect(differed).toBeGreaterThan(0);
  });
});

// ── Through the real study UI ───────────────────────────────────────────────────

test.describe('assemble stage in a session', () => {
  test('a multi-word entry now reaches assemble, with whole-word tiles', async ({ page }) => {
    const w = word({ id: 1, lithuanian: 'senas miestas', translation_ru: 'старый город' });
    await mockStudy(page, [w]);
    await page.goto('/dashboard/lists/_/study');

    expect(await stageOf(page)).toBe('card');
    await answerCorrectly(page, 'card', w);
    expect(await stageAfter(page, 'card')).toBe('select');
    await answerCorrectly(page, 'select', w);

    expect(await stageAfter(page, 'select')).toBe('assemble');
    expect(await tileMode(page)).toBe('word');
    expect([...(await tileTexts(page))].sort()).toEqual(['miestas', 'senas']);
  });

  test('a one-syllable entry reaches assemble with letter tiles', async ({ page }) => {
    const w = word({ id: 2, lithuanian: 'kas', translation_ru: 'кто' });
    await mockStudy(page, [w]);
    await page.goto('/dashboard/lists/_/study');

    await answerCorrectly(page, 'card', w);
    await answerCorrectly(page, await stageAfter(page, 'card'), w);

    expect(await stageAfter(page, 'select')).toBe('assemble');
    expect(await tileMode(page)).toBe('letter');
    expect([...(await tileTexts(page))].sort()).toEqual(['a', 'k', 's']);
  });

  test('a normal word still uses syllable tiles', async ({ page }) => {
    const w = word({ id: 3, lithuanian: 'mašina', translation_ru: 'машина' });
    await mockStudy(page, [w]);
    await page.goto('/dashboard/lists/_/study');

    await answerCorrectly(page, 'card', w);
    await answerCorrectly(page, await stageAfter(page, 'card'), w);

    expect(await stageAfter(page, 'select')).toBe('assemble');
    expect(await tileMode(page)).toBe('syllable');
    expect((await tileTexts(page)).join('').length).toBe('mašina'.length);
  });

  test('assembling correctly advances to the typing stage', async ({ page }) => {
    const w = word({ id: 4, lithuanian: 'mašina', translation_ru: 'машина' });
    await mockStudy(page, [w]);
    await page.goto('/dashboard/lists/_/study');

    await answerCorrectly(page, 'card', w);
    await answerCorrectly(page, await stageAfter(page, 'card'), w);
    await stageAfter(page, 'select');
    await answerCorrectly(page, 'assemble', w);

    expect(await stageAfter(page, 'assemble')).toBe('type');
  });
});
