import { test, expect, type Page } from '@playwright/test';
import { makeFakeJwt } from './helpers/grammarBento';

// #62f — «Прилагательные» grammar program. Fully mocked (the local backend shares the
// production DB). Every test also saves its evidence screenshot (RU/EN × 1280/375).

const SHOTS = '../temp_files/screenshots/plan_62f_grammar-adjectives';
const CASES = ['Vardininkas', 'Kilmininkas', 'Naudininkas', 'Galininkas', 'Įnagininkas', 'Vietininkas'];
const RU = ['именительный', 'родительный', 'дательный', 'винительный', 'творительный', 'местный'];
const EN = ['nominative', 'genitive', 'dative', 'accusative', 'instrumental', 'locative'];

const CONFIG = {
  lessons: [] as unknown[],
  cases: {
    '1': ['Vardininkas', 'Vienaskaita'],
    ...Object.fromEntries(CASES.map((c, i) => [String(21 + i), [`Būdvardžiai: ${c}`, 'Būdvardžiai']])),
  },
};

const PROGRAMS = [
  { id: 1, title: 'Литовские падежи', title_en: 'Lithuanian Cases', description: 'Падежи существительных.',
    description_en: 'Noun cases.', difficulty: 1, lesson_filter: '["Vienaskaita","Daugiskaita"]', program_type: 'cases', is_public: true },
  { id: 9, title: 'Прилагательные', title_en: 'Adjectives',
    description: 'Согласование прилагательных с существительными в шести падежах: šiltas paltas, šiltos arbatos, šiltame name.',
    description_en: 'Adjective–noun agreement in six cases: šiltas paltas, šiltos arbatos, šiltame name.',
    difficulty: 2, lesson_filter: '["Būdvardžiai"]', program_type: 'cases', is_public: false },
];

const KILM_RULE = {
  name_ru: 'Прилагательные: родительный падеж', name_en: 'Adjectives: genitive',
  question: 'Kokio? Kokios? Kokių? (Какого? Какой? Каких?)', question_en: 'Kokio? Kokios? Kokių? (Of what kind?)',
  usage: 'Прилагательное стоит в том же роде, числе и падеже, что и существительное. Родительный нужен после nėra, neturiu, reikia, daug, be, iš, prie, po, nuo и при отрицании: Man reikia šiltos striukės.',
  usage_en: 'The adjective takes the gender, number and case of its noun. The genitive follows nėra, neturiu, reikia, daug, be, iš, prie, po, nuo and negation: Man reikia šiltos striukės.',
  transform: 'geras → gero / geros · žalias → žalio / žalios · gražus → gražaus / gražios · didelis → didelio / didelės',
  transform_en: 'geras → gero / geros · žalias → žalio / žalios · gražus → gražaus / gražios · didelis → didelio / didelės',
  endings_sg: 'м.р.: ‑o, ‑io, ‑aus / ж.р.: ‑os, ‑ios, ‑ės', endings_pl: 'м.р. и ж.р.: ‑ų, ‑ių',
  endings_sg_en: 'm.: ‑o, ‑io, ‑aus / f.: ‑os, ‑ios, ‑ės', endings_pl_en: 'm. and f.: ‑ų, ‑ių',
  article_slug: 'būdvardžiai-linksniavimas', article_title_ru: 'Прилагательные: склонение', article_title_en: 'Adjectives: declension',
};

const rule = (i: number) => (i === 1 ? KILM_RULE : {
  ...KILM_RULE, name_ru: `Прилагательные: ${RU[i]} падеж`, name_en: `Adjectives: ${EN[i]}`,
});

const LESSONS = [
  { id: 1, title: 'Vardininkas Vns.', level: 'basic', cases: [1], task_count: 24, rules: [], is_locked: false, best_score_pct: null },
  ...CASES.flatMap((c, i) => (['basic', 'advanced', 'practice'] as const).map((level, j) => ({
    id: 106 + 6 * i + j, title: `Būdvardžiai: ${c}`, level, cases: [21 + i],
    task_count: [24, 35, 20][j], rules: [rule(i)], is_locked: false, best_score_pct: null,
  }))),
];

