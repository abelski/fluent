import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { USUAL, mockHome } from './helpers/effortRadar';
import { makeFakeJwt } from './helpers/grammarBento';
import { openAutoSend } from './helpers/adminAutoSend';

// Plan #57 — evidence screenshots: radar info button, settings balance-tips checkbox,
// inbox balance tip with in-app links (RU/EN × 1280/375), admin auto-send block (1280).
// Fully mocked; the inbox bodies are balance_service.build_copy output.

const DIR = path.join(__dirname, '..', '..', 'temp_files', 'screenshots', 'plan_57_balance-nudge');

async function shot(page: Page, name: string) {
  await page.waitForTimeout(300);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'horizontal overflow').toBeLessThanOrEqual(0);
  await page.screenshot({ path: path.join(DIR, `${name}.png`), fullPage: true, animations: 'disabled' });
}

async function signedIn(page: Page, lang: 'ru' | 'en', width: number) {
  await page.addInitScript(([token, l]) => {
    localStorage.setItem('fluent_token', token);
    localStorage.setItem('fluent_lang', l);
    localStorage.setItem('cookie_consent', 'accepted');
  }, [makeFakeJwt(), lang] as const);
  await page.setViewportSize({ width, height: 900 });
  await page.route('**/api/**', (r) => r.fulfill({ json: [] }));
  await page.route('**/api/billing/config', (r) => r.fulfill({ json: { enabled: true } }));
  await page.route('**/api/me/quota', (r) => r.fulfill({ json: {
    is_premium: false, premium_active: false, premium_until: null, sessions_today: 0, daily_limit: 10, is_admin: false } }));
  await page.route('**/api/me/stats', (r) => r.fulfill({ json: { known: 180, streak: 6, mistakes: 0, due_review: 0 } }));
}

const BODY = {
  ru: 'За 14 дней: слова 100%, фразы 0%, грамматика 0%.\n\nГрамматика: ни одного урока за две недели, а вы уже знаете больше 150 слов — самое время связывать их в предложения.\nФразы: ни одной за две недели. Готовые фразы помогают заговорить быстрее, чем отдельные слова.\n\nПочему баланс важен: https://fluent.lt/dashboard/articles/how-to-learn-lithuanian-order/\n\nНе хотите такие советы? Отключить в настройках: https://fluent.lt/dashboard/settings/?tab=other',
  en: "Last 14 days: words 100%, phrases 0%, grammar 0%.\n\nGrammar: no lessons in two weeks, and you already know over 150 words — the right time to start putting them into sentences.\nPhrases: none in two weeks. Ready-made phrases get you speaking faster than single words.\n\nWhy balance matters: https://fluent.lt/dashboard/articles/how-to-learn-lithuanian-order/\n\nDon't want these tips? Turn them off in Settings: https://fluent.lt/dashboard/settings/?tab=other",
};

for (const lang of ['ru', 'en'] as const) {
  for (const width of [1280, 375]) {
    test(`radar info ${lang} ${width}`, async ({ page }) => {
      await mockHome(page, USUAL, { lang, width });
      await page.goto('/');
      const info = page.getByTestId('effort-info');
      await expect(info).toBeVisible();
      await info.focus();                                    // focus ring shows the tap target
      await shot(page, `radar-info-${lang}-${width}`);
      await page.getByTestId('effort-radar').screenshot({
        path: path.join(DIR, `radar-card-${lang}-${width}.png`), animations: 'disabled' });
    });

    test(`settings other ${lang} ${width}`, async ({ page }) => {
      await signedIn(page, lang, width);
      await page.route('**/api/me/settings', (r) => r.fulfill({ json: {
        words_per_session: 10, new_words_ratio: 0.7, lesson_mode: 'thorough', use_question_timer: false,
        question_timer_seconds: 5, email_consent: true, lang, balance_tips: true } }));
      await page.route('**/api/me/phrases-settings', (r) => r.fulfill({ json: { phrases_per_session: 10, new_phrases_ratio: 0.3 } }));
      await page.route('**/api/me/continue-settings', (r) => r.fulfill({ json: {
        continue_words_count: 3, continue_grammar_count: 3, continue_phrases_count: 3, continue_include_new: true } }));
      await page.goto('/dashboard/settings/?tab=other');
      await expect(page.getByTestId('balance-tips-checkbox')).toBeChecked();
      await shot(page, `settings-other-${lang}-${width}`);
    });

    test(`inbox balance tip ${lang} ${width}`, async ({ page }) => {
      await signedIn(page, lang, width);
      const base = {
        id: 5, kind: 'info', source: 'balance',
        title_ru: 'Пара направлений ждёт вас', title_en: 'A couple of directions are waiting for you',
        snippet_ru: BODY.ru.slice(0, 120), snippet_en: BODY.en.slice(0, 120),
        created_at: '2026-09-29T09:30:00', read: false,
      };
      await page.route('**/api/me/inbox**', async (route) => {
        const url = route.request().url();
        if (route.request().method() === 'POST') return route.fulfill({ json: { affected_ids: [5], unread: 0 } });
        if (url.includes('/unread-count')) return route.fulfill({ json: { unread: 1 } });
        if (/\/me\/inbox\/5/.test(url)) {
          return route.fulfill({ json: { item: { ...base, body_ru: BODY.ru, body_en: BODY.en,
            cta_label_ru: 'К грамматике', cta_label_en: 'Go to grammar', cta_url: '/dashboard/grammar' } } });
        }
        return route.fulfill({ json: { items: [base], has_more: false, unread: 1 } });
      });
      await page.goto('/dashboard/inbox?m=5');
      await expect(page.getByTestId('inbox-body-link')).toHaveCount(2);
      await expect(page.getByTestId('inbox-cta')).toBeVisible();
      await shot(page, `inbox-tip-${lang}-${width}`);
    });
  }

  test(`admin auto-send ${lang} 1280`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openAutoSend(page, lang);
    await page.getByTestId('autosend-block').scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.getByTestId('autosend-block').screenshot({
      path: path.join(DIR, `admin-autosend-${lang}-1280.png`), animations: 'disabled' });
  });
}
