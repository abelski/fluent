import { test, expect } from '@playwright/test';

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

const MOCK_PROGRAM = {
  id: 1,
  title: 'Литовские падежи',
  title_en: 'Lithuanian Cases',
  description: 'Все грамматические падежи литовского языка.',
  difficulty: 1,
};

const MOCK_LESSON = {
  id: 1,
  title: 'Galininkas',
  level: 'basic',
  cases: [4],
  task_count: 24,
  rules: [],
  is_locked: false,
  best_score_pct: null,
};

test.describe('Grammar programs', () => {
  test('shows empty state with Смотреть все программы when not enrolled', async ({ page }) => {
    await setFakeToken(page);

    await page.route('**/api/grammar-programs', (route) =>
      route.fulfill({ json: [{ ...MOCK_PROGRAM, enrolled: false }] })
    );
    await page.route('**/api/grammar/lessons', (route) =>
      route.fulfill({ json: [] })
    );

    await page.goto('/dashboard/grammar');
    await expect(page.getByTestId('browse-programs-link')).toBeVisible();
  });

  test('shows lesson tree when enrolled', async ({ page }) => {
    await setFakeToken(page);

    await page.route('**/api/grammar-programs', (route) =>
      route.fulfill({ json: [{ ...MOCK_PROGRAM, enrolled: true }] })
    );
    await page.route('**/api/grammar/lessons', (route) =>
      route.fulfill({ json: [MOCK_LESSON] })
    );

    await page.goto('/dashboard/grammar');
    await expect(page.getByTestId('unenroll-button')).toBeVisible();
    await expect(page.getByTestId('category-padezhi')).toBeVisible();
  });

  test('unenroll hides lesson tree and shows empty state', async ({ page }) => {
    await setFakeToken(page);

    const programs = [{ ...MOCK_PROGRAM, enrolled: true }];

    await page.route('**/api/grammar-programs', (route) =>
      route.fulfill({ json: programs })
    );
    await page.route('**/api/grammar/lessons', (route) =>
      route.fulfill({ json: [MOCK_LESSON] })
    );
    await page.route('**/api/me/grammar-programs/1', (route) =>
      route.fulfill({ json: { ok: true } })
    );

    await page.goto('/dashboard/grammar');
    await expect(page.getByTestId('unenroll-button')).toBeVisible();

    await page.getByTestId('unenroll-button').click();
    await expect(page.getByTestId('browse-programs-link')).toBeVisible();
  });

  test('catalog page shows program card with Добавить button', async ({ page }) => {
    await setFakeToken(page);

    await page.route('**/api/grammar-programs', (route) =>
      route.fulfill({ json: [{ ...MOCK_PROGRAM, enrolled: false }] })
    );

    await page.goto('/dashboard/grammar/programs');
    await expect(page.getByTestId('grammar-program-card')).toBeVisible();
    await expect(page.getByTestId('enroll-button')).toBeVisible();
  });

  test('catalog page shows enrolled badge after enrolling', async ({ page }) => {
    await setFakeToken(page);

    await page.route('**/api/grammar-programs', (route) =>
      route.fulfill({ json: [{ ...MOCK_PROGRAM, enrolled: false }] })
    );
    await page.route('**/api/me/grammar-programs/1', (route) =>
      route.fulfill({ json: { ok: true } })
    );

    await page.goto('/dashboard/grammar/programs');
    await page.getByTestId('enroll-button').click();
    await expect(page.getByTestId('enrolled-badge')).toBeVisible();
  });
});
