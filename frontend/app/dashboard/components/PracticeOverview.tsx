'use client';

// #66 — Практика overview («В процессе» / «Завершённые» / «Другие программы», catalogue
// grouped by exam) and the program page (`?program=<id>`: «Осталось» with whole-row test links,
// Constitution blocks, the sample test first and the final exam pinned last; «Пройдено»).
// Presentational: app/dashboard/practice/page.tsx fetches and owns state. Shared pieces live in
// ProgramOverview.tsx + BentoParts.tsx. See documentation/overview-pages.md.

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import type { PracticeCategorySummary, PracticeTestSummary } from '../../../lib/api';
import { useT } from '../../../lib/useT';
import TakChevron from '../../../components/TakChevron';
import { BentoHero, HERO_ART, HERO_ART_LABEL, INK_BTN, LockIcon } from './BentoParts';
import {
  AddedBanner, Caret, CatalogCard, CompletedBlock, DoneLine, Fold, HEADER_BTN, InProgressCard, LockLine, NextKicker,
  OV_KICKER, PassedCard, ProgramHeader, ProgramSwitcher, RemainingCard, RowChevron, Rows, SectionTitle, StatusLabel,
  byLastResult, fill, gridFor, quoteless, rowClass,
} from './ProgramOverview';

export type TestsByCategory = Record<number, PracticeTestSummary[]>;

export const isTestPassed = (t: PracticeTestSummary) =>
  t.best_score_pct !== null && t.best_score_pct !== undefined && t.best_score_pct >= t.pass_threshold;

/** The Constitution sample test: no pass mark, locks nothing. */
const isTrial = (t: PracticeTestSummary) => t.pass_threshold === 0;

export function categoryName(c: PracticeCategorySummary, lang: string) {
  return lang === 'en' ? c.name_en ?? c.name_ru : c.name_ru;
}

function categoryDescription(c: PracticeCategorySummary, lang: string) {
  return (lang === 'en' && c.description_en) || c.description_ru || '';
}

/** Title in the UI language (EN when present, else RU). */
export function testTitle(t: PracticeTestSummary, lang: string) {
  return lang === 'en' ? t.title_en ?? t.title_ru : t.title_ru;
}

/** The Lithuanian original as a second line, when it differs from the shown title. */
function ltTitle(t: PracticeTestSummary, lang: string): string | null {
  return t.title_lt && t.title_lt !== testTitle(t, lang) ? t.title_lt : null;
}

function sectionLabel(t: PracticeTestSummary, lang: string) {
  return (lang === 'en' && t.section_en) || t.section_ru || '';
}

/** Questions per session: the exam serves min(question_count, active questions). */
function questionCount(t: PracticeTestSummary) {
  return Math.min(t.question_count, t.active_question_count);
}

export function testHref(categoryId: number, testId: number) {
  return `/dashboard/practice/${categoryId}?test=${testId}`;
}

export const programHref = (id: number) => `/dashboard/practice?program=${id}`;

/**
 * Tests with the same section_ru form one group (sort order inside); a test without a
 * section is its own group. Groups are ordered by their LAST test.
 */
