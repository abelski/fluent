'use client';

// #55 — the Практика page: hero → category chips → bento (featured test / category
// preview + stacked categories and the final-exam card) → section cards. Presentational
// only; app/dashboard/practice/page.tsx fetches and owns state. Shared pieces live in
// BentoParts.tsx. See documentation/practice-articles-bento.md.

import type { PracticeCategorySummary, PracticeTestSummary } from '../../../lib/api';
import { useT } from '../../../lib/useT';
import TakChevron from '../../../components/TakChevron';
import {
  BentoHero, CARD, CARD_GRID, FEATURED_HEADING, FEATURED_SHELL, HERO_ART, HERO_ART_LABEL, INK_BTN, KICKER,
  LockIcon, SectionHeading, StackAddCard, StackProgressCard,
} from './BentoParts';

export type TestsByCategory = Record<number, PracticeTestSummary[]>;

export type PracticeFeatured =
  | { kind: 'next'; category: PracticeCategorySummary; test: PracticeTestSummary }
  | { kind: 'preview'; category: PracticeCategorySummary }
  | { kind: 'done'; category: PracticeCategorySummary };

export const isTestPassed = (t: PracticeTestSummary) =>
  t.best_score_pct !== null && t.best_score_pct !== undefined && t.best_score_pct >= t.pass_threshold;

export function categoryName(c: PracticeCategorySummary, lang: string) {
  return lang === 'en' ? c.name_en ?? c.name_ru : c.name_ru;
}

function categoryDescription(c: PracticeCategorySummary, lang: string) {
  return (lang === 'en' && c.description_en) || c.description_ru || '';
}

/** Same rule as the category page: EN title when present, else RU. */
export function testTitle(t: PracticeTestSummary, lang: string) {
  return lang === 'en' ? t.title_en ?? t.title_ru : t.title_ru;
}

function otherTitle(t: PracticeTestSummary, lang: string): string | null {
  const other = lang === 'en' ? t.title_ru : t.title_en;
  return other && other !== testTitle(t, lang) ? other : null;
}

function sectionLabel(t: PracticeTestSummary, lang: string) {
  return (lang === 'en' && t.section_en) || t.section_ru;
}

/** Questions per session: the exam serves min(question_count, active questions). */
function questionCount(t: PracticeTestSummary) {
  return Math.min(t.question_count, t.active_question_count);
}

export function testHref(categoryId: number, testId: number) {
  return `/dashboard/practice/${categoryId}?test=${testId}`;
}

// Next test: first unlocked, not-passed test (sort order) of the first enrolled category.
function pickNext(categories: PracticeCategorySummary[], byCat: TestsByCategory) {
  for (const category of categories) {
    if (!category.enrolled) continue;
    const test = (byCat[category.id] ?? []).find((t) => !t.is_locked && !isTestPassed(t));
    if (test) return { category, test };
  }
  return null;
}

/** What the featured card shows for the selected chip; null when there are no categories. */
export function practiceFeaturedFor(
  selected: number | 'all',
  categories: PracticeCategorySummary[],
  byCat: TestsByCategory,
): PracticeFeatured | null {
  if (selected === 'all') {
    const next = pickNext(categories, byCat);
    if (next) return { kind: 'next', ...next };
    const notEnrolled = categories.find((c) => !c.enrolled);
    if (notEnrolled) return { kind: 'preview', category: notEnrolled };
    if (categories.length === 0) return null;
    return { kind: 'done', category: categories[0] };
  }
  const category = categories.find((c) => c.id === selected);
  if (!category) return null;
  if (!category.enrolled) return { kind: 'preview', category };
  const next = pickNext([category], byCat);
  if (next) return { kind: 'next', ...next };
  return { kind: 'done', category };
}

/**
 * Tests with the same section_ru form one card (sort order inside); a test without a
 * section is its own card. Cards are ordered by their LAST test, so a section that
 * gathers tests from both ends of the list (the Constitution's «Итоговые тесты»: the
 * sample test is first, numbers + final exam are last) sits at the end, as in the prototype.
 */
export function groupSections(tests: PracticeTestSummary[]): PracticeTestSummary[][] {
  const groups: PracticeTestSummary[][] = [];
  const bySection = new Map<string, PracticeTestSummary[]>();
  for (const t of tests) {
    if (!t.section_ru) { groups.push([t]); continue; }
    const g = bySection.get(t.section_ru);
    if (g) g.push(t);
    else { const ng = [t]; bySection.set(t.section_ru, ng); groups.push(ng); }
  }
  const lastIndex = (g: PracticeTestSummary[]) => tests.indexOf(g[g.length - 1]);
  return groups.sort((a, b) => lastIndex(a) - lastIndex(b));
}

