// #48c — indexable English articles: /en/dashboard/articles/ and /en/dashboard/articles/<slug>/.
// Runs against the backend serving the built out/ (PW_BASE_URL); the build-output block reads out/.
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { localHref } from '../lib/localHref';

const SLUG = 'verb-intro'; // a published article with an English version, prerendered in the build
const LT_SLUG = 'būdvardžiai-linksniavimas';
const LT_ENC = 'b%C5%ABdvard%C5%BEiai-linksniavimas';
const SITE = 'https://fluent.lt';
const OUT = path.join(__dirname, '..', 'out');

async function apiArticle(page: Page, slug: string) {
  const r = await page.request.get(`/api/articles/${encodeURIComponent(slug)}`);
  expect(r.ok()).toBeTruthy();
  return r.json();
}

function headLinks(html: string) {
  const head = html.split('</head>')[0];
  const canonical = head.match(/<link rel="canonical" href="([^"]*)"/)?.[1];
  const hreflang: Record<string, string> = {};
  for (const m of head.matchAll(/<link rel="alternate" hrefLang="([^"]*)" href="([^"]*)"/g)) hreflang[m[1]] = m[2];
  return { canonical, hreflang };
}

const storeLang = (page: Page, lang: string) =>
  page.addInitScript((l) => localStorage.setItem('fluent_lang', l), lang);
const storedLang = (page: Page) => page.evaluate(() => localStorage.getItem('fluent_lang'));

