// Shared helpers for the feature #5 word-session specs.
//
// The stage graph is driven entirely through the UI, so these helpers answer the
// question every one of those specs needs: "which exercise am I looking at right
// now?" — without coupling each spec to the individual prompt strings.

import { expect, type Page } from '@playwright/test';

// 'drill' is the '3s' syllable gap-fill that follows a typing miss — a distinct
// exercise, so specs that count exercises don't silently fold it into 'type'.
export type Stage = 'card' | 'select' | 'assemble' | 'type' | 'drill';

export function makeFakeJwt(): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name: 'Test User', exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

export const MOCK_SETTINGS = {
  words_per_session: 10,
  new_words_ratio: 0.7,
  lesson_mode: 'thorough',
  use_question_timer: false,
  question_timer_seconds: 5,
};

export interface MockWord {
  id: number;
  lithuanian: string;
  accented?: string | null;
  translation_ru: string;
  translation_en: string;
  hint: string | null;
  status?: string;
  mature?: boolean;
}

/** Routes every word-session spec needs. `review` also mocks the known-review pool. */
export async function mockStudy(
  page: Page,
  words: MockWord[],
  opts: { distractors?: MockWord[]; settings?: Record<string, unknown>; review?: boolean } = {},
) {
  const { distractors = [], settings = MOCK_SETTINGS, review = false } = opts;
  await page.addInitScript((t) => localStorage.setItem('fluent_token', t), makeFakeJwt());
  await page.route('**/api/lists/*/study**', (r) => r.fulfill({ json: { words, distractors } }));
  await page.route('**/api/me/settings', (r) => r.fulfill({ json: settings }));
  await page.route('**/api/words/*/progress', (r) => r.fulfill({ json: { ok: true } }));
  if (review) await page.route('**/api/review/known', (r) => r.fulfill({ json: words }));
}

// One probe per stage. `select` has two prompts because SELECT is a coin flip
// between the two multiple-choice directions.
const PROBES: [Stage, string][] = [
  ['card', 'text="Легко"'],
  ['select', 'text="Что это означает?"'],
  ['select', 'text="Выберите литовское слово"'],
  ['assemble', '[data-testid="syllable-tile-pool"]'],
  ['drill', 'text="Отработайте слог"'],
  ['type', 'text="Как будет по-литовски?"'],
];

async function probe(page: Page): Promise<Stage | null> {
  for (const [stage, selector] of PROBES) {
    if (await page.locator(selector).first().isVisible().catch(() => false)) return stage;
  }
  return null;
}

/** Which exercise is on screen right now, or null between cards. Does not wait. */
export async function currentStage(page: Page): Promise<Stage | null> {
  return probe(page);
}

/** Which exercise is on screen, once one settles. */
export async function stageOf(page: Page): Promise<Stage> {
  let found: Stage | null = null;
  await expect
    .poll(async () => (found = await probe(page)), { timeout: 7000 })
    .not.toBeNull();
  return found as unknown as Stage;
}

/**
 * Wait until a stage OTHER than `previous` is on screen.
 *
 * A correct answer holds the current card up for ~1.2s of feedback and then swaps
 * it, and during that swap no probe matches at all — so this must keep polling
 * through the null gap rather than treating "nothing visible" as a change.
 */
export async function stageAfter(page: Page, previous: Stage): Promise<Stage> {
  let found: Stage | null = null;
  await expect
    .poll(async () => {
      const seen = await probe(page);
      found = seen !== null && seen !== previous ? seen : null;
      return found;
    }, { timeout: 10000 })
    .not.toBeNull();
  return found as unknown as Stage;
}

/**
 * Wait for any exercise to appear, returning null if the session ended instead.
 * Used to drive a session to completion without knowing its length up front.
 */
export async function waitForAnyStage(page: Page, timeout = 4000): Promise<Stage | null> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const stage = await probe(page);
    if (stage !== null) return stage;
    await page.waitForTimeout(120);
  }
  return null;
}

/** The tiles currently offered on an assemble card, in presentation order. */
export async function tileTexts(page: Page): Promise<string[]> {
  const pool = page.getByTestId('syllable-tile-pool');
  await pool.waitFor({ timeout: 7000 });
  return (await pool.getByRole('button').allTextContents()).map((t) => t.trim());
}

export async function tileMode(page: Page): Promise<string | null> {
  const pool = page.getByTestId('syllable-tile-pool');
  await pool.waitFor({ timeout: 7000 });
  return pool.getAttribute('data-tile-mode');
}

/**
 * Click the offered tiles so they spell `target`. Greedy longest-first match, which
 * is enough for the fixtures here and keeps the helper independent of how the target
 * was fragmented (words / syllables / letters).
 */
export async function assembleTarget(page: Page, target: string, separator: string) {
  const pool = page.getByTestId('syllable-tile-pool');
  const tiles = await tileTexts(page);
  const wanted = separator === ' ' ? target.split(/\s+/) : [];
  const used = new Set<number>();

  const clickTile = async (text: string) => {
    const idx = tiles.findIndex((t, i) => !used.has(i) && t === text);
    if (idx < 0) throw new Error(`no tile "${text}" among [${tiles.join(', ')}]`);
    used.add(idx);
    await pool.getByRole('button').nth(idx).click();
  };

  if (separator === ' ') {
    for (const w of wanted) await clickTile(w);
    return;
  }
  let remaining = target;
  while (remaining.length > 0) {
    const candidates = tiles
      .map((t, i) => ({ t, i }))
      .filter(({ t, i }) => !used.has(i) && t.length > 0 && remaining.startsWith(t))
      .sort((a, b) => b.t.length - a.t.length);
    if (candidates.length === 0) throw new Error(`cannot spell "${remaining}" from [${tiles.join(', ')}]`);
    const pick = candidates[0];
    used.add(pick.i);
    await pool.getByRole('button').nth(pick.i).click();
    remaining = remaining.slice(pick.t.length);
  }
}

