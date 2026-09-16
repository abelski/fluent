// Feature #30 — number keys pick an option on every quiz surface that shows a list
// of buttons: the stage-1 self-evaluation card (1 = «С трудом», 2 = «Легко») and the
// multiple-choice stages (1–4 = the options, top to bottom).
//
// See frontend/lib/useNumberKeys.ts.

import { test, expect } from '@playwright/test';
import {
  mockStudy, stageOf, stageAfter, stripBadge, MOCK_SETTINGS, type MockWord,
} from './helpers/studyFlow';

const WORD: MockWord = {
  id: 1, lithuanian: 'mašina', accented: null,
  translation_ru: 'машина', translation_en: 'car', hint: null,
  status: 'known', mature: false,
};

const DISTRACTOR: MockWord = {
  id: 2, lithuanian: 'namas', accented: null,
  translation_ru: 'дом', translation_en: 'house', hint: null,
  status: 'new', mature: false,
};

test.describe('number keys pick an option', () => {
  test('«2» on the flashcard is «Легко» — same path as clicking it', async ({ page }) => {
    await mockStudy(page, [WORD], { distractors: [DISTRACTOR], settings: MOCK_SETTINGS });
    await page.goto('/dashboard/lists/_/study');

    expect(await stageOf(page)).toBe('card');
    await page.keyboard.press('2');
    // «Легко» goes straight to typing; «С трудом» would go to the difficult chain.
    expect(await stageAfter(page, 'card')).toBe('type');
  });

  test('the option’s own number answers the multiple choice', async ({ page }) => {
    await mockStudy(page, [WORD], { distractors: [DISTRACTOR], settings: MOCK_SETTINGS });
    await page.goto('/dashboard/lists/_/study');

    // «С трудом» demotes the word to the difficult chain, which starts with SELECT.
    expect(await stageOf(page)).toBe('card');
    await page.keyboard.press('1');
    expect(await stageAfter(page, 'card')).toBe('select');

    // Options are shuffled, and SELECT is a coin flip between the two directions
    // (pick the translation / pick the Lithuanian), so match either side of the
    // word rather than reading the prompt — reading it races with the re-render.
    // The prompt paints one tick before the options state is filled in, so the
    // buttons briefly do not exist — reading them without waiting yields [].
    const buttons = page.locator('.grid button');
    await expect(buttons).toHaveCount(2);
    const texts = (await buttons.allTextContents()).map(stripBadge);
    const index = texts.findIndex((t) => t === WORD.translation_ru || t === WORD.lithuanian);
    expect(index).toBeGreaterThanOrEqual(0);

    await page.keyboard.press(String(index + 1));
    await expect(page.getByText('Правильно!')).toBeVisible();
  });

  test('every option shows its number', async ({ page }) => {
    await mockStudy(page, [WORD], { distractors: [DISTRACTOR], settings: MOCK_SETTINGS });
    await page.goto('/dashboard/lists/_/study');

    expect(await stageOf(page)).toBe('card');
    // The flashcard's two self-evaluation buttons.
    await expect(page.locator('.grid button').first()).toHaveText(/^1/);
    await expect(page.locator('.grid button').nth(1)).toHaveText(/^2/);

    await page.keyboard.press('1');
    expect(await stageAfter(page, 'card')).toBe('select');

    await expect(page.locator('.grid button')).toHaveCount(2);
    const texts = await page.locator('.grid button').allTextContents();
    expect(texts.map((t, i) => t.trim().startsWith(String(i + 1)))).not.toContain(false);
  });

  test('a digit typed into an answer field is not stolen', async ({ page }) => {
    await mockStudy(page, [WORD], { distractors: [DISTRACTOR], settings: MOCK_SETTINGS });
    await page.goto('/dashboard/lists/_/study');

    expect(await stageOf(page)).toBe('card');
    await page.keyboard.press('2');
    expect(await stageAfter(page, 'card')).toBe('type');

    const input = page.locator('input[type="text"]');
    await input.click();
    await page.keyboard.press('1');
    await expect(input).toHaveValue('1');
  });
});
