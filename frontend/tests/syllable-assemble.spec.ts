import { test, expect } from '@playwright/test';
import {
  mockStudy, stageOf, stageAfter, waitForAnyStage, answerCorrectly, answerWrong,
  type MockWord, type Stage,
} from './helpers/studyFlow';

// The assemble stage ('2a') in the vocabulary/words study flow: after a correct
// SELECT answer, the entry is assembled from shuffled fragments before the learner
// is asked to type it from memory.
//
// REWRITTEN for feature #5. This spec used to assert that "multi-word phrases and
// slash-separated multi-form entries skip this stage entirely" — that premise is now
// false. Assembly covers every entry type: whole-word tiles for a phrase, syllables
// for a normal word, letters for a word too short to have two syllables. The
// fragment-choice rules themselves are covered by assemble-all-entry-types.spec.ts;
// what this file still owns is the *interaction* — tiles, the assembled row, and
// what a wrong assembly costs.

const AUTOMOBILIS: MockWord = {
  id: 1, lithuanian: 'automobilis', accented: null,
  translation_ru: 'машина', translation_en: 'car', hint: null, status: 'new', mature: false,
};
const ORO_UOSTAS: MockWord = {
  id: 2, lithuanian: 'oro uostas', accented: null,
  translation_ru: 'аэропорт', translation_en: 'airport', hint: null, status: 'new', mature: false,
};
const SLASH_FORM: MockWord = {
  id: 3, lithuanian: 'airis / airė', accented: null,
  translation_ru: 'ирландец', translation_en: 'Irish person', hint: null, status: 'new', mature: false,
};

const SYLLABLES = ['au', 'to', 'mo', 'bi', 'lis'];

/** Drive «С трудом» → SELECT → the assemble screen. */
async function reachAssemble(page: import('@playwright/test').Page, word: MockWord) {
  await mockStudy(page, [word]);
  await page.goto('/dashboard/lists/_/study');
  expect(await stageOf(page)).toBe('card');
  await answerCorrectly(page, 'card', word);
  expect(await stageAfter(page, 'card')).toBe('select');
  await answerCorrectly(page, 'select', word);
  expect(await stageAfter(page, 'select')).toBe('assemble');
}

async function clickTiles(page: import('@playwright/test').Page, fragments: string[]) {
  const pool = page.getByTestId('syllable-tile-pool');
  for (const f of fragments) {
    await pool.getByRole('button', { name: f, exact: true, disabled: false }).first().click();
  }
}

test.describe('assemble stage (2a) interaction', () => {
  test('a single-word entry is offered as its syllables', async ({ page }) => {
    await reachAssemble(page, AUTOMOBILIS);

    await expect(page.getByText('Соберите слово из слогов')).toBeVisible();
    const tiles = await page.getByTestId('syllable-tile-pool').getByRole('button').allTextContents();
    expect(tiles.sort()).toEqual([...SYLLABLES].sort());
  });

  test('assembling correctly advances to the typing stage', async ({ page }) => {
    await reachAssemble(page, AUTOMOBILIS);

    await clickTiles(page, SYLLABLES);
    await expect(page.getByText('Правильно')).toBeVisible();
    await expect(page.locator('input[type="text"]')).toBeVisible({ timeout: 5000 });
  });

  test('clicking an assembled fragment returns it to the pool', async ({ page }) => {
    await reachAssemble(page, AUTOMOBILIS);

    const pool = page.getByTestId('syllable-tile-pool');
    const row = page.getByTestId('assembled-row');
    await pool.getByRole('button', { name: 'au', exact: true }).click();
    await expect(row.getByRole('button', { name: 'au', exact: true })).toBeVisible();

    await row.getByRole('button', { name: 'au', exact: true }).click();
    await expect(row.getByRole('button')).toHaveCount(0);
    await expect(pool.getByRole('button', { name: 'au', exact: true })).toBeEnabled();
  });

  test('a wrong assembly reveals the answer and counts a mistake', async ({ page }) => {
    await reachAssemble(page, AUTOMOBILIS);

    await clickTiles(page, ['lis', 'au', 'to', 'mo', 'bi']);
    await expect(page.getByText('Не совсем')).toBeVisible();
    await expect(page.getByText('automobilis')).toBeVisible();
    await expect(page.getByText('1 ✗')).toBeVisible();
    await expect(page.getByTestId('dismiss-wrong')).toBeVisible();
  });

  test('a wrong assembly buys the +2 assemble / +2 type penalty drill', async ({ page }) => {
    await reachAssemble(page, AUTOMOBILIS);
    await answerWrong(page, 'assemble', AUTOMOBILIS);

    // The chain still owed one type card; the penalty adds two of each on top.
    const seen: Stage[] = [];
    for (let i = 0; i < 30; i++) {
      const stage = await waitForAnyStage(page);
      if (stage === null) break;
      seen.push(stage);
      await answerCorrectly(page, stage, AUTOMOBILIS);
      await page.waitForTimeout(1500);
    }
    expect(seen.filter((s) => s === 'assemble').length).toBe(2);
    expect(seen.filter((s) => s === 'type').length).toBe(3);
  });

  test('a retry starts from an empty assembled row', async ({ page }) => {
    await reachAssemble(page, AUTOMOBILIS);
    await clickTiles(page, ['lis', 'au', 'to', 'mo', 'bi']);
    await page.getByTestId('dismiss-wrong').click();

    // Whatever comes next, no assemble screen may arrive pre-filled.
    for (let i = 0; i < 6; i++) {
      const stage = await waitForAnyStage(page);
      if (stage === null) break;
      if (stage === 'assemble') {
        await expect(page.getByTestId('assembled-row').getByRole('button')).toHaveCount(0);
        return;
      }
      await answerCorrectly(page, stage, AUTOMOBILIS);
      await page.waitForTimeout(1500);
    }
    throw new Error('no assemble screen appeared after the miss');
  });
});

test.describe('entry types that used to skip this stage', () => {
  test('a multi-word entry now assembles, from whole-word tiles', async ({ page }) => {
    await reachAssemble(page, ORO_UOSTAS);

    await expect(page.getByText('Соберите фразу из слов')).toBeVisible();
    const tiles = await page.getByTestId('syllable-tile-pool').getByRole('button').allTextContents();
    expect(tiles.map((t) => t.trim()).sort()).toEqual(['oro', 'uostas']);
  });

  test('a slash multi-form entry now assembles, one form at a time', async ({ page }) => {
    await reachAssemble(page, SLASH_FORM);

    const pool = page.getByTestId('syllable-tile-pool');
    await expect(pool).toBeVisible();
    const tiles = (await pool.getByRole('button').allTextContents()).map((t) => t.trim());
    // Exactly one of the two forms is being asked for — never the raw stored string.
    const joined = tiles.join('');
    expect(joined).not.toContain('/');
    const forms = ['airis', 'airė'];
    const matched = forms.find((f) => joined.split('').sort().join('') === f.split('').sort().join(''));
    expect(matched, `tiles ${JSON.stringify(tiles)} should spell one of ${forms.join(' / ')}`).toBeTruthy();
  });
});
