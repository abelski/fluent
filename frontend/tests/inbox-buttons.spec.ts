import { test, expect, type Page } from '@playwright/test';

// Plan #23 — the button contract for /dashboard/inbox. One test per row of the
// 12-control table, plus "nothing extra is rendered" in each view state.
//
// It runs against a stateful in-test fake backend rather than static fixtures:
// an action has to really change what the next GET returns, or "Undo restores the
// row" and "Mark all as read hides itself" would pass against a frozen response.

interface Row {
  id: number;
  title_ru: string;
  read: boolean;
  deleted: boolean;
  cta: boolean;
}

function makeFakeJwt(): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name: 'Test User', exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

interface Recorded { url: string; method: string; body: unknown }

async function fakeBackend(page: Page, rows: Row[]) {
  const recorded: Recorded[] = [];

  await page.addInitScript((token) => {
    localStorage.setItem('fluent_token', token);
    // The cookie banner is a full-width fixed bar at the bottom — it would sit on
    // top of the Undo snackbar. A logged-in user has long since dismissed it.
    localStorage.setItem('cookie_consent', 'accepted');
  }, makeFakeJwt());

  await page.route('**/api/me/quota', (route) => route.fulfill({
    json: { is_premium: false, premium_active: false, premium_until: null, sessions_today: 0, daily_limit: 10, is_admin: false },
  }));
  await page.route('**/api/billing/config', (route) => route.fulfill({ json: { enabled: false } }));

  const visible = () => rows.filter((r) => !r.deleted);
  const unread = () => visible().filter((r) => !r.read).length;
  const toItem = (r: Row) => ({
    id: r.id, kind: 'info', source: 'admin',
    title_ru: r.title_ru, title_en: r.title_ru,
    snippet_ru: 'Текст', snippet_en: 'Text',
    created_at: new Date(2026, 0, 2, 12, 0).toISOString().replace('Z', ''),
    read: r.read,
  });

  await page.route('**/api/me/inbox**', async (route) => {
    const request = route.request();
    const url = request.url();
    recorded.push({ url, method: request.method(), body: request.postDataJSON?.() ?? null });

    if (request.method() === 'POST') {
      const body = request.postDataJSON() as { action: string; ids?: number[]; all?: boolean };
      const targets = body.all ? rows.filter((r) => !r.deleted && !r.read) : rows.filter((r) => body.ids?.includes(r.id));
      const affected: number[] = [];
      for (const row of targets) {
        if (body.action === 'read' && !row.read && !row.deleted) { row.read = true; affected.push(row.id); }
        if (body.action === 'delete' && !row.deleted) { row.deleted = true; affected.push(row.id); }
        if (body.action === 'undelete' && row.deleted) { row.deleted = false; affected.push(row.id); }
      }
      return route.fulfill({ json: { affected_ids: affected, unread: unread() } });
    }

    if (url.includes('/unread-count')) return route.fulfill({ json: { unread: unread() } });

    const detail = url.match(/\/me\/inbox\/(\d+)/);
    if (detail) {
      const row = rows.find((r) => r.id === Number(detail[1]) && !r.deleted);
      if (!row) return route.fulfill({ status: 404, json: { detail: 'Message not found' } });
      return route.fulfill({
        json: {
          item: {
            ...toItem(row), body_ru: 'Тело сообщения', body_en: 'Message body',
            cta_url: row.cta ? '/pricing' : null,
            cta_label_ru: row.cta ? 'Premium' : null,
            cta_label_en: row.cta ? 'Premium' : null,
          },
        },
      });
    }

    const params = new URL(url).searchParams;
    const limit = Number(params.get('limit') ?? 20);
    const offset = Number(params.get('offset') ?? 0);
    const all = visible();
    return route.fulfill({
      json: { items: all.slice(offset, offset + limit).map(toItem), has_more: all.length > offset + limit, unread: unread() },
    });
  });

  return recorded;
}

function rowsOf(count: number, over: Partial<Row> = {}): Row[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1, title_ru: `Письмо ${i + 1}`, read: false, deleted: false, cta: false, ...over,
  }));
}