test.describe('#48c EN article routes', () => {
  test('EN article prerenders English and a stored RU choice does not flip it', async ({ page }) => {
    const a = await apiArticle(page, SLUG);
    const html = await (await page.request.get(`/en/dashboard/articles/${SLUG}/`)).text();
    expect(html).toContain(`>${a.title_en}</h1>`);
    expect(html).not.toContain(`>${a.title_ru}</h1>`);
    const firstEnLine = a.body_en.split('\n').find((l: string) => /^[A-Za-z]/.test(l.trim()))!.trim().slice(0, 30);
    expect(html).toContain(firstEnLine);

    await storeLang(page, 'ru');
    await page.goto(`/en/dashboard/articles/${SLUG}/`);
    await expect(page.locator('h1')).toHaveText(a.title_en);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('landing on /en/ stores en only when nothing was stored', async ({ page }) => {
    await page.goto('/en/dashboard/articles/');
    await expect.poll(() => storedLang(page)).toBe('en');
  });

  test('landing on /en/ keeps a stored ru choice', async ({ page }) => {
    await storeLang(page, 'ru');
    await page.goto('/en/dashboard/articles/');
    await expect(page.locator('h1').first()).toBeVisible();
    expect(await storedLang(page)).toBe('ru');
  });

  test('EN index links stay under /en/, category chip keeps /en/', async ({ page }) => {
    await page.goto('/en/dashboard/articles/');
    const hrefs = await page.locator('a[href*="/dashboard/articles/"]').evaluateAll((els) =>
      els.map((e) => e.getAttribute('href')!),
    );
    expect(hrefs.length).toBeGreaterThan(5);
    for (const h of hrefs) expect(h).toMatch(/^\/en\/dashboard\/articles\//);

    await page.getByTestId('category-learning_materials').click();
    await expect(page).toHaveURL(/\/en\/dashboard\/articles\/?\?category=learning_materials$/);
  });

  test('a slug not in the build loads via the placeholder; its links follow the twin rule', async ({ page }) => {
    const body = [
      'English body for the not-in-build article.',
      '',
      '[Other article](/dashboard/articles/verb-intro/) [Programs](/programs/regitra/) [Pricing](/pricing/)',
    ].join('\n');
    await page.route('**/api/articles/not-in-build-48c', (r) =>
      r.fulfill({
        json: {
          slug: 'not-in-build-48c', title_ru: 'Не в сборке', title_en: 'Not in build', body_ru: 'Русский текст',
          body_en: body, tags: [], category: 'blog', created_at: '2026-10-01T00:00:00', updated_at: '2026-10-01T00:00:00',
        },
      }),
    );
    await page.goto('/en/dashboard/articles/not-in-build-48c/');
    await expect(page.locator('h1')).toHaveText('Not in build');
    await expect(page.getByText('English body for the not-in-build article.')).toBeVisible();

    const main = page.locator('main');
    await expect(main.getByRole('link', { name: 'Back to articles' })).toHaveAttribute('href', /^\/en\/dashboard\/articles\/?$/);
    await expect(main.getByRole('link', { name: 'Other article' })).toHaveAttribute('href', '/en/dashboard/articles/verb-intro/');
    await expect(main.getByRole('link', { name: 'Programs' })).toHaveAttribute('href', '/programs/regitra/');
    await expect(main.getByRole('link', { name: 'Pricing' })).toHaveAttribute('href', '/pricing/');
  });

  const RU_ONLY = {
    slug: 'ru-only-48c', title_ru: 'Только по-русски', title_en: '', body_ru: 'Русский текст статьи',
    body_en: '', tags: [], category: 'blog', created_at: '2026-10-01T00:00:00', updated_at: '2026-10-01T00:00:00',
  };
  const mockRuOnly = (page: Page) => page.route('**/api/articles/ru-only-48c', (r) => r.fulfill({ json: RU_ONLY }));

  test('an EN article without body_en falls back to the Russian body', async ({ page }) => {
    await mockRuOnly(page);
    await page.goto('/en/dashboard/articles/ru-only-48c/');
    await expect(page.locator('h1')).toHaveText('Только по-русски');
    await expect(page.getByText('Русский текст статьи')).toBeVisible();
  });

  test('EN index links a RU-only article (has_en false) to its RU URL', async ({ page }) => {
    const summary = (slug: string, has_en: boolean) => ({
      slug, title_ru: `RU ${slug}`, title_en: `EN ${slug}`, has_en, tags: [], category: 'blog', theme: null,
      created_at: '2026-10-01T00:00:00',
    });
    await page.route('**/api/articles', (r) =>
      r.fulfill({ json: [summary('with-en-48c', true), summary('ru-only-48c', false)] }),
    );
    await page.goto('/en/dashboard/articles/');
    await expect(page.locator('a[href*="ru-only-48c"]').first()).toHaveAttribute('href', /^\/dashboard\/articles\/ru-only-48c\/?$/);
    await expect(page.locator('a[href*="with-en-48c"]').first()).toHaveAttribute('href', /^\/en\/dashboard\/articles\/with-en-48c\/?$/);
  });

  test('EN footer links a RU-only footer article (has_en false) to its RU URL', async ({ page }) => {
    const item = (slug: string, has_en: boolean) => ({ slug, title_ru: `RU ${slug}`, title_en: `EN ${slug}`, has_en });
    await page.route('**/api/footer-articles', (r) =>
      r.fulfill({ json: [item('ft-with-en-48c', true), item('ft-ru-only-48c', false)] }),
    );
    await page.goto('/en/dashboard/articles/');
    const footer = page.locator('footer');
    await expect(footer.locator('a[href*="ft-ru-only-48c"]')).toHaveAttribute('href', /^\/dashboard\/articles\/ft-ru-only-48c\/?$/);
    await expect(footer.locator('a[href*="ft-with-en-48c"]')).toHaveAttribute('href', /^\/en\/dashboard\/articles\/ft-with-en-48c\/?$/);
  });

  test('toggle on a RU-only article never sends it to /en/', async ({ page }) => {
    await mockRuOnly(page);
    await page.goto('/dashboard/articles/ru-only-48c/'); // nothing stored → RU UI
    await expect(page.locator('h1')).toHaveText('Только по-русски');
    await page.getByTestId('lang-toggle').click(); // ru → en: no twin, so just reload in place
    await page.waitForLoadState('load');
    await expect(page.locator('h1')).toHaveText('Только по-русски');
    await expect(page).toHaveURL(/\/\/[^/]+\/dashboard\/articles\/ru-only-48c\/$/);
    expect(await storedLang(page)).toBe('en');

    await page.goto('/en/dashboard/articles/ru-only-48c/'); // reached anyway: the toggle leaves /en/
    await expect(page.locator('h1')).toHaveText('Только по-русски');
    await page.getByTestId('lang-toggle').click();
    await expect(page).toHaveURL(/\/\/[^/]+\/dashboard\/articles\/ru-only-48c\/$/);
  });

  test('Header: Articles goes to /en/, other nav stays RU, pill active, UI stays EN after leaving', async ({ page }) => {
    await page.goto('/en/dashboard/articles/');
    const nav = page.locator('header nav');
    const articles = nav.getByRole('link', { name: 'Articles' });
    await expect(articles).toHaveAttribute('href', /^\/en\/dashboard\/articles\/?$/);
    await expect(articles).toHaveClass(/font-semibold/);
    for (const [name, href] of [['Dictionaries', '/dashboard/lists'], ['Grammar', '/dashboard/grammar'], ['Pricing', '/pricing']]) {
      await expect(nav.getByRole('link', { name })).toHaveAttribute('href', new RegExp(`^${href}/?$`));
    }
    await nav.getByRole('link', { name: 'Grammar' }).click();
    await expect(page).toHaveURL(/\/dashboard\/grammar\/?$/);
    await expect(page.locator('header nav').getByRole('link', { name: 'Grammar' })).toBeVisible();
    expect(await storedLang(page)).toBe('en');
  });

  test('toggle goes RU <-> EN twin on an article and on the index', async ({ page }) => {
    await page.goto(`/en/dashboard/articles/${SLUG}/`);
    await page.getByTestId('lang-toggle').click();
    await expect(page).toHaveURL(new RegExp(`^[^?]*//[^/]+/dashboard/articles/${SLUG}/$`));
    await page.getByTestId('lang-toggle').click();
    await expect(page).toHaveURL(new RegExp(`/en/dashboard/articles/${SLUG}/$`));

    await page.goto('/dashboard/articles/');
    await page.getByTestId('lang-toggle').click(); // stored en → ru, stays on RU index
    await expect(page).toHaveURL(/\/\/[^/]+\/dashboard\/articles\/$/);
    await page.getByTestId('lang-toggle').click();
    await expect(page).toHaveURL(/\/en\/dashboard\/articles\/$/);
  });

  test('toggle on a page without a twin just reloads', async ({ page }) => {
    await page.goto('/dashboard/lists/');
    await page.getByTestId('lang-toggle').click();
    await page.waitForLoadState('load');
    await expect(page).toHaveURL(/\/\/[^/]+\/dashboard\/lists\/$/);
    expect(await storedLang(page)).toBe('en');
  });

  test('EN and RU twins carry a self-canonical and the same hreflang set', async ({ page }) => {
    for (const [ruPath, enPath] of [
      ['/dashboard/articles/', '/en/dashboard/articles/'],
      [`/dashboard/articles/${SLUG}/`, `/en/dashboard/articles/${SLUG}/`],
      [`/dashboard/articles/${LT_ENC}/`, `/en/dashboard/articles/${LT_ENC}/`],
    ]) {
      const ru = headLinks(await (await page.request.get(ruPath)).text());
      const en = headLinks(await (await page.request.get(enPath)).text());
      const set = { ru: SITE + ruPath, en: SITE + enPath, 'x-default': SITE + ruPath };
      expect(ru.canonical).toBe(SITE + ruPath);
      expect(en.canonical).toBe(SITE + enPath);
      expect(ru.hreflang).toEqual(set);
      expect(en.hreflang).toEqual(set);
    }
  });

  test('sitemap encodes the Lithuanian slug byte-for-byte like the pages', async ({ page }) => {
    const xml = await (await page.request.get('/sitemap.xml')).text();
    const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
    const pathOf = (u: string) => u.replace(/^https?:\/\/[^/]+/, '');
    expect(locs.map(pathOf)).toContain(`/dashboard/articles/${LT_ENC}/`);
    expect(locs.map(pathOf)).toContain(`/en/dashboard/articles/${LT_ENC}/`);
    const hrefs = [...xml.matchAll(/<xhtml:link [^>]*href="([^"]*)"/g)].map((m) => pathOf(m[1]));
    expect(hrefs).toContain(`/en/dashboard/articles/${LT_ENC}/`);
    expect(xml).not.toContain(LT_SLUG);
  });

  test('localHref: exact-match twin rule', () => {
    for (const p of ['/dashboard/articles/', '/dashboard/articles', `/dashboard/articles/${SLUG}/`, '/dashboard/articles/?category=x']) {
      expect(localHref(p, true)).toBe(`/en${p}`);
      expect(localHref(p, false)).toBe(p);
    }
    for (const p of ['/', '/pricing/', '/programs/', '/programs/regitra/', '/programs/custom/abc123',
      '/dashboard/lists/', '/dashboard/phrases/12/', '/dashboard/practice/', '/dashboard/articles/a/b/',
      '/dashboard/articlesx/']) {
      expect(localHref(p, true)).toBe(p);
    }
  });
});

test.describe('#48c build output', () => {
  const read = (p: string) => fs.readFileSync(path.join(OUT, p), 'utf8');

  test('out/en holds only the article index and articles', () => {
    expect(fs.existsSync(path.join(OUT, 'en/dashboard/articles/index.html'))).toBe(true);
    expect(fs.existsSync(path.join(OUT, `en/dashboard/articles/${SLUG}/index.html`))).toBe(true);
    expect(fs.existsSync(path.join(OUT, `en/dashboard/articles/${LT_SLUG}/index.html`))).toBe(true);
    const files = fs.readdirSync(path.join(OUT, 'en'), { recursive: true }) as string[];
    for (const f of files) expect(f.split(path.sep).join('/')).toMatch(/^dashboard(\/articles(\/.*)?)?$/);
  });

  for (const [file, url] of [
    ['en/dashboard/articles/index.html', `${SITE}/en/dashboard/articles/`],
    [`en/dashboard/articles/${SLUG}/index.html`, `${SITE}/en/dashboard/articles/${SLUG}/`],
    [`en/dashboard/articles/${LT_SLUG}/index.html`, `${SITE}/en/dashboard/articles/${LT_ENC}/`],
  ]) {
    test(`${file}: EN title, self-canonical, hreflang, html lang=en`, () => {
      const html = read(file);
      expect(html).toContain('<html lang="en"');
      const title = html.match(/<title>([^<]*)<\/title>/)![1];
      expect(title).not.toMatch(/[А-Яа-яЁё]/);
      const { canonical, hreflang } = headLinks(html);
      expect(canonical).toBe(url);
      expect(hreflang.en).toBe(url);
      expect(hreflang.ru).toBe(url.replace('/en/', '/'));
      expect(hreflang['x-default']).toBe(hreflang.ru);
    });
  }

  test('RU placeholder and other RU pages carry no hreflang', () => {
    for (const f of ['dashboard/articles/_/index.html', 'en/dashboard/articles/_/index.html', 'dashboard/lists/index.html', 'index.html']) {
      expect(Object.keys(headLinks(read(f)).hreflang)).toEqual([]);
    }
  });
});