const instr = (pick: boolean) => ({
  instruction_ru: `${pick ? 'Выбери' : 'Впиши'} правильную форму прилагательного: родительный падеж`,
  instruction_en: `${pick ? 'Pick' : 'Type'} the right form of the adjective: genitive`,
});
const TASKS: Record<number, unknown[]> = {
  112: [{ type: 'sentence', display: 'Ji nori išgerti ___ pieno.', answer: 'šilto', full_answer: 'šilto',
    options: ['šiltą', 'šilto', 'šiltų', 'šiltam'], translation_ru: 'Она хочет выпить тёплого молока.',
    translation_en: 'She wants to drink some warm milk.', base_lt: 'šiltas', ...instr(true) }],
  113: [{ type: 'sentence', display: 'Aš nemėgstu šalt___ kavos.', answer: 'os', full_answer: 'šaltos',
    translation_ru: 'Я не люблю холодный кофе.', translation_en: "I don't like cold coffee.", base_lt: 'šaltas', ...instr(false) }],
  114: [{ type: 'sentence', display: 'Prašau ___ arbatos.', answer: 'juodos', full_answer: 'juodos',
    translation_ru: 'Чёрного чая, пожалуйста.', translation_en: 'Black tea, please.', base_lt: 'juodas', ...instr(false) }],
};

async function mock(page: Page, o: { lang: 'ru' | 'en'; width: number; enrolled: number[] }) {
  const calls: string[] = [];
  await page.addInitScript(([token, lang]) => {
    localStorage.setItem('fluent_token', token);
    localStorage.setItem('fluent_lang', lang);
    localStorage.setItem('cookie_consent', 'accepted');
  }, [makeFakeJwt(), o.lang] as const);
  await page.setViewportSize({ width: o.width, height: 900 });
  await page.route('**/api/**', (r) => r.fulfill({ json: [] }));
  await page.route('**/api/billing/config', (r) => r.fulfill({ json: { enabled: true } }));
  await page.route('**/api/me/quota', (r) => r.fulfill({ json: {
    is_premium: false, premium_active: false, premium_until: null, sessions_today: 0,
    daily_limit: 10, is_admin: true, is_superadmin: false } }));
  await page.route('**/api/admin/grammar/config', (r) => r.fulfill({ json: CONFIG }));
  await page.route('**/api/grammar-programs', (r) =>
    r.fulfill({ json: PROGRAMS.map((p) => ({ ...p, enrolled: o.enrolled.includes(p.id) })) }));
  await page.route('**/api/grammar/lessons', (r) => r.fulfill({ json: LESSONS }));
  await page.route(/\/api\/grammar\/lessons\/\d+\/tasks/, (r) => {
    const id = Number(new URL(r.request().url()).pathname.split('/')[4]);
    return r.fulfill({ json: TASKS[id] ?? [] });
  });
  await page.route(/\/api\/grammar\/lessons\/\d+\/results/, (r) => r.fulfill({ json: { ok: true } }));
  await page.route('**/api/me/grammar-programs/*', (r) => {
    calls.push(`${r.request().method()} ${new URL(r.request().url()).pathname}`);
    return r.fulfill({ json: { ok: true } });
  });
  return calls;
}

async function openProgram(page: Page) {
  await page.goto('/dashboard/grammar');
  await page.getByTestId('category-program-9').click();
  await expect(page.getByTestId('topics-section')).toBeVisible();
}

// Kilmininkas = 2nd topic → its basic/advanced/practice level buttons are 3, 4, 5.
async function startLevel(page: Page, n: number) {
  await openProgram(page);
  await page.getByTestId('topics-section').getByTestId('level-button').nth(n).click();
  await expect(page.getByTestId('task-counter')).toBeVisible();
}