// ── Hero ────────────────────────────────────────────────────────────────────

const SAMPLE_OPTIONS = ['Vilnius', 'Kaunas', 'Klaipėda', 'Trakai'];

export function PracticeHero({
  passed,
  total,
  none,
  continueHref,
  onStart,
  onNavigate,
}: {
  passed: number;
  total: number;
  none: boolean;
  continueHref: string | null;
  onStart: (() => void) | null; // «Начать с Конституции»
  onNavigate: (href: string) => void;
}) {
  const { tr } = useT();
  const t = tr.practice;
  return (
    <BentoHero
      testId="stats-card-practice"
      title={t.title}
      subtitle={none ? t.heroEmptySubtitle : t.heroSubtitle}
      count={passed}
      countTestId="practice-hero-count"
      badge={none ? null : `${t.statsOf} ${total}`}
      label={t.statsPassed}
      pct={total > 0 ? Math.round((passed / total) * 100) : 0}
      actions={(onStart || continueHref) ? (
        <>
          {onStart && (
            <button type="button" onClick={onStart} className={INK_BTN} data-testid="hero-start-practice">
              {t.startWithConstitution}
            </button>
          )}
          {continueHref && (
            <button type="button" onClick={() => onNavigate(continueHref)} className={INK_BTN} data-testid="hero-continue">
              {t.continue} <TakChevron size={10} />
            </button>
          )}
        </>
      ) : null}
      art={
        <div aria-hidden="true" className={`${HERO_ART} w-[230px]`} data-testid="practice-sample">
          <div className={HERO_ART_LABEL}>{t.sampleLabel}</div>
          <div className="font-semibold text-ink mb-1.5" lang="lt">Kokia yra Lietuvos sostinė?</div>
          {SAMPLE_OPTIONS.map((o, i) => (
            <div
              key={o}
              className={`flex items-center gap-2 py-1 ${i > 0 ? 'border-t border-line-soft' : ''} ${i === 0 ? 'text-emerald-600 font-semibold' : 'text-[#5b6067]'}`}
            >
              <span className="w-4 text-xs text-faint font-normal">{'abcd'[i]}</span>
              <span lang="lt">{o}</span>
              {i === 0 && <span>✓</span>}
            </div>
          ))}
        </div>
      }
      mascotPhrase="Pasirinkime!"
    />
  );
}

// ── Featured card ───────────────────────────────────────────────────────────

export function PracticeFeaturedCard({
  featured,
  tests,
  hideAddFor,
  onNavigate,
  onAdd,
}: {
  featured: PracticeFeatured;
  tests: PracticeTestSummary[]; // the featured category's tests
  hideAddFor: number | null; // category the hero already offers to enroll
  onNavigate: (href: string) => void;
  onAdd: (categoryId: number) => void;
}) {
  const { tr, plural, lang } = useT();
  const t = tr.practice;
  const name = categoryName(featured.category, lang);
  const passedCount = tests.filter(isTestPassed).length;

  if (featured.kind === 'next') {
    const { test } = featured;
    const sub = otherTitle(test, lang);
    const q = questionCount(test);
    const meta = [
      `${q} ${plural(q, t.questionsCount)}`,
      test.pass_threshold > 0 ? t.passMark.replace('{pct}', String(Math.round(test.pass_threshold * 100))) : null,
    ].filter(Boolean).join(' · ');
    return (
      <article className={FEATURED_SHELL} data-testid="featured-card" data-kind="next">
        <div className={KICKER}>{t.continueHere} · {name}</div>
        <h2 className={FEATURED_HEADING} data-testid="featured-heading">{testTitle(test, lang)}</h2>
        {sub && <p className="text-xl font-bold text-ink [overflow-wrap:anywhere]" data-testid="featured-subheading">{sub}</p>}
        <div className="text-sm text-muted" data-testid="featured-meta">{meta}</div>
        {test.best_score_pct !== null && (
          <div>
            <span className="inline-flex text-xs px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-600" data-testid="featured-best">
              {t.bestScore.replace('{pct}', String(Math.round(test.best_score_pct * 100)))}
            </span>
          </div>
        )}
        <div className="mt-auto pt-2 flex items-center gap-3.5 flex-wrap">
          <button
            type="button"
            onClick={() => onNavigate(testHref(featured.category.id, test.id))}
            className={INK_BTN}
            data-testid="featured-start"
          >
            {t.startTest} <TakChevron size={10} />
          </button>
          <span className="text-[13px] text-muted">
            {passedCount}/{tests.length} {plural(tests.length, t.testsCount)}
          </span>
        </div>
      </article>
    );
  }

  if (featured.kind === 'preview') {
    const c = featured.category;
    return (
      <article className={FEATURED_SHELL} data-testid="featured-card" data-kind="preview">
        <div className={KICKER}>{t.program}</div>
        <h2 className={FEATURED_HEADING}>{name}</h2>
        {categoryDescription(c, lang) && (
          <p className="text-[14.5px] leading-relaxed text-muted max-w-[56ch]">{categoryDescription(c, lang)}</p>
        )}
        <div className="text-sm text-muted">{tests.length} {plural(tests.length, t.testsCount)}</div>
        {c.id !== hideAddFor && (
          <div className="mt-auto pt-2">
            <button type="button" onClick={() => onAdd(c.id)} className={INK_BTN} data-testid="featured-add">
              {t.add}
            </button>
          </div>
        )}
      </article>
    );
  }

  return (
    <article className={FEATURED_SHELL} data-testid="featured-card" data-kind="done">
      <div className={KICKER}>{name}</div>
      <h2 className="text-xl font-bold text-ink">{t.allDone}</h2>
      <div className="text-sm text-muted">{passedCount}/{tests.length} {plural(tests.length, t.testsCount)}</div>
    </article>
  );
}

