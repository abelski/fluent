import { test, expect, type Page } from '@playwright/test';

// Plan #23 — header envelope, the Teams-style unread badge and the preview dropdown.
//
// The badge checks are geometric on purpose: "a red circle overlapping the icon's
// top-right corner" is the whole spec, and a class-name assertion would happily pass
// while the badge sat somewhere else or got clipped by the header.
//
// The request-avoidance checks matter just as much: this component mounts on every
// page for every logged-in user, and an unread-count call costs an auth lookup plus
// a query (~0.5s of DB time in production).

const DESTRUCTIVE = 'rgb(194, 80, 74)';   // #c2504a — the `destructive` token
const WHITE = 'rgb(255, 255, 255)';

function makeFakeJwt(name: string): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name, exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

async function setFakeToken(page: Page) {
  await page.addInitScript((token) => {
    localStorage.setItem('fluent_token', token);
  }, makeFakeJwt('Test User'));
}

const QUOTA = {
  is_premium: false, premium_active: false, premium_until: null,
  sessions_today: 0, daily_limit: 10, is_admin: false,
  subscription_status: null, has_billing_account: false,
};

function item(id: number, over: Record<string, unknown> = {}) {
  return {
    id, kind: 'info', source: 'admin',
    title_ru: `Сообщение ${id}`, title_en: `Message ${id}`,
    snippet_ru: 'Короткий текст', snippet_en: 'Short text',
    created_at: new Date().toISOString().replace('Z', ''),
    read: false,
    ...over,
  };
}

interface InboxMocks {
  unread?: number;
  items?: ReturnType<typeof item>[];
  hasMore?: boolean;
  detail?: Record<string, unknown>;
}

/** One handler for every /me/inbox* route: Playwright matches the most recent
 *  registration first, so overlapping patterns would be a trap. */
async function mockInbox(page: Page, opts: InboxMocks = {}) {
  const items = opts.items ?? [];
  const unread = opts.unread ?? items.filter((i) => !i.read).length;
  await page.route('**/api/me/inbox**', async (route) => {
    const url = route.request().url();
    if (route.request().method() === 'POST') {
      return route.fulfill({ json: { affected_ids: items.map((i) => i.id), unread: 0 } });
    }
    if (url.includes('/unread-count')) return route.fulfill({ json: { unread } });
    const detail = url.match(/\/me\/inbox\/(\d+)/);
    if (detail) {
      return route.fulfill({
        json: {
          item: {
            ...item(Number(detail[1])),
            body_ru: 'Тело', body_en: 'Body',
            cta_label_ru: null, cta_label_en: null, cta_url: null,
            ...opts.detail,
          },
        },
      });
    }
    return route.fulfill({ json: { items, has_more: opts.hasMore ?? false, unread } });
  });
}

async function mockListsPage(page: Page) {
  await page.route('**/api/me/quota', (route) => route.fulfill({ json: QUOTA }));
  await page.route('**/api/me/lists-progress', (route) => route.fulfill({ json: {} }));
  await page.route('**/api/subcategory-meta', (route) => route.fulfill({ json: {} }));
  await page.route('**/api/lists', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/me/programs', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/me/custom-programs', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/me/stats', (route) => route.fulfill({ json: { known: 0, streak: 0, mistakes: 0, due_review: 0, new_inbox_messages: 0 } }));
  await page.route('**/api/billing/config', (route) => route.fulfill({ json: { enabled: false } }));
}

async function boxOf(page: Page, selector: string) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`no bounding box for ${selector}`);
  return box;
}

test.describe('Header envelope', () => {
  test('is not rendered when logged out', async ({ page }) => {
    await mockListsPage(page);
    await mockInbox(page);
    await page.goto('/dashboard/lists');
    await expect(page.getByTestId('lang-toggle')).toBeVisible();
    await expect(page.getByTestId('inbox-button')).toHaveCount(0);
  });

  test('sits left of the RU/EN switch and has a 44x44 tap area', async ({ page }) => {
    await setFakeToken(page);
    await mockListsPage(page);
    await mockInbox(page, { unread: 0 });
    await page.goto('/dashboard/lists');

    const button = await boxOf(page, '[data-testid="inbox-button"]');
    const toggle = await boxOf(page, '[data-testid="lang-toggle"]');
    expect(button.x + button.width).toBeLessThanOrEqual(toggle.x + 1);
    expect(button.width).toBeGreaterThanOrEqual(44);
    expect(button.height).toBeGreaterThanOrEqual(44);
  });
});

