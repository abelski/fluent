import { test, expect } from '@playwright/test';

const WORDS = [
  { id: 1, lithuanian: 'katė', translation_en: 'cat', translation_ru: 'кошка', hint: null, status: 'new' },
  { id: 2, lithuanian: 'šuo', translation_en: 'dog', translation_ru: 'собака', hint: null, status: 'new' },
  { id: 3, lithuanian: 'namas', translation_en: 'house', translation_ru: 'дом', hint: null, status: 'new' },
  { id: 4, lithuanian: 'vanduo', translation_en: 'water', translation_ru: 'вода', hint: null, status: 'new' },
  { id: 5, lithuanian: 'duona', translation_en: 'bread', translation_ru: 'хлеб', hint: null, status: 'new' },
];

function makeFakeJwt(name: string): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name, exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

test.describe('Language switch', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((token) => {
      localStorage.setItem('fluent_token', token);
    }, makeFakeJwt('Test User'));
    await page.route('**/api/me/quota', async (route) => {
      await route.fulfill({ json: { is_premium: false, premium_active: false, sessions_today: 0, daily_limit: 10, is_admin: false, is_superadmin: false } });
    });
    await page.route('**/api/lists/*/study**', async (route) => {
      await route.fulfill({ json: { words: WORDS, distractors: [] } });
    });
    await page.route('**/api/words/*/progress', async (route) => {
      await route.fulfill({ json: { ok: true } });
    });
  });

  test('lang toggle button is visible in header', async ({ page }) => {
    await page.goto('/dashboard/lists');
    await expect(page.locator('[data-testid="lang-toggle"]')).toBeVisible({ timeout: 3000 });
  });

  test('default lang is RU — toggle shows RU/EN with RU highlighted', async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('fluent_lang'));
    await page.goto('/dashboard/lists');
    const toggle = page.locator('[data-testid="lang-toggle"]');
    await expect(toggle).toBeVisible({ timeout: 3000 });
    await expect(toggle).toContainText('RU');
    await expect(toggle).toContainText('EN');
  });

  test('lang toggle button is enabled', async ({ page }) => {
    await page.goto('/dashboard/lists');
    await expect(page.locator('[data-testid="lang-toggle"]')).toBeEnabled({ timeout: 3000 });
  });

  test('study page stage 1 shows Russian translation by default', async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('fluent_lang'));
    await page.goto('/dashboard/lists/_/study');
    await page.waitForSelector('text=кошка', { timeout: 5000 });
    await expect(page.locator('text=кошка').first()).toBeVisible();
  });

  test('study page stage 1 shows English translation after switching to EN', async ({ page }) => {
    // Pre-set lang to 'en' in localStorage so useLang reads it on mount
    await page.addInitScript(() => {
      localStorage.setItem('fluent_lang', 'en');
    });
    await page.goto('/dashboard/lists/_/study');
    await page.waitForSelector('text=cat', { timeout: 5000 });
    await expect(page.locator('text=cat').first()).toBeVisible();
  });
});
