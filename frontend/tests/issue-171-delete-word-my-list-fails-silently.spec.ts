import { test, expect } from '@playwright/test';

// Issue #171 — deleting a word in "Мои списки" failed silently: handleDelete
// swallowed any deleteMyWord() failure into console.error with no UI feedback
// and no recovery on an expired/invalid token. This spec covers both the base
// regression (a normal delete with a valid session removes the word) and the
// root-cause fix (an auth failure on delete redirects to /login instead of
// doing nothing).

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
  id: 77,
  title: 'Мой словарь',
  difficulty: 1,
  words: [
    { id: 501, lithuanian: 'namas', translation: 'дом', position: 0, status: 'new' },
    { id: 502, lithuanian: 'katė', translation: 'кошка', position: 1, status: 'new' },
  ],
};

async function mockEditPage(page: import('@playwright/test').Page) {
  await page.route('**/api/me/word-lists/77', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: LIST_DETAIL });
    return route.continue();
  });
}

test.describe('Issue #171 — delete word in "Мои списки" edit page', () => {
  test('deleting a word with a valid session removes it from the UI', async ({ page }) => {
    await setFakeToken(page);
    await mockEditPage(page);
    await page.route('**/api/me/word-lists/words/501', (route) =>
      route.fulfill({ json: { ok: true } })
    );

    await page.goto('/dashboard/lists/my/77/edit');
    await expect(page.getByTestId('word-list-edit-page')).toBeVisible({ timeout: 10000 });

    const rows = page.getByTestId('word-row');
    await expect(rows).toHaveCount(2);
    await expect(page.getByText('namas')).toBeVisible();

    await rows.first().locator('button').last().click();

    await expect(rows).toHaveCount(1);
    await expect(page.getByText('namas')).not.toBeVisible();
    await expect(page.getByText('katė')).toBeVisible();
    await expect(page.getByTestId('action-error')).not.toBeVisible();
  });

  test('deleting a word with an expired/invalid token redirects to /login instead of failing silently', async ({ page }) => {
    await setFakeToken(page);
    await mockEditPage(page);
    await page.route('**/api/me/word-lists/words/501', (route) =>
      route.fulfill({ status: 401, json: { detail: 'Invalid token' } })
    );

    await page.goto('/dashboard/lists/my/77/edit');
    await expect(page.getByTestId('word-list-edit-page')).toBeVisible({ timeout: 10000 });

    const rows = page.getByTestId('word-row');
    await rows.first().locator('button').last().click();

    await page.waitForURL('**/login/**', { timeout: 10000 });
    expect(await page.evaluate(() => localStorage.getItem('fluent_token'))).toBeNull();
  });

  test('deleting a word that fails with a non-auth error shows a visible error, not a silent no-op', async ({ page }) => {
    await setFakeToken(page);
    await mockEditPage(page);
    await page.route('**/api/me/word-lists/words/501', (route) =>
      route.fulfill({ status: 404, json: { detail: 'Word not found' } })
    );

    await page.goto('/dashboard/lists/my/77/edit');
    await expect(page.getByTestId('word-list-edit-page')).toBeVisible({ timeout: 10000 });

    const rows = page.getByTestId('word-row');
    await rows.first().locator('button').last().click();

    await expect(page.getByTestId('action-error')).toBeVisible();
    await expect(page.getByTestId('action-error')).toHaveText('Word not found');
    // The word must still be present — the failed delete must not silently vanish it.
    await expect(rows).toHaveCount(2);
  });
});