test.describe('Unread badge (Teams-style)', () => {
  for (const width of [1280, 375]) {
    test(`badge contract at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 720 });
      await setFakeToken(page);
      await mockListsPage(page);
      await mockInbox(page, { unread: 6 });
      await page.goto('/dashboard/lists');

      const badge = page.getByTestId('inbox-badge');
      await expect(badge).toHaveText('6');

      // A perfect circle for a single digit.
      const box = await boxOf(page, '[data-testid="inbox-badge"]');
      expect(Math.round(box.width)).toBe(18);
      expect(Math.round(box.height)).toBe(18);

      await expect(badge).toHaveCSS('background-color', DESTRUCTIVE);
      await expect(badge).toHaveCSS('color', WHITE);
      const weight = await badge.evaluate((el) => Number(getComputedStyle(el).fontWeight));
      expect(weight).toBeGreaterThanOrEqual(700);

      // Overlaps the glyph's top-right corner: boxes intersect, badge centre is
      // above and to the right of the glyph centre.
      const glyph = await boxOf(page, '[data-testid="inbox-button"] svg');
      expect(box.x).toBeLessThan(glyph.x + glyph.width);
      expect(box.x + box.width).toBeGreaterThan(glyph.x);
      expect(box.y).toBeLessThan(glyph.y + glyph.height);
      expect(box.y + box.height).toBeGreaterThan(glyph.y);
      expect(box.x + box.width / 2).toBeGreaterThan(glyph.x + glyph.width / 2);
      expect(box.y + box.height / 2).toBeLessThan(glyph.y + glyph.height / 2);

      // Nothing in the header clips or covers it.
      const viewport = page.viewportSize()!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      const onTop = await page.evaluate(([cx, cy]) => {
        const el = document.elementFromPoint(cx as number, cy as number);
        return !!el?.closest('[data-testid="inbox-button"]');
      }, [box.x + box.width / 2, box.y + box.height / 2]);
      expect(onTop).toBe(true);

      // The count lives in the accessible name; the badge itself is decorative.
      await expect(badge).toHaveAttribute('aria-hidden', 'true');
      const label = await page.getByTestId('inbox-button').getAttribute('aria-label');
      expect(label).toContain('6');
    });
  }

  test('is hidden at zero', async ({ page }) => {
    await setFakeToken(page);
    await mockListsPage(page);
    await mockInbox(page, { unread: 0 });
    await page.goto('/dashboard/lists');
    await expect(page.getByTestId('inbox-button')).toBeVisible();
    await expect(page.getByTestId('inbox-badge')).toHaveCount(0);
    const label = await page.getByTestId('inbox-button').getAttribute('aria-label');
    expect(label).not.toMatch(/\d/);
  });

  test('two digits render as a pill, not a circle', async ({ page }) => {
    await setFakeToken(page);
    await mockListsPage(page);
    await mockInbox(page, { unread: 42 });
    await page.goto('/dashboard/lists');
    await expect(page.getByTestId('inbox-badge')).toHaveText('42');
    const box = await boxOf(page, '[data-testid="inbox-badge"]');
    expect(box.width).toBeGreaterThan(box.height);
  });

  test('caps at 99+', async ({ page }) => {
    await setFakeToken(page);
    await mockListsPage(page);
    await mockInbox(page, { unread: 120 });
    await page.goto('/dashboard/lists');
    await expect(page.getByTestId('inbox-badge')).toHaveText('99+');
  });
});

test.describe('Dropdown', () => {
  test('lists messages and "All messages" navigates to the inbox', async ({ page }) => {
    await setFakeToken(page);
    await mockListsPage(page);
    await mockInbox(page, { items: [item(1), item(2)] });
    await page.goto('/dashboard/lists');

    await page.getByTestId('inbox-button').click();
    await expect(page.getByTestId('inbox-dropdown-item')).toHaveCount(2);
    await expect(page.getByTestId('inbox-dropdown-item').first()).toContainText('Сообщение 1');

    await page.getByTestId('inbox-all-messages').click();
    await expect(page).toHaveURL(/\/dashboard\/inbox/);
  });

  test('stays within the viewport on mobile (issue #176)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 720 });
    await setFakeToken(page);
    await mockListsPage(page);
    await mockInbox(page, { items: [item(1), item(2)] });
    await page.goto('/dashboard/lists');

    await page.getByTestId('inbox-button').click();
    const box = await boxOf(page, '[data-testid="inbox-dropdown"]');
    const viewport = page.viewportSize()!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  });

  test('empty inbox shows the empty message, not a blank dropdown', async ({ page }) => {
    await setFakeToken(page);
    await mockListsPage(page);
    await mockInbox(page, { items: [] });
    await page.goto('/dashboard/lists');

    await page.getByTestId('inbox-button').click();
    await expect(page.getByTestId('inbox-dropdown-empty')).toBeVisible();
    await expect(page.getByTestId('inbox-dropdown-empty')).toHaveText('Нет сообщений');
    await expect(page.getByTestId('inbox-dropdown-item')).toHaveCount(0);
  });

  test('a failed fetch shows a load-error message, not a blank dropdown', async ({ page }) => {
    await setFakeToken(page);
    await mockListsPage(page);
    // One handler for the whole /me/inbox* pattern (see mockInbox's own comment above):
    // registering this alongside mockInbox would overlap and the latest route wins.
    await page.route('**/api/me/inbox**', async (route) => {
      const url = route.request().url();
      if (url.includes('/unread-count')) return route.fulfill({ json: { unread: 0 } });
      return route.fulfill({ status: 500, json: { detail: 'boom' } });
    });
    await page.goto('/dashboard/lists');

    await page.getByTestId('inbox-button').click();
    await expect(page.getByTestId('inbox-dropdown-empty')).toBeVisible();
    await expect(page.getByTestId('inbox-dropdown-empty')).toHaveText('Не удалось загрузить сообщения');
  });

  test('reopening within 60s does not refetch the list', async ({ page }) => {
    await setFakeToken(page);
    await mockListsPage(page);
    await mockInbox(page, { items: [item(1)] });
    await page.goto('/dashboard/lists');

    await page.getByTestId('inbox-button').click();
    await expect(page.getByTestId('inbox-dropdown-item')).toHaveCount(1);

    let listCalls = 0;
    page.on('request', (r) => {
      if (/\/me\/inbox\?/.test(r.url())) listCalls += 1;
    });
    await page.getByTestId('inbox-button').click();      // close
    await page.getByTestId('inbox-button').click();      // reopen
    await expect(page.getByTestId('inbox-dropdown-item')).toHaveCount(1);
    expect(listCalls).toBe(0);
  });
});

test.describe('Request avoidance', () => {
  test('a client-side navigation fires no unread-count request', async ({ page }) => {
    await setFakeToken(page);
    await mockListsPage(page);
    await mockInbox(page, { unread: 3 });
    await page.route('**/api/articles', (route) => route.fulfill({ json: [] }));
    await page.goto('/dashboard/lists');
    await expect(page.getByTestId('inbox-badge')).toHaveText('3');

    let countCalls = 0;
    page.on('request', (r) => {
      if (r.url().includes('/me/inbox/unread-count')) countCalls += 1;
    });
    await page.getByRole('link', { name: 'Статьи' }).first().click();
    await expect(page).toHaveURL(/\/dashboard\/articles/);
    await expect(page.getByTestId('inbox-badge')).toHaveText('3');
    expect(countCalls).toBe(0);
  });

  test('marking read on the inbox page decrements the badge with no count request', async ({ page }) => {
    await setFakeToken(page);
    await mockListsPage(page);
    await mockInbox(page, { items: [item(1), item(2)] });
    await page.goto('/dashboard/inbox');
    await expect(page.getByTestId('inbox-badge')).toHaveText('2');

    let countCalls = 0;
    page.on('request', (r) => {
      if (r.url().includes('/me/inbox/unread-count')) countCalls += 1;
    });
    await page.getByTestId('inbox-mark-all').click();
    await expect(page.getByTestId('inbox-badge')).toHaveCount(0);
    expect(countCalls).toBe(0);
  });
});

test.describe('Message view', () => {
  test('renders the CTA href and Reply prefills the feedback modal', async ({ page }) => {
    await setFakeToken(page);
    await mockListsPage(page);
    await mockInbox(page, {
      items: [item(7)],
      detail: { cta_url: '/pricing', cta_label_ru: 'Premium', cta_label_en: 'Premium' },
    });
    await page.goto('/dashboard/inbox?m=7');

    // Next's `trailingSlash` rewrites the href, so match the path, not the exact string.
    await expect(page.getByTestId('inbox-cta')).toHaveAttribute('href', /^\/pricing\/?$/);

    await page.getByTestId('inbox-reply').click();
    await expect(page.getByTestId('feedback-message')).toHaveValue(/^Re: Сообщение 7/);
    await expect(page.getByTestId('feedback-email')).toHaveValue('test@test.com');
  });
});