/** Accessible names of every control inside the inbox page (header/footer excluded). */
async function controlsOf(page: Page): Promise<string[]> {
  return page.locator('[data-testid="inbox-page"]')
    .locator('button, a, [role="button"]')
    .evaluateAll((els) => els.map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim()));
}

test.describe('12-control contract', () => {
  test('#5 Mark all as read — shown only when unread > 0', async ({ page }) => {
    const recorded = await fakeBackend(page, rowsOf(2));
    await page.goto('/dashboard/inbox');

    await page.getByTestId('inbox-mark-all').click();
    await expect(page.getByTestId('inbox-mark-all')).toHaveCount(0);

    const post = recorded.find((r) => r.method === 'POST');
    expect(post?.body).toEqual({ action: 'read', all: true });
  });

  test('#6 Message row — opens the message and marks it read', async ({ page }) => {
    const recorded = await fakeBackend(page, rowsOf(2));
    await page.goto('/dashboard/inbox');

    await page.getByTestId('inbox-row').first().click();
    await expect(page).toHaveURL(/\?m=1/);
    await expect(page.getByTestId('inbox-message')).toContainText('Тело сообщения');

    await expect.poll(() => recorded.filter((r) => r.method === 'POST').length).toBe(1);
    expect(recorded.find((r) => r.method === 'POST')?.body).toEqual({ action: 'read', ids: [1] });
    expect(recorded.some((r) => /\/me\/inbox\/1$/.test(r.url))).toBe(true);
  });

  test('#7 Show older — hidden without has_more, appends the next page', async ({ page }) => {
    await fakeBackend(page, rowsOf(25));
    await page.goto('/dashboard/inbox');

    await expect(page.getByTestId('inbox-row')).toHaveCount(20);
    await page.getByTestId('inbox-show-older').click();
    await expect(page.getByTestId('inbox-row')).toHaveCount(25);
    await expect(page.getByTestId('inbox-show-older')).toHaveCount(0);
  });

  test('#7 Show older is absent when there is nothing older', async ({ page }) => {
    await fakeBackend(page, rowsOf(2));
    await page.goto('/dashboard/inbox');
    await expect(page.getByTestId('inbox-row')).toHaveCount(2);
    await expect(page.getByTestId('inbox-show-older')).toHaveCount(0);
  });

  test('#8 Back — and browser Back — return to the list', async ({ page }) => {
    await fakeBackend(page, rowsOf(2));
    await page.goto('/dashboard/inbox');

    await page.getByTestId('inbox-row').first().click();
    await expect(page.getByTestId('inbox-message')).toBeVisible();
    await page.getByTestId('inbox-back').click();
    await expect(page.getByTestId('inbox-list')).toBeVisible();

    await page.getByTestId('inbox-row').first().click();
    await expect(page.getByTestId('inbox-message')).toBeVisible();
    await page.goBack();
    await expect(page.getByTestId('inbox-list')).toBeVisible();
  });

  test('#9 CTA — rendered only when the message carries one', async ({ page }) => {
    await fakeBackend(page, [
      { id: 1, title_ru: 'С кнопкой', read: false, deleted: false, cta: true },
      { id: 2, title_ru: 'Без кнопки', read: false, deleted: false, cta: false },
    ]);
    await page.goto('/dashboard/inbox?m=1');
    await expect(page.getByTestId('inbox-cta')).toHaveAttribute('href', /^\/pricing\/?$/);

    await page.goto('/dashboard/inbox?m=2');
    await expect(page.getByTestId('inbox-message')).toContainText('Тело сообщения');
    await expect(page.getByTestId('inbox-cta')).toHaveCount(0);
  });

  test('#10 Reply — opens the feedback modal prefilled with Re: <title>', async ({ page }) => {
    await fakeBackend(page, rowsOf(1));
    await page.goto('/dashboard/inbox?m=1');
    await page.getByTestId('inbox-reply').click();
    await expect(page.getByTestId('feedback-message')).toHaveValue(/^Re: Письмо 1/);
  });

  test('#11 + #12 Delete shows an Undo snackbar that restores the row in place', async ({ page }) => {
    const recorded = await fakeBackend(page, rowsOf(3));
    await page.goto('/dashboard/inbox');

    await page.getByTestId('inbox-row').nth(1).click();
    await expect(page.getByTestId('inbox-message')).toBeVisible();
    await page.getByTestId('inbox-delete').click();

    await expect(page.getByTestId('inbox-list')).toBeVisible();
    await expect(page.getByTestId('inbox-row')).toHaveCount(2);
    await expect(page.getByTestId('inbox-snackbar')).toContainText('Сообщение удалено');
    expect(recorded.find((r) => (r.body as { action?: string })?.action === 'delete')?.body)
      .toEqual({ action: 'delete', ids: [2] });

    await page.getByTestId('inbox-undo').click();
    await expect(page.getByTestId('inbox-row')).toHaveCount(3);
    await expect(page.getByTestId('inbox-row').nth(1)).toContainText('Письмо 2');
    expect(recorded.find((r) => (r.body as { action?: string })?.action === 'undelete')?.body)
      .toEqual({ action: 'undelete', ids: [2] });
  });

  test('Retry only exists in the error state and reruns the failed GET', async ({ page }) => {
    let fail = true;
    await page.addInitScript((token) => {
      localStorage.setItem('fluent_token', token);
      localStorage.setItem('cookie_consent', 'accepted');
    }, makeFakeJwt());
    await page.route('**/api/me/quota', (route) => route.fulfill({ json: { is_admin: false } }));
    await page.route('**/api/me/inbox**', (route) => {
      const url = route.request().url();
      if (url.includes('/unread-count')) return route.fulfill({ json: { unread: 0 } });
      if (fail) return route.fulfill({ status: 500, json: { detail: 'boom' } });
      return route.fulfill({ json: { items: [], has_more: false, unread: 0 } });
    });

    await page.goto('/dashboard/inbox');
    await expect(page.getByTestId('inbox-retry')).toBeVisible();
    fail = false;
    await page.getByTestId('inbox-retry').click();
    await expect(page.getByTestId('inbox-empty')).toBeVisible();
    await expect(page.getByTestId('inbox-retry')).toHaveCount(0);
  });
});

