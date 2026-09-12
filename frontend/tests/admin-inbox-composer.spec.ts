import { test, expect, type Page } from '@playwright/test';

// Plan #23 — Admin → Messages → Inbox. The composer must never send straight from
// the form: it runs a dry_run first so the confirm shows the recipient count the
// *server* resolved, then repeats the identical payload with dry_run:false.

function makeAdminJwt(): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'admin@test.com', name: 'Admin', exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

const USERS = [
  { id: 'u-anna', email: 'anna@example.com', name: 'Anna Smith' },
  { id: 'u-boris', email: 'boris@example.com', name: 'Boris Petrov' },
].map((u) => ({
  ...u,
  is_premium: false, premium_until: null, premium_active: false, subscription_status: null,
  stripe_customer_id: null, is_admin: false, is_superadmin: false, is_redactor: false,
  sessions_today: 0, daily_limit: 10, last_login: null, email_consent: true,
  inactive_flag: false, inactive_since: null, deletion_warning: false,
  deletion_due: null, notice_sent_at: null,
}));

async function setupAdmin(page: Page) {
  const sent: Record<string, unknown>[] = [];

  await page.addInitScript((token) => {
    localStorage.setItem('fluent_token', token);
  }, makeAdminJwt());

  await page.route('**/api/admin/users', (route) => route.fulfill({ json: USERS }));
  await page.route('**/api/me/quota', (route) => route.fulfill({ json: { is_admin: true, is_superadmin: true } }));
  await page.route('**/api/admin/reports', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/admin/articles', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/admin/subcategories', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/admin/content/word-lists', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/admin/grammar/rules', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/admin/feedback', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/admin/messages**', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/me/inbox**', (route) => route.fulfill({ json: { unread: 0, items: [], has_more: false } }));

  await page.route('**/api/admin/inbox**', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      sent.push(body);
      return route.fulfill({ json: body.dry_run ? { recipients: 6 } : { message_id: 11, recipients: 6 } });
    }
    return route.fulfill({ json: [] });
  });

  return sent;
}

async function openInboxTab(page: Page) {
  await page.goto('/dashboard/admin');
  await page.getByRole('button', { name: 'Письма' }).click();
  // By testid, not by name: the header envelope's aria-label is "Входящие" too.
  await page.getByTestId('messages-subtab-inbox').click();
  await expect(page.getByTestId('admin-inbox')).toBeVisible();
}

test('premium audience → dry run → confirm → real send with the same payload', async ({ page }) => {
  const sent = await setupAdmin(page);
  await openInboxTab(page);

  await page.getByRole('radio', { name: 'Premium' }).check();
  await page.getByTestId('admin-inbox-title_ru').fill('Скидка на Premium');
  await page.getByTestId('admin-inbox-title_en').fill('Premium discount');
  await page.getByTestId('admin-inbox-body_ru').fill('Только на этой неделе');
  await page.getByTestId('admin-inbox-body_en').fill('This week only');

  let confirmText = '';
  page.on('dialog', (dialog) => { confirmText = dialog.message(); dialog.accept(); });

  await page.getByTestId('admin-inbox-send').click();
  await expect.poll(() => sent.length).toBe(2);

  expect(confirmText).toContain('6');
  expect(sent[0]).toMatchObject({ audience: 'premium', kind: 'info', title_en: 'Premium discount', dry_run: true });
  expect(sent[1]).toMatchObject({ audience: 'premium', kind: 'info', title_en: 'Premium discount', dry_run: false });
  expect(sent[1].body_ru).toBe('Только на этой неделе');
  // The form resets so the same broadcast can't be fired twice by accident.
  await expect(page.getByTestId('admin-inbox-title_ru')).toHaveValue('');
});

test('the name search filters the loaded users and a checkbox selects one', async ({ page }) => {
  const sent = await setupAdmin(page);
  await openInboxTab(page);

  await page.getByRole('radio', { name: 'Выбранным пользователям' }).check();
  await expect(page.getByRole('checkbox')).toHaveCount(2);

  await page.getByTestId('admin-inbox-search').fill('boris');
  await expect(page.getByRole('checkbox')).toHaveCount(1);
  await page.getByRole('checkbox').check();
  await expect(page.getByTestId('admin-inbox')).toContainText('Выбрано: 1');

  await page.getByTestId('admin-inbox-title_ru').fill('Привет');
  await page.getByTestId('admin-inbox-title_en').fill('Hello');
  page.on('dialog', (dialog) => dialog.accept());
  await page.getByTestId('admin-inbox-send').click();

  await expect.poll(() => sent.length).toBe(2);
  expect(sent[1]).toMatchObject({ audience: 'users', user_ids: ['u-boris'], dry_run: false });
});