/**
 * Answer the '3s' drill. The card renders `before <input> after` inside one <p>, so
 * the syllable being asked for is whatever sits between them in the full word.
 */
export async function answerDrill(page: Page, word: MockWord) {
  const parts = await page.evaluate(() => {
    const input = document.querySelector('p input') as HTMLInputElement | null;
    if (!input) return null;
    const p = input.parentElement;
    if (!p) return null;
    let before = '';
    let after = '';
    let seen = false;
    for (const node of Array.from(p.childNodes)) {
      if (node === input) { seen = true; continue; }
      const text = node.textContent ?? '';
      if (seen) after += text; else before += text;
    }
    return { before, after };
  });
  if (parts === null) throw new Error('drill input not found');
  const syllable = word.lithuanian.slice(parts.before.length, word.lithuanian.length - parts.after.length);
  const input = page.locator('p input');
  await input.fill(syllable);
  await input.press('Enter');
}

/** Answer whichever exercise is on screen correctly. */
export async function answerCorrectly(page: Page, stage: Stage, word: MockWord, easy = false) {
  if (stage === 'card') {
    await page.getByText(easy ? 'Легко' : 'С трудом', { exact: true }).click();
    return;
  }
  if (stage === 'select') {
    const wanted = (await page.getByText('Что это означает?').isVisible().catch(() => false))
      ? word.translation_ru
      : word.lithuanian;
    await page.locator('.grid button', { hasText: new RegExp(`^${wanted}$`) }).first().click();
    return;
  }
  if (stage === 'assemble') {
    const mode = await tileMode(page);
    await assembleTarget(page, word.lithuanian, mode === 'word' ? ' ' : '');
    return;
  }
  if (stage === 'drill') {
    await answerDrill(page, word);
    return;
  }
  await page.locator('input[type="text"]').fill(word.lithuanian);
  await page.locator('input[type="text"]').press('Enter');
}

/**
 * Fail whichever exercise is on screen, then dismiss the feedback.
 *
 * Both branches have to be answer-aware rather than positional: multiple-choice
 * options are shuffled (so "the last button" is sometimes the correct one), and the
 * assemble tiles are shuffled too (so "click them in reverse" can spell the target
 * by accident). Either would make these specs flaky rather than wrong.
 */
export async function answerWrong(page: Page, stage: Stage, word: MockWord, wrongTyped = 'zzzzz') {
  if (stage === 'type') {
    await page.locator('input[type="text"]').fill(wrongTyped);
    await page.locator('input[type="text"]').press('Enter');
  } else if (stage === 'select') {
    const forward = await page.getByText('Что это означает?').isVisible().catch(() => false);
    const correct = forward ? word.translation_ru : word.lithuanian;
    const buttons = page.locator('.grid button');
    // The prompt renders one tick before the options state is filled in, so the
    // buttons briefly do not exist yet — reading their text without waiting yields [].
    await buttons.first().waitFor({ timeout: 7000 });
    const texts = (await buttons.allTextContents()).map((t) => t.trim());
    const idx = texts.findIndex((t) => t !== correct);
    if (idx < 0) throw new Error(`no wrong option among [${texts.join(', ')}] (correct="${correct}")`);
    await buttons.nth(idx).click();
  } else if (stage === 'assemble') {
    const pool = page.getByTestId('syllable-tile-pool');
    const tiles = await tileTexts(page);
    const mode = await tileMode(page);
    const separator = mode === 'word' ? ' ' : '';
    // Work out the click order that WOULD be correct, then swap its first two —
    // guaranteed wrong whenever the two fragments differ.
    const order = correctClickOrder(tiles, word.lithuanian, separator);
    if (order.length < 2) throw new Error('cannot fail a single-tile assemble card');
    [order[0], order[1]] = [order[1], order[0]];
    if (order.map((i) => tiles[i]).join(separator) === word.lithuanian) {
      throw new Error('swapped order still spells the target');
    }
    for (const i of order) await pool.getByRole('button').nth(i).click();
  }
  const dismiss = page.getByTestId('dismiss-wrong');
  await dismiss.waitFor({ timeout: 7000 });
  await dismiss.click();
}

/** Tile indices, in the order that spells `target`. */
function correctClickOrder(tiles: string[], target: string, separator: string): number[] {
  const used = new Set<number>();
  const order: number[] = [];
  if (separator === ' ') {
    for (const wanted of target.split(/\s+/)) {
      const i = tiles.findIndex((t, idx) => !used.has(idx) && t === wanted);
      if (i < 0) throw new Error(`no tile "${wanted}"`);
      used.add(i);
      order.push(i);
    }
    return order;
  }
  let remaining = target;
  while (remaining.length > 0) {
    const candidates = tiles
      .map((t, i) => ({ t, i }))
      .filter(({ t, i }) => !used.has(i) && t.length > 0 && remaining.startsWith(t))
      .sort((a, b) => b.t.length - a.t.length);
    if (candidates.length === 0) throw new Error(`cannot spell "${remaining}"`);
    used.add(candidates[0].i);
    order.push(candidates[0].i);
    remaining = remaining.slice(candidates[0].t.length);
  }
  return order;
}
