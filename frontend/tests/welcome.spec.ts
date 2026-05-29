import { test, expect } from '@playwright/test';

// Fake but structurally valid JWT — the frontend only base64-decodes the payload,
// it does NOT verify the signature client-side, so this is enough for UI tests.
function makeFakeJwt(name: string): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(
    JSON.stringify({ email: 'test@test.com', name, exp: 9999999999 })
  );
  return `${header}.${payload}.fakesignature`;
}

const MOCK_CONTENT = {
  title_ru: 'Как пользоваться Fluent',
  title_en: 'How to use Fluent',
  body_ru: 'Это тест.\n\n**Жирный** текст.',
  body_en: 'This is a test.\n\n**Bold** text.',
};

const MOCK_WELCOME_NEW = { shown: false, content: MOCK_CONTENT };
const MOCK_WELCOME_SEEN = { shown: true, content: MOCK_CONTENT };

test.describe('Welcome modal', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((token) => {
      localStorage.setItem('fluent_token', token);
    }, makeFakeJwt('Test User'));
    await page.route('**/api/me/quota', (r) => r.fulfill({ json: { premium_active: false, premium_until: null, sessions_today: 0, daily_limit: 5 } }));
    await page.route('**/api/subcategory-meta', (r) => r.fulfill({ json: {} }));
    await page.route('**/api/me/custom-programs', (r) => r.fulfill({ json: [] }));
    await page.route('**/api/lists', (r) => r.fulfill({ json: [] }));
    await page.route('**/api/me/programs', (r) => r.fulfill({ json: [] }));
    await page.route('**/api/me/lists-progress', (r) => r.fulfill({ json: {} }));
  });

  test('modal appears when welcome_shown is false', async ({ page }) => {
    await page.route('**/api/me/welcome', (r) => r.fulfill({ json: MOCK_WELCOME_NEW }));
    await page.goto('/dashboard/lists');
    await expect(page.locator('[data-testid="welcome-modal"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="welcome-modal"]')).toContainText('Как пользоваться Fluent');
  });

  test('modal does not appear when welcome_shown is true', async ({ page }) => {
    await page.route('**/api/me/welcome', (r) => r.fulfill({ json: MOCK_WELCOME_SEEN }));
    await page.goto('/dashboard/lists');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[data-testid="welcome-modal"]')).not.toBeVisible();
  });

  test('"Понятно" button permanently dismisses the modal', async ({ page }) => {
    await page.route('**/api/me/welcome', (r) => r.fulfill({ json: MOCK_WELCOME_NEW }));
    await page.route('**/api/me/welcome/dismiss', (r) => r.fulfill({ json: { ok: true } }));
    await page.goto('/dashboard/lists');
    await expect(page.locator('[data-testid="welcome-modal"]')).toBeVisible({ timeout: 5000 });
    await page.locator('[data-testid="welcome-dismiss"]').click();
    await expect(page.locator('[data-testid="welcome-modal"]')).not.toBeVisible({ timeout: 3000 });
  });

  test('X button closes modal for session only (no dismiss API call)', async ({ page }) => {
    let dismissCalled = false;
    await page.route('**/api/me/welcome', (r) => r.fulfill({ json: MOCK_WELCOME_NEW }));
    await page.route('**/api/me/welcome/dismiss', (r) => { dismissCalled = true; r.fulfill({ json: { ok: true } }); });
    await page.goto('/dashboard/lists');
    await expect(page.locator('[data-testid="welcome-modal"]')).toBeVisible({ timeout: 5000 });
    await page.locator('[data-testid="welcome-close"]').click();
    await expect(page.locator('[data-testid="welcome-modal"]')).not.toBeVisible({ timeout: 3000 });
    expect(dismissCalled).toBe(false);
  });

  test('markdown body renders bold text', async ({ page }) => {
    await page.route('**/api/me/welcome', (r) => r.fulfill({ json: MOCK_WELCOME_NEW }));
    await page.goto('/dashboard/lists');
    await expect(page.locator('[data-testid="welcome-modal"] strong')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="welcome-modal"] strong')).toContainText('Жирный');
  });
});
