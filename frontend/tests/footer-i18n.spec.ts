import { test, expect } from '@playwright/test';

const MOCK_FOOTER_ARTICLES = [
  { slug: 'terms-of-service', title_ru: 'Условия использования', title_en: 'Terms of Service' },
  { slug: 'about-team', title_ru: 'О команде', title_en: 'About the Team' },
  { slug: 'privacy-gdpr', title_ru: 'Конфиденциальность и GDPR', title_en: 'Privacy & GDPR' },
];

async function setupRoutes(page: import('@playwright/test').Page) {
  await page.route('**/api/footer-articles', async (route) => {
    await route.fulfill({ json: MOCK_FOOTER_ARTICLES });
  });
  await page.route('**/api/articles', async (route) => route.fulfill({ json: [] }));
}

async function setLang(page: import('@playwright/test').Page, lang: 'en' | 'ru') {
  await page.addInitScript((l) => {
    window.localStorage.setItem('fluent_lang', l);
    window.localStorage.setItem('cookie_consent', 'accepted');
  }, lang);
}

test.describe('Footer i18n (issue #98)', () => {
  test('English language renders footer links and contact button in English', async ({ page }) => {
    await setLang(page, 'en');
    await setupRoutes(page);
    await page.goto('/dashboard/articles');

    await expect(page.getByRole('link', { name: 'Terms of Service' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('link', { name: 'About the Team' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Privacy & GDPR' })).toBeVisible();

    // Russian titles must NOT appear when lang=en
    await expect(page.getByRole('link', { name: 'Условия использования' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'О команде' })).toHaveCount(0);

    const contactBtn = page.getByTestId('footer-feedback-btn');
    await expect(contactBtn).toHaveText('Contact us');
  });

  test('English modal shows English heading and buttons', async ({ page }) => {
    await setLang(page, 'en');
    await setupRoutes(page);
    await page.goto('/dashboard/articles');

    await page.getByTestId('footer-feedback-btn').click();

    await expect(page.getByRole('heading', { name: 'Contact us' })).toBeVisible({ timeout: 3000 });
    await expect(page.getByText('Tell us what you think — we read every message.')).toBeVisible();
    await expect(page.getByPlaceholder('Your email')).toBeVisible();
    await expect(page.getByPlaceholder('Your message')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await expect(page.getByTestId('feedback-submit')).toHaveText('Send');
  });

  test('Russian language still renders Russian strings (regression check)', async ({ page }) => {
    await setLang(page, 'ru');
    await setupRoutes(page);
    await page.goto('/dashboard/articles');

    await expect(page.getByRole('link', { name: 'Условия использования' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('link', { name: 'О команде' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Конфиденциальность и GDPR' })).toBeVisible();
    await expect(page.getByTestId('footer-feedback-btn')).toHaveText('Написать нам');

    await page.getByTestId('footer-feedback-btn').click();
    await expect(page.getByRole('heading', { name: 'Написать нам' })).toBeVisible({ timeout: 3000 });
    await expect(page.getByPlaceholder('Ваш email')).toBeVisible();
    await expect(page.getByPlaceholder('Ваше сообщение')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Отмена' })).toBeVisible();
    await expect(page.getByTestId('feedback-submit')).toHaveText('Отправить');
  });
});