function groupSections(tests: PracticeTestSummary[]): PracticeTestSummary[][] {
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

// ── Model ───────────────────────────────────────────────────────────────────

export type Exam = 'cit' | 'a2';

export interface PProgram {
  category: PracticeCategorySummary;
  tests: PracticeTestSummary[];
  prev: Map<number, PracticeTestSummary>;
  total: number;
  done: number;
  next: PracticeTestSummary | null;
  weakest: PracticeTestSummary | null; // lowest passed score, the sample test excluded
  complete: boolean;
  touched: boolean;
  lastResultAt: string | null;
  exam: Exam;
}

export function buildPracticeModel(category: PracticeCategorySummary, tests: PracticeTestSummary[], lastResultAt: string | null): PProgram {
  const prev = new Map<number, PracticeTestSummary>();
  tests.forEach((t, i) => { if (i > 0) prev.set(t.id, tests[i - 1]); });
  const passed = tests.filter(isTestPassed);
  return {
    category,
    tests,
    prev,
    total: tests.length,
    done: passed.length,
    next: category.enrolled ? tests.find((t) => !t.is_locked && !isTestPassed(t)) ?? null : null,
    weakest: passed.filter((t) => !isTrial(t)).sort((a, b) => (a.best_score_pct ?? 0) - (b.best_score_pct ?? 0))[0] ?? null,
    complete: category.enrolled && tests.length > 0 && passed.length === tests.length,
    touched: tests.some((t) => t.best_score_pct !== null && t.best_score_pct !== undefined),
    lastResultAt,
    // ponytail: the citizenship exam is the category with a final exam (the Constitution);
    // every other category prepares for A2. Add a category field if a second exam gets one.
    exam: tests.some((t) => t.is_final) ? 'cit' : 'a2',
  };
}

// ── Labels ──────────────────────────────────────────────────────────────────

function useLabels() {
  const { tr, lang, plural } = useT();
  const need = (t: PracticeTestSummary) => fill(tr.overview.needPct, { n: Math.round(t.pass_threshold * 100) });
  const status = (t: PracticeTestSummary) => (
    <StatusLabel score={t.best_score_pct ?? null} passed={isTestPassed(t)} trial={isTrial(t)} need={need(t)} />
  );
  const questions = (t: PracticeTestSummary) => { const q = questionCount(t); return `${q} ${plural(q, tr.practice.questionsCount)}`; };
  const nextText = (m: PProgram, withProgram: boolean): ReactNode => (
    <>
      {withProgram && `${categoryName(m.category, lang)}: `}
      <span className="font-semibold text-ink">{testTitle(m.next!, lang)}</span> — {status(m.next!)}
    </>
  );
  const weakestText = (t: PracticeTestSummary): ReactNode => (
    <><span className="font-semibold text-ink">{quoteless(testTitle(t, lang))}</span> — {status(t)}</>
  );
  const reviewLabel = (t: PracticeTestSummary) => fill(tr.overview.reviewTest, { q: questions(t) });
  const reasonOf = (m: PProgram, t: PracticeTestSummary) => {
    if (t.is_final) return tr.overview.examOpens;
    const prev = m.prev.get(t.id);
    return prev ? `${fill(tr.overview.opensAfter, { x: quoteless(testTitle(prev, lang)) })} — ${need(prev)}` : null;
  };
  return { tr, lang, plural, need, status, questions, nextText, weakestText, reviewLabel, reasonOf };
}

// ── Hero ────────────────────────────────────────────────────────────────────

const SAMPLE_OPTIONS = ['Vilnius', 'Kaunas', 'Klaipėda', 'Trakai'];
const OUTLINE_LG = 'inline-flex items-center justify-center gap-1.5 bg-white border border-line hover:border-faint text-ink text-sm font-semibold rounded-[10px] px-[18px] py-[10px] transition-colors';

export function PracticeHero({
  passed, total, none, next, action, onStartCit, onStartA2,
}: {
  passed: number;
  total: number;
  none: boolean;
  next: ReactNode | null;
  action: { label: string; onClick: () => void; testId: string } | null; // the page's only «Продолжить»
  onStartCit: (() => void) | null;
  onStartA2: (() => void) | null;
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
      next={next}
      actions={(onStartCit || onStartA2 || action) ? (
        <>
          {onStartCit && (
            <button type="button" onClick={onStartCit} className={INK_BTN} data-testid="hero-start-practice">
              {t.startWithConstitution}
            </button>
          )}
          {onStartA2 && (
            <button type="button" onClick={onStartA2} className={OUTLINE_LG} data-testid="hero-start-a2">
              {tr.overview.startA2}
            </button>
          )}
          {action && (
            <button type="button" onClick={action.onClick} className={INK_BTN} data-testid={action.testId}>
              {action.label} <TakChevron size={10} />
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
              className={`flex items-center gap-2 py-1 ${i > 0 ? 'border-t border-line-soft' : ''} ${i === 0 ? 'text-emerald-600 font-semibold' : 'text-ink-soft'}`}
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

/**
 * The overview hero: «Продолжить» opens the next test of the category practised last; with
 * every category complete it offers a retake of the weakest test of the most overdue one.
 */
export function PracticeOverviewHero({
  mine, passed, total, none, onNavigate, onStartCit, onStartA2,
}: {
  mine: PProgram[];
  passed: number;
  total: number;
  none: boolean;
  onNavigate: (href: string) => void;
  onStartCit: (() => void) | null;
  onStartA2: (() => void) | null;
}) {
  const { tr, nextText, reviewLabel } = useLabels();
  const heroProg = byLastResult(mine.filter((m) => !m.complete && m.next))[0] ?? null;
  let next: ReactNode = null;
  let action: { label: string; onClick: () => void; testId: string } | null = null;
  if (heroProg) {
    next = <>{tr.overview.next} — {nextText(heroProg, true)}</>;
    action = {
      label: heroProg.touched ? tr.overview.continue : tr.overview.start,
      onClick: () => onNavigate(testHref(heroProg.category.id, heroProg.next!.id)),
      testId: 'hero-continue',
    };
  } else if (mine.length > 0 && mine.every((m) => m.complete)) {
    next = <span className="text-emerald-600 font-semibold">✓ {tr.overview.doneP}</span>;
    const overdue = byLastResult(mine.filter((m) => m.weakest)).reverse()[0];
    if (overdue?.weakest) {
      const w = overdue.weakest;
      action = { label: reviewLabel(w), onClick: () => onNavigate(testHref(overdue.category.id, w.id)), testId: 'hero-review' };
    }
  }
  return <PracticeHero passed={passed} total={total} none={none} next={next} action={action} onStartCit={onStartCit} onStartA2={onStartA2} />;
}

// ── Overview body ───────────────────────────────────────────────────────────

function rangeLabel(xs: number[], f: (v: number) => string) {
  if (!xs.length) return '';
  const lo = Math.min(...xs), hi = Math.max(...xs);
  return lo === hi ? f(lo) : `${f(lo).replace('%', '')}–${f(hi)}`;
}

function PracticeCatalogCard({ model, onAdd }: { model: PProgram; onAdd: () => void }) {
  const { tr, lang, plural, questions } = useLabels();
  const c = model.category;
  const tests = model.tests;
  const format = fill(tr.overview.formatP, {
    q: rangeLabel(tests.map(questionCount), String),
    pass: rangeLabel(tests.map((t) => t.pass_threshold).filter((v) => v > 0), (v) => `${Math.round(v * 100)}%`),
  });
  const trial = tests.filter(isTrial).map((t) => `${testTitle(t, lang)} · ${questions(t)}, ${tr.overview.noPass}`);
  const secs = groupSections(tests.filter((t) => !t.is_final && !isTrial(t))).filter((g) => g[0].section_ru);
  const finals = tests.filter((t) => t.is_final).map((t) => <><span className="font-semibold">{tr.overview.exam}</span> · {questions(t)}</>);
  const inside: ReactNode[] = secs.length
    ? [...trial, ...secs.map((g) => `${sectionLabel(g[0], lang)} · ${g.length} ${plural(g.length, tr.practice.testsCount)}`), ...finals]
    : tests.map((t) => testTitle(t, lang));
  return (
    <CatalogCard
      title={categoryName(c, lang)}
      countLabel={`${tests.length} ${plural(tests.length, tr.practice.testsCount)}`}
      description={categoryDescription(c, lang)}
      recommended={false}
      format={format}
      inside={inside}
      onAdd={onAdd}
      testId={`catalog-card-${c.id}`}
    />
  );
}

export function PracticeOverviewBody({
  mine, others, none, onAdd, onAddAll, onNavigate,
}: {
  mine: PProgram[];
  others: PProgram[];
  none: boolean;
  onAdd: (categoryId: number) => void;
  onAddAll: (categoryIds: number[]) => void;
  onNavigate: (href: string) => void;
}) {
  const { tr, lang, plural, nextText, weakestText, reviewLabel } = useLabels();
  const active = mine.filter((m) => !m.complete);
  const finished = mine.filter((m) => m.complete);

  // The catalogue is grouped by the exam it prepares for; the A2 group can add all its parts at once.
  const catalogue = (list: PProgram[], title: string) => {
    if (!list.length) return null;
    const groups = ([['cit', tr.overview.examCit], ['a2', tr.overview.examA2]] as const)
      .map(([k, label]) => ({ k, label, ps: list.filter((m) => m.exam === k) }))
      .filter((g) => g.ps.length);
    return (
      <section className="flex flex-col gap-3" data-testid="catalogue-section">
        <SectionTitle title={title} hint={groups.length > 1 ? tr.overview.bothHint : undefined} />
        {groups.map((g) => (
          <div key={g.k} className="flex flex-col gap-3" data-testid={`catalogue-group-${g.k}`}>
            <div className="mt-1 flex items-center justify-between gap-x-3 flex-wrap">
              <h3 className={OV_KICKER}>{g.label}</h3>
              {g.ps.length > 1 && (
                <button
                  type="button"
                  onClick={() => onAddAll(g.ps.map((m) => m.category.id))}
                  className="inline-flex items-center gap-1 text-[13px] font-semibold text-emerald-600 hover:text-emerald-700 transition-colors min-h-11 min-[860px]:min-h-0"
                  data-testid={`add-all-${g.k}`}
                >
                  {fill(tr.overview.addAll, { n: g.ps.length })} <TakChevron size={9} />
                </button>
              )}
            </div>
            <div className={gridFor(g.ps.length)}>
              {g.ps.map((m) => <PracticeCatalogCard key={m.category.id} model={m} onAdd={() => onAdd(m.category.id)} />)}
            </div>
          </div>
        ))}
      </section>
    );
  };

  if (none) return catalogue([...mine, ...others], tr.overview.programs);

  return (
    <>
      {active.length > 0 && (
        <section className="flex flex-col gap-3" data-testid="in-progress-section">
          <SectionTitle title={tr.overview.inProgress} />
          <div className={gridFor(active.length, true)}>
            {active.map((m) => (
              <InProgressCard
                key={m.category.id}
                href={programHref(m.category.id)}
                title={categoryName(m.category, lang)}
                done={m.done}
                total={m.total}
                unit={plural(m.total, tr.practice.testsCount)}
                next={m.next ? nextText(m, false) : null}
                testId={`program-card-${m.category.id}`}
              />
            ))}
          </div>
        </section>
      )}
      <CompletedBlock
        rows={finished.map((m) => ({
          key: m.category.id,
          href: programHref(m.category.id),
          title: categoryName(m.category, lang),
          done: m.done,
          total: m.total,
          lastResultAt: m.lastResultAt,
          weakest: m.weakest ? weakestText(m.weakest) : null,
          reviewLabel: m.weakest ? reviewLabel(m.weakest) : '',
          reviewHint: tr.overview.reviewTestHint,
          // No review endpoint for practice: the button reopens the weakest passed test.
          onReview: m.weakest ? () => onNavigate(testHref(m.category.id, m.weakest!.id)) : null,
        }))}
      />
      {catalogue(others, tr.overview.more)}
    </>
  );
}

// ── Program page ────────────────────────────────────────────────────────────

/** A test row: the whole row opens the test; a locked row says why when tapped. */
function TestRow({
  model, test, reason, showSection = false, premiumUser,
}: {
  model: PProgram;
  test: PracticeTestSummary;
  reason?: string | null; // shown without a tap (the first locked row of a list)
  showSection?: boolean;
  premiumUser: boolean;
}) {
  const { tr, lang, status, questions, reasonOf } = useLabels();
  const [revealed, setRevealed] = useState(false);
  const isNext = model.next?.id === test.id;
  const trial = isTrial(test);
  const shownReason = test.is_locked ? (reason ?? (revealed ? reasonOf(model, test) : null)) : null;
  const sub = trial ? tr.overview.trialSub : ltTitle(test, lang);
  const meta: ReactNode[] = [];
  if (showSection && test.section_ru && !trial) meta.push(sectionLabel(test, lang));
  meta.push(questions(test));
  meta.push(status(test));

  const body = (
    <div className="min-w-0 flex-1">
      {isNext && <NextKicker label={trial || !model.touched ? tr.overview.startHereKicker : tr.overview.next} />}
      <div className="flex items-center gap-2 flex-wrap">
        {test.is_locked && <span className="text-faint"><LockIcon /></span>}
        <span className={`text-[14.5px] font-semibold ${test.is_locked ? 'text-ink-soft' : 'text-ink'} [overflow-wrap:anywhere]`}>{testTitle(test, lang)}</span>
        {test.is_final && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#f2f3f3] text-ink">{tr.overview.exam}</span>}
        {test.is_premium && !premiumUser && (
          <span className="text-[10px] font-semibold px-1.5 py-px rounded-full border border-amber-300 bg-amber-50 text-amber-700">{tr.practice.premiumBadge}</span>
        )}
      </div>
      {sub && <div className="text-[12.5px] text-muted [overflow-wrap:anywhere]" lang={trial ? undefined : 'lt'}>{sub}</div>}
      <div className="text-[12.5px] text-ink-soft [overflow-wrap:anywhere]">
        {meta.map((m, i) => <span key={i}>{i > 0 && ' · '}{m}</span>)}
      </div>
      {shownReason && <LockLine reason={shownReason} />}
    </div>
  );
  const cls = `w-full text-left px-5 py-3 flex items-center gap-4 ${rowClass(isNext)}`;
  if (test.is_locked) {
    return (
      <button type="button" onClick={() => setRevealed(true)} aria-expanded={!!shownReason} className={cls} data-testid="test-row" data-state="locked">
        {body}
      </button>
    );
  }
  return (
    <Link
      href={testHref(model.category.id, test.id)}
      className={`${cls} hover:bg-[#fafbfa] transition-colors`}
      data-testid="test-row"
      data-state={isNext ? 'next' : isTestPassed(test) ? 'passed' : test.best_score_pct != null ? 'tried' : 'open'}
    >
      {body}
      <RowChevron />
    </Link>
  );
}

/** Practice «Осталось»: the sample test first, then what is left (blocks, current one open), the final exam last. */
function RemainingBody({ model, left, premiumUser }: { model: PProgram; left: PracticeTestSummary[]; premiumUser: boolean }) {
  const { tr, lang, plural, reasonOf } = useLabels();
  const trial = left.filter(isTrial);
  const finals = left.filter((t) => t.is_final);
  const rest = left.filter((t) => !t.is_final && !isTrial(t));
  const row = (t: PracticeTestSummary, reason?: string | null) => (
    <TestRow key={t.id} model={model} test={t} reason={reason} premiumUser={premiumUser} />
  );
  // The first locked row of a list says why without a tap.
  const firstLockedReason = (xs: PracticeTestSummary[]) => {
    const first = xs.find((t) => t.is_locked);
    return (t: PracticeTestSummary) => (t === first ? reasonOf(model, t) : null);
  };
  const unit = (n: number) => `${n} ${plural(n, tr.practice.testsCount)}`;

  let middle: ReactNode;
  if (!rest.some((t) => t.section_ru)) {
    // Open rows, then two locked rows and the rest folded.
    const open = rest.filter((t) => !t.is_locked);
    const locked = rest.filter((t) => t.is_locked);
    const r = firstLockedReason(locked);
    middle = (
      <Rows>
        {open.map((t) => row(t))}
        {locked.slice(0, 2).map((t) => row(t, r(t)))}
        <Fold label={fill(tr.overview.moreLocked, { k: unit(locked.length - 2) })} rows={locked.slice(2).map((t) => row(t))} testId="fold-locked" />
      </Rows>
    );
  } else {
    // Blocks: the current one open with all its remaining tests, the others one line each.
    const current = rest.find((t) => !t.is_locked)?.section_ru ?? null;
    middle = (
      <Rows>
        {groupSections(rest).map((grp) => {
          const whole = model.tests.filter((t) => t.section_ru === grp[0].section_ru && !t.is_final && !isTrial(t));
          const passedN = whole.filter(isTestPassed).length;
          const isCur = grp[0].section_ru === current;
          // A closed block names the block before it, never a test inside itself.
          const pre = model.prev.get(grp[0].id);
          const note = !isCur && grp[0].is_locked && pre
            ? fill(tr.overview.opensAfter, {
              x: pre.section_ru && pre.section_ru !== grp[0].section_ru && !isTrial(pre) ? sectionLabel(pre, lang) : quoteless(testTitle(pre, lang)),
            })
            : '';
          const r = firstLockedReason(grp);
          return (
            <details key={grp[0].id} className="group/block" open={isCur || undefined} data-testid="practice-block" data-current={isCur ? 'true' : 'false'}>
              <summary className="relative pl-5 pr-11 py-3 min-h-11 flex items-center gap-x-2.5 gap-y-1 flex-wrap hover:bg-[#fafbfa] cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                <span className={OV_KICKER}>{sectionLabel(grp[0], lang)}</span>
                <span className="text-xs text-muted tabular-nums">{passedN}/{whole.length}</span>
                <span className="flex gap-0.5" aria-hidden="true">
                  {whole.map((t) => (
                    <span
                      key={t.id}
                      className={`h-1.5 w-3 rounded-full ${isTestPassed(t) ? 'bg-emerald-600' : t.best_score_pct != null ? 'bg-amber-400' : t.is_locked ? 'bg-line' : 'bg-white border border-faint'}`}
                    />
                  ))}
                </span>
                <span className="absolute right-5 top-[17px]"><Caret group="block" /></span>
                {note && <span className="w-full min-[860px]:w-auto text-[12.5px] text-ink-soft flex items-center gap-1"><LockIcon />{note}</span>}
              </summary>
              <div className="border-t border-line-soft"><Rows>{grp.map((t) => row(t, r(t)))}</Rows></div>
            </details>
          );
        })}
      </Rows>
    );
  }
  return (
    <>
      {trial.map((t) => <div key={t.id} className="border-b border-line-soft">{row(t)}</div>)}
      {middle}
      {/* The final exam is the goal: always visible, and its lock names something the user can see. */}
      {finals.map((t) => <div key={t.id} className="border-t border-line-strong">{row(t, t.is_locked ? tr.overview.examOpens : null)}</div>)}
    </>
  );
}

export function PracticeProgramPage({
  model, mine, justAdded, premiumUser, onUndo, onRemove, onNavigate, notice,
}: {
  model: PProgram;
  mine: PProgram[];
  justAdded: boolean;
  premiumUser: boolean;
  onUndo: () => void;
  onRemove: () => void;
  onNavigate: (href: string) => void;
  notice: ReactNode;
}) {
  const { tr, lang, plural, nextText, weakestText, reviewLabel } = useLabels();
  const c = model.category;
  const w = model.weakest;
  const openTest = (t: PracticeTestSummary) => onNavigate(testHref(c.id, t.id));

  let line: ReactNode = null;
  let cta: ReactNode = null;
  if (model.next) {
    line = <>{tr.overview.next} — {nextText(model, false)}</>;
    cta = (
      <button type="button" onClick={() => openTest(model.next!)} className={HEADER_BTN} data-testid="program-continue">
        {model.touched ? tr.overview.continue : tr.overview.start} <TakChevron size={10} />
      </button>
    );
  } else if (model.complete) {
    line = <DoneLine doneLabel={tr.overview.doneP} lastResultAt={model.lastResultAt} weakest={w ? weakestText(w) : null} />;
    cta = w ? (
      <>
        <button type="button" onClick={() => openTest(w)} className={HEADER_BTN} data-testid="program-review">
          {reviewLabel(w)} <TakChevron size={10} />
        </button>
        <p className="text-[12.5px] text-muted">{tr.overview.reviewTestHint}</p>
      </>
    ) : null;
  }

  const left = model.tests.filter((t) => !isTestPassed(t));
  // Weakest first; the sample test (no pass mark) goes last.
  const done = model.tests.filter(isTestPassed)
    .sort((a, b) => (Number(isTrial(a)) - Number(isTrial(b))) || ((a.best_score_pct ?? 0) - (b.best_score_pct ?? 0)));
  const unit = (n: number) => `${n} ${plural(n, tr.practice.testsCount)}`;

  return (
    <>
      <ProgramSwitcher
        backHref="/dashboard/practice"
        backLabel={tr.practice.title}
        chips={mine.filter((m) => m.category.id !== c.id).map((m) => ({
          id: m.category.id, href: programHref(m.category.id), title: categoryName(m.category, lang),
          complete: m.complete, done: m.done, total: m.total,
        }))}
      />
      {justAdded && <AddedBanner title={categoryName(c, lang)} onUndo={onUndo} />}
      {notice}
      <ProgramHeader
        title={categoryName(c, lang)}
        description={categoryDescription(c, lang)}
        done={model.done}
        total={model.total}
        statsLabel={tr.practice.statsPassed}
        line={line}
        cta={cta}
        mascotPhrase="Pasirinkime!"
        onRemove={onRemove}
      />
      {left.length > 0 && (
        <RemainingCard countLabel={unit(left.length)}>
          <RemainingBody model={model} left={left} premiumUser={premiumUser} />
        </RemainingCard>
      )}
      {done.length > 0 && (
        <PassedCard
          countLabel={unit(done.length)}
          weakest={w ? <>{quoteless(testTitle(w, lang))} <span className="text-emerald-600 font-semibold whitespace-nowrap">✓ {Math.round((w.best_score_pct ?? 0) * 100)}%</span></> : null}
          complete={model.complete}
          review={w ? { label: reviewLabel(w), hint: tr.overview.reviewTestHint, onClick: () => openTest(w) } : null}
        >
          {done.map((t) => <TestRow key={t.id} model={model} test={t} showSection premiumUser={premiumUser} />)}
        </PassedCard>
      )}
    </>
  );
}
