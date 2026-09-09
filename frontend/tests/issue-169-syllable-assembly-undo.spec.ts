import { test, expect } from '@playwright/test';
import { mockStudy, stageOf, stageAfter, answerCorrectly, type MockWord } from './helpers/studyFlow';

// Regression test for issue #169: "не хватает функционала, чтобы собрать слово
// заново, если понимаешь что ошибся, или случайно нажал не на тот слог".
//
// Under the old behaviour, `handleStage2aTileClick` scored the attempt the instant
// the last tile filled the assembled row — a misclick on the final syllable locked
// in a wrong answer with no way to fix it. This test places every tile, including a
// wrong final one, and asserts the answer is NOT scored yet (no "Не совсем" text,
// the Check button is still present, and the misplaced last tile can still be tapped
// back out). It then fixes the assembly and presses Check, asserting a correct score.
//
// This test would have FAILED under the old auto-submit-on-last-tile behaviour,
// where reaching the final tile immediately flipped `answerState` to 'wrong' and
// disabled tap-to-remove on all tiles.

const AUTOMOBILIS: MockWord = {
  id: 1, lithuanian: 'automobilis', accented: null,
  translation_ru: 'машина', translation_en: 'car', hint: null, status: 'new', mature: false,
};

const SYLLABLES = ['au', 'to', 'mo', 'bi', 'lis'];

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

test('a misclick on the final syllable does not auto-lock a wrong answer, and can be undone before Check', async ({ page }) => {
  await reachAssemble(page, AUTOMOBILIS);

  // Fill every slot, but swap the last two tiles so the final placement is wrong —
  // this is exactly the "случайно нажал не на тот слог" scenario from the report.
  await clickTiles(page, ['au', 'to', 'mo', 'lis', 'bi']);

  const row = page.getByTestId('assembled-row');
  await expect(row.getByRole('button')).toHaveCount(SYLLABLES.length);

  // The answer must NOT be scored yet: no "wrong" feedback, Check button still there.
  await expect(page.getByText('Не совсем')).not.toBeVisible();
  await expect(page.getByText('Правильно')).not.toBeVisible();
  await expect(page.getByTestId('check-assembly')).toBeVisible();

  // The misplaced final tile is still removable, not locked.
  const lastTile = row.getByRole('button', { name: 'bi', exact: true });
  await expect(lastTile).toBeVisible();
  await lastTile.click();
  await expect(row.getByRole('button')).toHaveCount(SYLLABLES.length - 1);

  // Remove the other swapped tile too and re-place both correctly.
  await row.getByRole('button', { name: 'lis', exact: true }).click();
  await clickTiles(page, ['bi', 'lis']);
  await expect(row.getByRole('button')).toHaveCount(SYLLABLES.length);

  // Only now, on explicit Check, is the (now-correct) answer scored.
  await page.getByTestId('check-assembly').click();
  await expect(page.getByText('Правильно')).toBeVisible();
  await expect(page.locator('input[type="text"]')).toBeVisible({ timeout: 5000 });
});
