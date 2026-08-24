import { test, expect } from '@playwright/test';

// Regression test for issue #23: switching the global EN/RU toggle while inside
// the admin panel used to leave large parts of the UI stuck in Russian (the
// Messages tab, the Phrases tab, and the entire /dashboard/admin/grammar page
// never read from the i18n system at all). This test asserts that a handful of
// previously-hardcoded strings from different admin sections now flip to
// English once the toggle is switched.

function makeFakeJwt(name: string, isAdmin = false): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name, is_admin: isAdmin, exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

async function setAdminToken(page: import('@playwright/test').Page) {
  await page.addInitScript((token) => {
    localStorage.setItem('fluent_token', token);
  }, makeFakeJwt('Admin User', true));
}

const MOCK_GRAMMAR_CONFIG = {
  lessons: [],
  cases: {},
};

function setupAdminPageMocks(page: import('@playwright/test').Page) {
  page.route('**/api/admin/users', async (route) => { await route.fulfill({ json: [] }); });
  page.route('**/api/me/quota', async (route) => { await route.fulfill({ json: { is_superadmin: false } }); });
  page.route('**/api/admin/reports', async (route) => { await route.fulfill({ json: [] }); });
  page.route('**/api/admin/articles', async (route) => { await route.fulfill({ json: [] }); });
  page.route('**/api/admin/subcategories', async (route) => { await route.fulfill({ json: [] }); });
  page.route('**/api/admin/content/word-lists', async (route) => { await route.fulfill({ json: [] }); });
  page.route('**/api/admin/grammar/rules', async (route) => { await route.fulfill({ json: [] }); });
  page.route('**/api/admin/feedback', async (route) => { await route.fulfill({ json: [] }); });
  page.route('**/api/admin/messages**', async (route) => { await route.fulfill({ json: [] }); });
  page.route('**/api/admin/message-templates', async (route) => {
    await route.fulfill({ json: { ru: { subject: '', body: '' }, en: { subject: '', body: '' } } });
  });
  page.route('**/api/admin/leaderboard-top5', async (route) => {
    await route.fulfill({ json: { users: [], week_start: '2026-08-10T00:00:00Z', week_end: '2026-08-17T00:00:00Z' } });
  });
  page.route('**/api/admin/phrase-programs', async (route) => { await route.fulfill({ json: [] }); });
}

function setupGrammarPageMocks(page: import('@playwright/test').Page) {
  page.route('**/api/admin/grammar/config', async (route) => { await route.fulfill({ json: MOCK_GRAMMAR_CONFIG }); });
  page.route('**/api/admin/grammar/sentences**', async (route) => { await route.fulfill({ json: [] }); });
  page.route('**/api/admin/grammar/rules', async (route) => { await route.fulfill({ json: [] }); });
  page.route('**/api/admin/grammar/programs', async (route) => { await route.fulfill({ json: [] }); });
}

test.describe('Admin panel translation (issue #23)', () => {
  test('admin panel tabs, Messages tab, and Phrases tab switch to English after toggling', async ({ page }) => {
    await setAdminToken(page);
    setupAdminPageMocks(page);

    await page.goto('/dashboard/admin');

    // Baseline: default language is RU, so the Feedback tab still reads Russian.
    await expect(page.getByRole('button', { name: 'Обратная связь' })).toBeVisible({ timeout: 5000 });

    // Toggle to English (reloads the page, per the toggle's onClick handler).
    await page.locator('[data-testid="lang-toggle"]').click();
    await page.waitForLoadState('load');

    // Top-level tab label (was 100% hardcoded Russian before the fix).
    await expect(page.getByRole('button', { name: 'Feedback' })).toBeVisible({ timeout: 5000 });

    // Messages tab — was entirely unwired.
    await page.getByRole('button', { name: 'Messages' }).click();
    await expect(page.getByRole('button', { name: 'Dismissal' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Emails are generated automatically for users inactive for 30+ days.')).toBeVisible();

    // Phrases tab (under Content) — was entirely unwired.
    await page.getByRole('button', { name: 'Content' }).click();
    await page.getByRole('button', { name: 'Phrases' }).click();
    await expect(page.getByRole('heading', { name: 'Phrase programs' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('No phrase programs.')).toBeVisible();
  });

  test('grammar admin page (/dashboard/admin/grammar) renders in English when lang is en', async ({ page }) => {
    await setAdminToken(page);
    setupAdminPageMocks(page);
    setupGrammarPageMocks(page);
    await page.addInitScript(() => localStorage.setItem('fluent_lang', 'en'));

    await page.goto('/dashboard/admin/grammar');

    await expect(page.getByRole('link', { name: '← Admin' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('heading', { name: 'Grammar' })).toBeVisible();
    await expect(page.getByText('Programs, cases and sentences')).toBeVisible();
    await expect(page.getByText('No programs')).toBeVisible();
  });

  test('grammar admin page still renders in Russian by default (no regression)', async ({ page }) => {
    await setAdminToken(page);
    setupAdminPageMocks(page);
    setupGrammarPageMocks(page);

    await page.goto('/dashboard/admin/grammar');

    await expect(page.getByRole('link', { name: '← Админ' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('heading', { name: 'Грамматика' })).toBeVisible();
    await expect(page.getByText('Нет программ')).toBeVisible();
  });
});
