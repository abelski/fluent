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

const MOCK_ENROLLED = [
  {
    id: 1,
    title: 'Туристические фразы',
    title_en: null,
    description: null,
    description_en: null,
    difficulty: 1,
    phrase_count: 10,
    enrolled: true,
    stage_distribution: { stage0: 8, stage1: 1, stage2: 1 },
  },
];

const MOCK_UNENROLLED: typeof MOCK_ENROLLED = [];

test.describe('Phrases page — Смотреть все программы link', () => {
  test('shows bottom link when enrolled programs exist', async ({ page }) => {
    await setFakeToken(page);

    await page.route('**/api/phrase-programs', (route) =>
      route.fulfill({ json: MOCK_ENROLLED })
    );
    await page.route('**/api/me/quota', (route) =>
      route.fulfill({ json: { premium_active: false, sessions_today: 0, daily_limit: 5 } })
    );
    await page.route('**/api/me/stats', (route) =>
      route.fulfill({ json: { phrases_learned: 1, phrases_due_review: 0 } })
    );
    await page.route('**/api/phrase-programs/1', (route) =>
      route.fulfill({ json: { phrases: [] } })
    );

    await page.goto('/dashboard/phrases');
    await expect(page.getByRole('link', { name: /Смотреть все программы/i })).toBeVisible();
  });

  test('shows empty state with CTA button when no programs enrolled', async ({ page }) => {
    await setFakeToken(page);

    await page.route('**/api/phrase-programs', (route) =>
      route.fulfill({ json: MOCK_UNENROLLED })
    );
    await page.route('**/api/me/quota', (route) =>
      route.fulfill({ json: { premium_active: false, sessions_today: 0, daily_limit: 5 } })
    );
    await page.route('**/api/me/stats', (route) =>
      route.fulfill({ json: { phrases_learned: 0, phrases_due_review: 0 } })
    );

    await page.goto('/dashboard/phrases');
    await expect(page.getByRole('link', { name: /Смотреть все программы/i })).toBeVisible();
  });

  test('/phrase-programs shows all programs with Добавить button', async ({ page }) => {
    await setFakeToken(page);

    const allPrograms = [
      { ...MOCK_ENROLLED[0], enrolled: false, stage_distribution: null },
    ];

    await page.route('**/api/phrase-programs', (route) =>
      route.fulfill({ json: allPrograms })
    );

    await page.goto('/phrase-programs');
    await expect(page.getByTestId('phrase-program-card')).toBeVisible();
    await expect(page.getByTestId('enroll-button')).toBeVisible();
  });

  test('inline available programs section is removed from phrases page', async ({ page }) => {
    await setFakeToken(page);

    const programs = [
      { ...MOCK_ENROLLED[0], enrolled: false, stage_distribution: null },
    ];

    await page.route('**/api/phrase-programs', (route) =>
      route.fulfill({ json: programs })
    );
    await page.route('**/api/me/quota', (route) =>
      route.fulfill({ json: { premium_active: false, sessions_today: 0, daily_limit: 5 } })
    );
    await page.route('**/api/me/stats', (route) =>
      route.fulfill({ json: { phrases_learned: 0, phrases_due_review: 0 } })
    );

    await page.goto('/dashboard/phrases');
    await expect(page.getByTestId('enroll-button')).not.toBeVisible();
  });
});
