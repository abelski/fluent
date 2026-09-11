import { test, expect } from '@playwright/test';

// Issue #172 — reporting user could not delete "pasiūlymas" / "Предложение"
// from their personal list "From internet" (list 307, word 7723). Root cause
// analysis found this is the same failure mode as #171 (handleDelete
// swallowing deleteMyWord() failures with no UI feedback), already fixed in
// 7f2fc21. This regression test locks in that the fix holds for this exact
// word/list naming.

function makeFakeJwt(name: string): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name, exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

async function setFakeToken(page: import('@playwright/test').Page) {
  await page.addInitScript((token) => {
    localStorage.setItem('fluent_token', token);
  }, makeFakeJwt('Test User'));
}

const LIST_DETAIL = {
  id: 307,
  title: 'From internet',
  difficulty: 1,
  words: [
    { id: 7723, lithuanian: 'pasiūlymas', translation: 'Предложение', position: 0, status: 'new' },
    { id: 7724, lithuanian: 'namas', translation: 'дом', position: 1, status: 'new' },
  ],
};

async function mockEditPage(page: import('@playwright/test').Page) {
  await page.route('**/api/me/word-lists/307', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: LIST_DETAIL });
    return route.continue();
  });
}

test.describe('Issue #172 — delete "pasiūlymas" from "From internet" list', () => {
  test('deleting "pasiūlymas" with a valid session removes it from the UI', async ({ page }) => {
    await setFakeToken(page);
    await mockEditPage(page);
    await page.route('**/api/me/word-lists/words/7723', (route) =>
      route.fulfill({ json: { ok: true } })
    );

    await page.goto('/dashboard/lists/my/307/edit');
    await expect(page.getByTestId('word-list-edit-page')).toBeVisible({ timeout: 10000 });

    const rows = page.getByTestId('word-row');
    await expect(rows).toHaveCount(2);
    await expect(page.getByText('pasiūlymas')).toBeVisible();

    await rows.first().locator('button').last().click();

    await expect(rows).toHaveCount(1);
    await expect(page.getByText('pasiūlymas')).not.toBeVisible();
    await expect(page.getByText('namas')).toBeVisible();
    await expect(page.getByTestId('action-error')).not.toBeVisible();
  });

  test('deleting "pasiūlymas" that fails with a non-auth error shows a visible error, not a silent no-op', async ({ page }) => {
    await setFakeToken(page);
    await mockEditPage(page);
    await page.route('**/api/me/word-lists/words/7723', (route) =>
      route.fulfill({ status: 404, json: { detail: 'Word not found' } })
    );

    await page.goto('/dashboard/lists/my/307/edit');
    await expect(page.getByTestId('word-list-edit-page')).toBeVisible({ timeout: 10000 });

    const rows = page.getByTestId('word-row');
    await rows.first().locator('button').last().click();

    await expect(page.getByTestId('action-error')).toBeVisible();
    await expect(page.getByTestId('action-error')).toHaveText('Word not found');
    await expect(rows).toHaveCount(2);
  });
});