for (const lang of ['ru', 'en'] as const) {
  for (const width of [1280, 375]) {
    const tag = `${lang}-${width}`;
    test.describe(`#62f adjectives — ${tag}`, () => {
      test('program card and topic list', async ({ page }) => {
        await mock(page, { lang, width, enrolled: [9] });
        await openProgram(page);
        const featured = page.getByTestId('featured-card');
        await expect(featured).toContainText(lang === 'ru' ? 'Прилагательные' : 'Adjectives');
        await featured.screenshot({ path: `${SHOTS}/1-program-card-${tag}.png` });
        const topics = page.getByTestId('topics-section');
        await expect(topics.getByTestId('level-button')).toHaveCount(18);
        await expect(topics).toContainText(lang === 'ru' ? 'Прилагательные: склонение' : 'Adjectives: declension');
        await topics.screenshot({ path: `${SHOTS}/2-topic-list-${tag}.png` });
      });

      test('basic task: 4 forms of one adjective and the «от: šiltas» hint', async ({ page }) => {
        await mock(page, { lang, width, enrolled: [9] });
        await startLevel(page, 3);
        await expect(page.getByTestId('grammar-options').getByRole('button')).toHaveCount(4);
        await expect(page.locator(`text=/${lang === 'ru' ? 'от' : 'from'}:\\s*šiltas/`)).toBeVisible();
        await expect(page.getByTestId('task-instruction')).toHaveText(lang === 'ru'
          ? 'Выбери правильную форму прилагательного: родительный падеж'
          : 'Pick the right form of the adjective: genitive');
        await page.screenshot({ path: `${SHOTS}/3-basic-${tag}.png`, fullPage: true });
      });

      test('advanced task with the rule card open', async ({ page }) => {
        await mock(page, { lang, width, enrolled: [9] });
        await startLevel(page, 4);
        await expect(page.locator('input[type="text"]')).toBeVisible();
        await page.getByRole('button', { name: lang === 'ru' ? 'Грамматическая подсказка' : 'Grammar hint' }).click();
        await expect(page.getByText(lang === 'ru' ? 'Прилагательные: родительный падеж' : 'Adjectives: genitive')).toBeVisible();
        await page.screenshot({ path: `${SHOTS}/4-advanced-${tag}.png`, fullPage: true });
      });

      test('practice task, then a wrong answer', async ({ page }) => {
        await mock(page, { lang, width, enrolled: [9] });
        await startLevel(page, 5);
        await expect(page.locator(`text=/${lang === 'ru' ? 'от' : 'from'}:\\s*juodas/`)).toBeVisible();
        await page.screenshot({ path: `${SHOTS}/5-practice-${tag}.png`, fullPage: true });
        await page.locator('input[type="text"]').fill('juodas');
        await page.locator('input[type="text"]').press('Enter');
        await expect(page.getByTestId('dismiss-wrong')).toBeVisible();
        await expect(page.getByText('juodos').first()).toBeVisible();
        await page.screenshot({ path: `${SHOTS}/6-wrong-${tag}.png`, fullPage: true });
      });

      test('admin lesson-filter select gains «Būdvardžiai», keeps the 5 old options', async ({ page }) => {
        await mock(page, { lang, width, enrolled: [] });
        await page.addInitScript(() => {
          const p = btoa(JSON.stringify({ email: 'test@test.com', name: 'Admin', is_admin: true, exp: 9999999999 }));
          localStorage.setItem('fluent_token', `${btoa('{"alg":"HS256"}')}.${p}.sig`);
        });
        await page.route('**/api/admin/grammar/programs', (r) => r.fulfill({ json: PROGRAMS }));
        await page.goto('/dashboard/admin/grammar');
        await page.getByRole('button', { name: lang === 'ru' ? '+ Добавить' : '+ Add', exact: true }).click();
        const select = page.locator('select').filter({ has: page.locator(`option[value='["Skaičiai"]']`) });
        const values = await select.locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
        expect(values).toEqual(['', '["Vienaskaita","Daugiskaita"]', '["Vienaskaita"]', '["Daugiskaita"]', '["Skaičiai"]', '["Būdvardžiai"]']);
        await select.selectOption('["Būdvardžiai"]');
        await page.screenshot({ path: `${SHOTS}/7-admin-filter-${tag}.png`, fullPage: true });
      });
    });
  }
}

test('hero «Начать с падежей» still enrolls «Литовские падежи»', async ({ page }) => {
  const calls = await mock(page, { lang: 'ru', width: 1280, enrolled: [] });
  await page.goto('/dashboard/grammar');
  await page.getByTestId('hero-start-cases').click();
  await expect.poll(() => calls).toContain('POST /api/me/grammar-programs/1');
  expect(calls).not.toContain('POST /api/me/grammar-programs/9');
});