test.describe('Nothing extra is rendered', () => {
  test('list view exposes exactly the contract controls', async ({ page }) => {
    await fakeBackend(page, rowsOf(25));
    await page.goto('/dashboard/inbox');
    await expect(page.getByTestId('inbox-row')).toHaveCount(20);

    const controls = await controlsOf(page);
    // 20 rows + "Mark all as read" + "Show older", nothing else.
    expect(controls).toHaveLength(22);

    const page_ = page.locator('[data-testid="inbox-page"]');
    await expect(page_.locator('input[type="checkbox"]')).toHaveCount(0);
    await expect(page_.locator('input[type="search"], input[type="text"]')).toHaveCount(0);
    await expect(page_.getByRole('button', { name: /star|избран/i })).toHaveCount(0);
    await expect(page_.locator('a[href="#"], a[href^="javascript:"]')).toHaveCount(0);
    expect(controls.every((name) => name.length > 0)).toBe(true);
  });

  test('message view exposes exactly Back / CTA / Reply / Delete', async ({ page }) => {
    await fakeBackend(page, [{ id: 1, title_ru: 'Письмо', read: true, deleted: false, cta: true }]);
    await page.goto('/dashboard/inbox?m=1');
    await expect(page.getByTestId('inbox-cta')).toBeVisible();
    expect(await controlsOf(page)).toHaveLength(4);
  });

  test('empty state has no controls at all', async ({ page }) => {
    await fakeBackend(page, []);
    await page.goto('/dashboard/inbox');
    await expect(page.getByTestId('inbox-empty')).toBeVisible();
    expect(await controlsOf(page)).toHaveLength(0);
  });
});

test.describe('375px', () => {
  test('every control clears 44px and the page does not scroll sideways', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 720 });
    await fakeBackend(page, rowsOf(25));
    await page.goto('/dashboard/inbox');
    await expect(page.getByTestId('inbox-row')).toHaveCount(20);

    const heights = await page.locator('[data-testid="inbox-page"]').locator('button, a')
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(44);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