// ── Stack ───────────────────────────────────────────────────────────────────

export function PracticeStack({
  categories,
  finals,
  byCat,
  onOpen,
  onAdd,
  onNavigate,
}: {
  categories: PracticeCategorySummary[]; // everything but the featured category
  finals: { category: PracticeCategorySummary; test: PracticeTestSummary }[]; // is_final tests of enrolled categories
  byCat: TestsByCategory;
  onOpen: (categoryId: number) => void;
  onAdd: (categoryId: number) => void;
  onNavigate: (href: string) => void;
}) {
  const { tr, plural, lang } = useT();
  const t = tr.practice;
  return (
    <div className="flex flex-col gap-4">
      {categories.map((c) => {
        const ts = byCat[c.id] ?? [];
        return c.enrolled ? (
          <StackProgressCard
            key={c.id}
            title={categoryName(c, lang)}
            done={ts.filter(isTestPassed).length}
            total={ts.length}
            openLabel={t.open}
            onOpen={() => onOpen(c.id)}
            testId={`stack-card-${c.id}`}
          />
        ) : (
          <StackAddCard
            key={c.id}
            title={categoryName(c, lang)}
            countLabel={`${ts.length} ${plural(ts.length, t.testsCount)}`}
            description={categoryDescription(c, lang)}
            addLabel={t.add}
            onAdd={() => onAdd(c.id)}
            testId={`stack-card-${c.id}`}
            addTestId={`stack-add-${c.id}`}
          />
        );
      })}
      {finals.map(({ category, test }) => {
        const q = questionCount(test);
        return (
          <button
            key={test.id}
            type="button"
            disabled={test.is_locked}
            onClick={() => onNavigate(testHref(category.id, test.id))}
            data-testid="final-exam-card"
            className={`${CARD} px-[22px] py-5 flex flex-col gap-2.5 text-left w-full transition-colors ${
              test.is_locked ? 'cursor-not-allowed' : 'hover:border-faint'
            }`}
          >
            <div className="flex justify-between items-baseline gap-3 w-full">
              <h3 className="text-[17px] font-bold text-ink">{t.finalTitle}</h3>
              <span className="text-[13px] text-muted" aria-hidden="true">∑</span>
            </div>
            <span className="text-[13px] text-muted">
              <span lang="lt">{test.title_ru}</span> · {q} {plural(q, t.questionsCount)} · {Math.round(test.pass_threshold * 100)}%
            </span>
            <span className={`inline-flex items-center gap-1 text-[13px] font-semibold ${test.is_locked ? 'text-faint' : 'text-emerald-600'}`}>
              {test.is_locked && <LockIcon />}
              {t.finalGo} {!test.is_locked && <TakChevron size={9} className="inline-block align-[-1px]" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── Sections ────────────────────────────────────────────────────────────────

function TestButton({
  test,
  label,
  preview,
  premiumUser,
  onClick,
}: {
  test: PracticeTestSummary;
  label: string;
  preview: boolean;
  premiumUser: boolean;
  onClick: () => void;
}) {
  const { tr, lang } = useT();
  const locked = !preview && test.is_locked;
  const attempted = !preview && test.best_score_pct !== null;
  const passed = attempted && isTestPassed(test);
  const tone = passed
    ? 'bg-emerald-50 text-emerald-600'
    : attempted ? 'bg-amber-50 text-amber-600' : 'bg-white text-ink';
  const premium = test.is_premium && !premiumUser;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={preview || locked}
      title={testTitle(test, lang)}
      data-testid="practice-test-button"
      data-state={preview ? 'preview' : locked ? 'locked' : passed ? 'passed' : attempted ? 'attempted' : 'open'}
      className={`inline-flex items-center justify-center gap-1 min-w-10 min-h-11 min-[860px]:min-h-9 px-2.5 rounded-[10px] border border-line text-[13px] font-semibold tabular-nums transition-colors ${tone} ${
        preview || locked ? 'opacity-40 cursor-not-allowed' : 'hover:border-faint'
      }`}
    >
      {locked && <LockIcon />}
      {label}
      {passed && <span>✓</span>}
      {attempted && !passed && <span>{Math.round((test.best_score_pct ?? 0) * 100)}%</span>}
      {premium && <span className="text-[10px] font-semibold text-amber-700">{tr.practice.premiumBadge}</span>}
    </button>
  );
}

function SectionCard({
  tests,
  preview,
  premiumUser,
  onStart,
}: {
  tests: PracticeTestSummary[];
  preview: boolean;
  premiumUser: boolean;
  onStart: (t: PracticeTestSummary) => void;
}) {
  const { tr, plural, lang } = useT();
  const first = tests[0];
  const single = !first.section_ru;
  const passed = preview ? 0 : tests.filter(isTestPassed).length;
  const complete = !preview && passed === tests.length;
  const heading = single ? testTitle(first, lang) : sectionLabel(first, lang);
  const sub = single ? otherTitle(first, lang) : null;
  const q = questionCount(first);
  const count = single
    ? `${q} ${plural(q, tr.practice.questionsCount)}`
    : !preview && passed > 0 ? `${passed}/${tests.length}` : String(tests.length);

  return (
    <div className={`${CARD} px-5 py-[18px] flex flex-col gap-3`} data-testid="practice-section-card">
      <div className="flex justify-between items-start gap-2.5">
        <div className="min-w-0">
          <h3 className="text-[14.5px] font-semibold text-ink [overflow-wrap:anywhere]">{heading}</h3>
          {sub && <div className="text-[12.5px] text-muted mt-0.5 [overflow-wrap:anywhere]">{sub}</div>}
        </div>
        <span className={`text-[13px] tabular-nums whitespace-nowrap ${complete ? 'text-emerald-600' : 'text-faint'}`}>{count}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {tests.map((test, i) => (
          <TestButton
            key={test.id}
            test={test}
            label={single ? tr.practice.startSingle : String(i + 1)}
            preview={preview}
            premiumUser={premiumUser}
            onClick={() => onStart(test)}
          />
        ))}
      </div>
    </div>
  );
}

export function PracticeSections({
  category,
  tests,
  premiumUser,
  onStart,
  onUnenroll,
}: {
  category: PracticeCategorySummary;
  tests: PracticeTestSummary[];
  premiumUser: boolean;
  onStart: (t: PracticeTestSummary) => void;
  onUnenroll: () => void;
}) {
  const { tr, plural, lang } = useT();
  const t = tr.practice;
  const preview = !category.enrolled;
  return (
    <section className="flex flex-col gap-3 mt-3" data-testid="practice-sections">
      <SectionHeading
        title={`${preview ? t.insideTitle : t.topicsTitle}: ${categoryName(category, lang)}`}
        countLabel={`${tests.length} ${plural(tests.length, t.testsCount)}`}
        removeLabel={t.unenroll}
        onRemove={preview ? undefined : onUnenroll}
      />
      {tests.length === 0 ? (
        <p className="text-faint text-sm py-8 text-center">{t.noTests}</p>
      ) : (
        <div className={CARD_GRID}>
          {groupSections(tests).map((g) => (
            <SectionCard key={g[0].id} tests={g} preview={preview} premiumUser={premiumUser} onStart={onStart} />
          ))}
        </div>
      )}
    </section>
  );
}
