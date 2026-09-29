import { expect, type Page } from '@playwright/test';

// Mocked admin page opened on Content → Settings (auto-send block). Used by
// admin-auto-send.spec.ts and plan57-screenshots.spec.ts. Returns captured PATCH bodies.

function makeAdminJwt(): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'admin@test.com', name: 'Admin', exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

export async function openAutoSend(page: Page, lang: 'ru' | 'en' = 'ru') {
  const patches: Record<string, unknown>[] = [];
  await page.addInitScript(([token, l]) => {
    localStorage.setItem('fluent_token', token);
    localStorage.setItem('fluent_lang', l);
    localStorage.setItem('cookie_consent', 'accepted');
  }, [makeAdminJwt(), lang] as const);
  await page.route('**/api/**', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/me/quota', (route) => route.fulfill({ json: { is_admin: true, is_superadmin: true } }));
  await page.route('**/api/me/inbox**', (route) => route.fulfill({ json: { unread: 0, items: [], has_more: false } }));
  await page.route('**/api/billing/config', (route) => route.fulfill({ json: { enabled: true } }));
  await page.route('**/api/admin/settings/cefr-thresholds', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/admin/leaderboard-top5**', (route) => route.fulfill({ json: { users: [], week_start: '2026-09-21', week_end: '2026-09-27' } }));
  await page.route('**/api/admin/settings/auto-send', async (route) => {
    if (route.request().method() === 'PATCH') {
      patches.push(route.request().postDataJSON());
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: { auto_send_inactive_emails: true, auto_send_weekly_rewards: true, auto_send_balance_tips: false } });
  });
  await page.goto('/dashboard/admin');
  await page.getByRole('button', { name: lang === 'ru' ? 'Контент' : 'Content', exact: true }).click();
  await page.getByRole('button', { name: lang === 'ru' ? 'Настройки' : 'Settings', exact: true }).click();
  await expect(page.getByTestId('autosend-auto_send_balance_tips')).toBeVisible();
  return patches;
}
