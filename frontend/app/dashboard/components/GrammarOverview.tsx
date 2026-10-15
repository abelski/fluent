'use client';

// #66 — Грамматика overview («В процессе» / «Завершённые» / «Другие программы») and the
// program page (`?program=<id>`: «Осталось» with level strips, «Пройдено»). Presentational:
// app/dashboard/grammar/page.tsx fetches and owns state. Shared pieces: ProgramOverview.tsx +
// BentoParts.tsx. See documentation/overview-pages.md.

import { useState, type ReactNode } from 'react';
import type { GrammarProgramSummary } from '../../../lib/api';
import { useT } from '../../../lib/useT';
import TakChevron from '../../../components/TakChevron';
import { BentoHero, HERO_ART, HERO_ART_LABEL, INK_BTN, LockIcon } from './BentoParts';
import {
  AddedBanner, CatalogCard, CompletedBlock, DoneLine, Fold, HEADER_BTN, InProgressCard, LockLine, NextKicker,
  PassedCard, PremiumFoot, ProgramHeader, ProgramSwitcher, RemainingCard, Rows, SectionTitle,
  StartedTag, StatusLabel, byLastResult, fill, gridFor, pct, rowClass, useWide,
} from './ProgramOverview';
import type { GrammarRule, VerbHint } from './GrammarTaskRunner';

export interface Lesson {
  id: number;
  title: string;
  title_en?: string;         // verb lessons only — grouping stays by the RU title/tense_key
  level: 'basic' | 'advanced' | 'practice';
  cases?: number[];          // noun lessons only
  tense_key?: string;        // verb lessons only
  task_count: number;
  rules?: GrammarRule[];
  hint?: VerbHint;           // verb conjugation lessons only
  hint_en?: VerbHint;
  is_locked: boolean;
  best_score_pct: number | null;
  status?: string;
}

export type LessonsByProgram = Record<number, Lesson[]>;

export const isPassed = (l: Lesson) => (l.best_score_pct ?? 0) > 0.75;
const isNoun = (l: Lesson) => l.id < 200;
const scoreOf = (l: Lesson) => (l.best_score_pct === undefined ? null : l.best_score_pct);

export function programTitle(p: GrammarProgramSummary, lang: string) {
  return lang === 'en' && p.title_en ? p.title_en : p.title;
}

function programDescription(p: GrammarProgramSummary, lang: string) {
  return (lang === 'en' && p.description_en) || p.description || '';
}

// Noun-case titles are already Lithuanian («Kilmininkas Vns.»); verbs have RU + EN titles.
function lessonHeading(l: Lesson, lang: string) {
  if (isNoun(l)) return l.title;
  return lang === 'en' && l.title_en ? l.title_en : l.title;
}

function caseName(l: Lesson, lang: string): string | null {
  if (!isNoun(l)) return null;
  const rule = l.rules?.[0];
  if (!rule) return null;
  const name = (lang === 'en' ? rule.name_en ?? rule.name_ru : rule.name_ru) || '';
  // Rule names end with the LT title, «Родительный (Kilmininkas)» — the heading already
  // shows it, so drop that trailing parenthetical; keep one that adds info («(kiek? yra)»).
  const m = name.match(/^(.*\S)\s*\(([^()]+)\)$/);
  return (m && l.title.trim().startsWith(m[2].trim()) ? m[1] : name) || null;
}

// Consecutive lessons with the same title form one topic.
function groupTopics(lessons: Lesson[]): Lesson[][] {
  const groups: Lesson[][] = [];
  for (const l of lessons) {
    const last = groups[groups.length - 1];
    if (last && last[0].title === l.title) last.push(l);
    else groups.push([l]);
  }
  return groups;
}

function topicArticle(t: Lesson[]): { slug: string; ru: string; en: string } | null {
  const rule = t[0].rules?.find((r) => r.article_slug);
  return rule?.article_slug ? { slug: rule.article_slug, ru: rule.article_title_ru ?? '', en: rule.article_title_en ?? '' } : null;
}

// ── Model ───────────────────────────────────────────────────────────────────

export interface GTopic {
  key: number;
  lessons: Lesson[];
  passed: boolean;
  started: boolean;
  allLocked: boolean;
  weakest: Lesson | null; // lowest passed level
}

export interface GProgram {
  program: GrammarProgramSummary;
  lessons: Lesson[];
  topics: GTopic[];
  prev: Map<number, Lesson>; // lesson id → the lesson before it in this program (lock reasons)
  total: number;
  done: number;
  next: Lesson | null;
  weakest: Lesson | null;
  topicsDone: number;
  complete: boolean;
  touched: boolean; // any attempt at all — «Продолжить» vs «Начать»
  canReview: boolean; // a passed «Смешанный» lesson — what the remind endpoint draws from
  lastResultAt: string | null;
}

const byScore = (a: Lesson, b: Lesson) => (a.best_score_pct ?? 0) - (b.best_score_pct ?? 0);

export function buildGrammarModel(program: GrammarProgramSummary, lessons: Lesson[]): GProgram {
  const topics: GTopic[] = groupTopics(lessons).map((ls) => ({
    key: ls[0].id,
    lessons: ls,
    passed: ls.every(isPassed),
    started: ls.some((l) => scoreOf(l) !== null),
    allLocked: ls.every((l) => l.is_locked),
    weakest: ls.filter(isPassed).sort(byScore)[0] ?? null,
  }));
  const prev = new Map<number, Lesson>();
  lessons.forEach((l, i) => { if (i > 0) prev.set(l.id, lessons[i - 1]); });
  const passed = lessons.filter(isPassed);
  const done = passed.length;
  let next: Lesson | null = null;
  if (program.enrolled) {
    for (const t of topics) {
      const l = t.lessons.find((x) => !x.is_locked && !isPassed(x));
      if (l) { next = l; break; }
    }
  }
  return {
    program,
    lessons,
    topics,
    prev,
    total: lessons.length,
    done,
    next,
    weakest: [...passed].sort(byScore)[0] ?? null,
    topicsDone: topics.filter((t) => t.passed).length,
    complete: program.enrolled && lessons.length > 0 && done === lessons.length,
    touched: lessons.some((l) => scoreOf(l) !== null),
    canReview: lessons.some((l) => l.level === 'practice' && isPassed(l)),
    lastResultAt: program.last_result_at ?? null,
  };
}

export const programHref = (id: number) => `/dashboard/grammar?program=${id}`;

// ── Labels ──────────────────────────────────────────────────────────────────

function useLabels() {
  const { tr, lang, plural } = useT();
  const levelName = (l: Lesson) => tr.grammar.levels[l.level] ?? l.level;
  const lessonLabel = (l: Lesson) => `${lessonHeading(l, lang)} · ${levelName(l)}`;
  const status = (l: Lesson) => (
    <StatusLabel score={scoreOf(l)} passed={isPassed(l)} need={tr.overview.needOver} />
  );
  /** «<topic> · <level> — <state>», optionally prefixed with the program. */
  const nextText = (m: GProgram, withProgram: boolean): ReactNode => {
    const n = m.next!;
    return (
      <>
        {withProgram && `${programTitle(m.program, lang)}: `}
        <span className="font-semibold text-ink" lang={isNoun(n) ? 'lt' : undefined}>{lessonHeading(n, lang)}</span>
        {' · '}{levelName(n)} — {status(n)}
      </>
    );
  };
  const weakestText = (l: Lesson): ReactNode => (
    <><span className="font-semibold text-ink">{lessonLabel(l)}</span> — {status(l)}</>
  );
  return { tr, lang, plural, levelName, lessonLabel, status, nextText, weakestText };
}

// ── Hero ────────────────────────────────────────────────────────────────────

const DECLENSION: [string, string][] = [['as', 'V.'], ['o', 'K.'], ['ui', 'N.'], ['ą', 'G.']];

export function GrammarHero({
  passed, total, none, next, action, onStartCases,
}: {
  passed: number;
  total: number;
  none: boolean;
  next: ReactNode | null;
  action: { label: string; onClick: () => void; testId: string } | null; // the page's only «Продолжить»
  onStartCases: (() => void) | null;
}) {
  const { tr } = useT();
  const pctDone = total > 0 ? Math.round((passed / total) * 100) : 0;
  return (
    <BentoHero
      testId="stats-card-grammar"
      title={tr.grammar.title}
      subtitle={none ? tr.grammar.emptySubtitle : tr.grammar.subtitle}
      note={tr.grammar.charactersNote}
      count={passed}
      countTestId="grammar-hero-count"
      badge={none ? null : `${tr.grammar.statsOf} ${total}`}
      label={tr.grammar.statsPassed}
      pct={pctDone}
      next={next}
      actions={(action || onStartCases) ? (
        <>
          {onStartCases && (
            <button type="button" onClick={onStartCases} className={INK_BTN} data-testid="hero-start-cases">
              {tr.grammar.startWithCases}
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
        <div aria-hidden="true" className={HERO_ART}>
          <div className={HERO_ART_LABEL}>
            <span lang="lt">namas</span> · {tr.grammar.declHouse}
          </div>
          {DECLENSION.map(([ending, letter], i) => (
            <div key={letter} className={`flex justify-between gap-4 py-1 ${i > 0 ? 'border-t border-line-soft' : ''}`}>
              <span lang="lt">nam<span className="text-emerald-600 font-bold">{ending}</span></span>
              <span className="text-xs text-muted">{letter}</span>
            </div>
          ))}
        </div>
      }
      mascotPhrase="Mokomės!"
    />
  );
}

/**
 * The overview hero: the page's only «Продолжить» continues the program practised last
 * (`last_result_at`); with every program complete it says so and offers the most overdue review.
 */
export function GrammarOverviewHero({
  mine, passed, total, none, onStart, onReview, onStartCases,
}: {
  mine: GProgram[];
  passed: number;
  total: number;
  none: boolean;
  onStart: (l: Lesson) => void;
  onReview: (programId: number) => void;
  onStartCases: (() => void) | null;
}) {
  const { tr, nextText } = useLabels();
  const heroProg = byLastResult(mine.filter((m) => !m.complete && m.next))[0] ?? null;
  let next: ReactNode = null;
  let action: { label: string; onClick: () => void; testId: string } | null = null;
  if (heroProg) {
    next = <>{tr.overview.next} — {nextText(heroProg, true)}</>;
    action = {
      label: heroProg.touched ? tr.overview.continue : tr.overview.start,
      onClick: () => onStart(heroProg.next!),
      testId: 'hero-continue',
    };
  } else if (mine.length > 0 && mine.every((m) => m.complete)) {
    next = <span className="text-emerald-600 font-semibold">✓ {tr.overview.doneG}</span>;
    const overdue = byLastResult(mine.filter((m) => m.canReview)).reverse()[0];
    if (overdue) action = { label: tr.grammar.reviewPassed, onClick: () => onReview(overdue.program.id), testId: 'hero-review' };
  }
  return <GrammarHero passed={passed} total={total} none={none} next={next} action={action} onStartCases={onStartCases} />;
}

// ── Overview body ───────────────────────────────────────────────────────────

export function GrammarOverviewBody({
  mine, others, none, onAdd, onReview,
}: {
  mine: GProgram[];
  others: GProgram[]; // not enrolled — the catalogue
  none: boolean;
  onAdd: (programId: number) => void;
  onReview: (programId: number) => void;
}) {
  const { tr, lang, plural, nextText, weakestText } = useLabels();
  const active = mine.filter((m) => !m.complete);
  const finished = mine.filter((m) => m.complete);

  const catalogue = (list: GProgram[], title: string, recommendFirst: boolean) => list.length > 0 && (
    <section className="flex flex-col gap-3" data-testid="catalogue-section">
      <SectionTitle title={title} />
      <div className={gridFor(list.length)}>
        {list.map((m, i) => <GrammarCatalogCard key={m.program.id} model={m} recommended={recommendFirst && i === 0} onAdd={() => onAdd(m.program.id)} />)}
      </div>
    </section>
  );

  if (none) return <>{catalogue([...mine, ...others], tr.overview.programs, true)}</>;

  return (
    <>
      {active.length > 0 && (
        <section className="flex flex-col gap-3" data-testid="in-progress-section">
          <SectionTitle title={tr.overview.inProgress} />
          <div className={gridFor(active.length, true)}>
            {active.map((m) => (
              <InProgressCard
                key={m.program.id}
                href={programHref(m.program.id)}
                title={programTitle(m.program, lang)}
                done={m.done}
                total={m.total}
                unit={plural(m.total, tr.grammar.lessonsCount)}
                next={m.next ? nextText(m, false) : null}
                testId={`program-card-${m.program.id}`}
              />
            ))}
          </div>
        </section>
      )}
      <CompletedBlock
        rows={finished.map((m) => ({
          key: m.program.id,
          href: programHref(m.program.id),
          title: programTitle(m.program, lang),
          done: m.done,
          total: m.total,
          lastResultAt: m.lastResultAt,
          weakest: m.weakest ? weakestText(m.weakest) : null,
          reviewLabel: tr.overview.reviewTasks,
          reviewHint: tr.overview.reviewHint,
          onReview: m.canReview ? () => onReview(m.program.id) : null,
        }))}
      />
      {catalogue(others, tr.overview.more, false)}
    </>
  );
}

function GrammarCatalogCard({ model, recommended, onAdd }: { model: GProgram; recommended: boolean; onAdd: () => void }) {
  const { tr, lang, plural } = useT();
  const p = model.program;
  const topics = model.topics.length;
  return (
    <CatalogCard
      kicker={tr.grammar.difficulty[p.difficulty] ?? null}
      title={programTitle(p, lang)}
      countLabel={`${model.total} ${plural(model.total, tr.grammar.lessonsCount)} · ${topics} ${plural(topics, tr.grammar.topicsCount)}`}
      description={programDescription(p, lang)}
      recommended={recommended}
      format={tr.overview.formatG}
      inside={model.topics.map((t) => {
        const sub = caseName(t.lessons[0], lang);
        return sub ? <>{sub} — <span lang="lt">{t.lessons[0].title}</span></> : lessonHeading(t.lessons[0], lang);
      })}
      onAdd={onAdd}
      testId={`catalog-card-${p.id}`}
    />
  );
}

// ── Program page ────────────────────────────────────────────────────────────

/** A topic's levels as one strip: each cell opens its level and shows its state. */
function LevelStrip({ topic, onStart, onLocked }: { topic: GTopic; onStart: (l: Lesson) => void; onLocked: () => void }) {
  const { tr, levelName } = useLabels();
  const cls = 'flex flex-col items-center justify-center gap-0.5 min-h-11 px-1.5 py-1.5 text-center text-[12.5px] font-semibold leading-tight tabular-nums';
  return (
    <div
      className="grid divide-x divide-line border border-line rounded-[10px] overflow-hidden bg-white w-full min-[860px]:w-[390px] shrink-0"
      style={{ gridTemplateColumns: `repeat(${topic.lessons.length}, minmax(0, 1fr))` }}
      data-testid="level-strip"
    >
      {topic.lessons.map((l) => {
        const s = scoreOf(l);
        if (l.is_locked) {
          return (
            <button key={l.id} type="button" onClick={onLocked} className={`${cls} bg-[#fafbfa] text-faint cursor-not-allowed`} data-testid="lesson-locked" aria-label={`${levelName(l)} — ${tr.overview.lockedHint}`}>
              {levelName(l)}<span className="text-faint"><LockIcon /></span>
            </button>
          );
        }
        const state = isPassed(l)
          ? <span className="text-emerald-600">✓ {pct(s ?? 0)}</span>
          : s !== null ? <span className="text-amber-700">{pct(s)}</span>
            : <span className="text-ink-soft font-medium">{tr.overview.notStarted}</span>;
        return (
          <button key={l.id} type="button" onClick={() => onStart(l)} className={`${cls} text-ink hover:bg-[#f7faf8] transition-colors`} data-testid="level-button" data-level={l.level}>
            {levelName(l)}
            <span className="inline-flex items-center gap-1">{state}<TakChevron size={7} /></span>
          </button>
        );
      })}
    </div>
  );
}

function TopicRow({
  model, topic, reason, showArticle, onStart,
}: {
  model: GProgram;
  topic: GTopic;
  reason?: string | null; // a locked topic's reason, shown without a tap (the first locked row)
  showArticle: boolean;
  onStart: (l: Lesson) => void;
}) {
  const { tr, lang, levelName, lessonLabel } = useLabels();
  const [revealed, setRevealed] = useState(false);
  const first = topic.lessons[0];
  const isNext = !!model.next && topic.lessons.some((l) => l.id === model.next!.id);
  const started = !isNext && !topic.passed && topic.started;
  const sub = caseName(first, lang);
  const art = showArticle ? topicArticle(topic.lessons) : null;
  // A partly locked topic names the lesson its first locked level waits for.
  const firstLocked = topic.allLocked ? null : topic.lessons.find((l) => l.is_locked);
  const levelReason = firstLocked && model.prev.get(firstLocked.id)
    ? fill(tr.overview.lockLevel, { lv: levelName(firstLocked), x: lessonLabel(model.prev.get(firstLocked.id)!) })
    : null;
  // A fully locked topic: the lesson right before it in the program.
  const ownReason = topic.allLocked && model.prev.get(first.id)
    ? `${fill(tr.overview.opensAfter, { x: lessonLabel(model.prev.get(first.id)!) })} — ${tr.overview.needOver}`
    : null;
  const shownReason = levelReason ?? reason ?? (revealed ? ownReason : null);
  const draft = topic.lessons.find((l) => l.status && l.status !== 'published')?.status;

  const body = (
    <div className="min-w-0 flex-1">
      {isNext && <NextKicker label={model.touched ? tr.overview.next : tr.overview.startHereKicker} />}
      <div className="flex items-center gap-2 flex-wrap">
        {topic.allLocked && <span className="text-faint"><LockIcon /></span>}
        <span className={`text-[14.5px] font-semibold ${topic.allLocked ? 'text-ink-soft' : 'text-ink'}`} lang={isNoun(first) ? 'lt' : undefined}>
          {lessonHeading(first, lang)}
        </span>
        {started && <StartedTag />}
        {draft && (
          <span className="text-[10px] font-semibold uppercase tracking-wide bg-amber-50 text-amber-600 border border-amber-200 rounded px-1.5 py-px leading-tight">
            {draft === 'draft' ? tr.grammar.lessonStatusDraft : tr.grammar.lessonStatusTesting}
          </span>
        )}
      </div>
      {sub && <div className="text-[12.5px] text-muted">{sub}</div>}
      {art && (
        <a href={`/dashboard/articles/${art.slug}`} className="inline-flex items-center gap-1 text-[12.5px] text-emerald-600 hover:text-emerald-700 mt-0.5">
          <span aria-hidden="true">↗</span>{(lang === 'ru' ? art.ru : art.en) || tr.grammar.articleFallback}
        </a>
      )}
      {shownReason && <LockLine reason={shownReason} />}
    </div>
  );

  if (topic.allLocked) {
    // Tapping a locked row shows why it is locked. A div with role="button", not a <button>:
    // the row can hold the article link (component library: no interactive control inside a button).
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => setRevealed(true)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setRevealed(true); } }}
        aria-expanded={!!shownReason}
        className={`px-5 py-3 flex items-center gap-2.5 cursor-pointer ${rowClass(isNext)}`}
        data-testid="topic-row"
        data-state="locked"
      >
        {body}
      </div>
    );
  }
  return (
    <div
      className={`px-5 py-3 flex flex-col min-[860px]:flex-row min-[860px]:items-center gap-2.5 min-[860px]:gap-6 ${rowClass(isNext)}`}
      data-testid="topic-row"
      data-state={isNext ? 'next' : topic.passed ? 'passed' : started ? 'started' : 'open'}
    >
      {body}
      <LevelStrip topic={topic} onStart={onStart} onLocked={() => setRevealed(true)} />
    </div>
  );
}

export function GrammarProgramPage({
  model, mine, justAdded, onUndo, onRemove, onStart, onReview, notice,
}: {
  model: GProgram;
  mine: GProgram[];
  justAdded: boolean;
  onUndo: () => void;
  onRemove: () => void;
  onStart: (l: Lesson) => void;
  onReview: () => void;
  notice: ReactNode;
}) {
  const { tr, lang, plural, nextText, weakestText, lessonLabel } = useLabels();
  const wide = useWide();
  const p = model.program;

  // Theory link once in the header when every topic shares one article.
  const slugs = new Set(model.topics.map((t) => topicArticle(t.lessons)?.slug ?? null));
  const shared = slugs.size === 1 && model.topics[0] ? topicArticle(model.topics[0].lessons) : null;

  let line: ReactNode = null;
  let cta: ReactNode = null;
  if (model.next) {
    line = <>{tr.overview.next} — {nextText(model, false)}</>;
    cta = (
      <button type="button" onClick={() => onStart(model.next!)} className={HEADER_BTN} data-testid="program-continue">
        {model.touched ? tr.overview.continue : tr.overview.start} <TakChevron size={10} />
      </button>
    );
  } else if (model.complete) {
    line = <DoneLine doneLabel={tr.overview.doneG} lastResultAt={model.lastResultAt} weakest={model.weakest ? weakestText(model.weakest) : null} />;
    cta = model.canReview ? (
      <>
        <button type="button" onClick={onReview} className={HEADER_BTN} data-testid="program-review">
          {tr.overview.reviewTasks} <TakChevron size={10} />
        </button>
        <p className="text-[12.5px] text-muted">{tr.overview.reviewHint}</p>
      </>
    ) : null;
  }

  // «Осталось»: open topics (next, then started), two more, the rest folded; locked tail after.
  const left = model.topics.filter((t) => !t.passed);
  const isNx = (t: GTopic) => !!model.next && t.lessons.some((l) => l.id === model.next!.id);
  const open = left.filter((t) => !t.allLocked)
    .map((t, i) => ({ t, i }))
    .sort((a, b) => (Number(isNx(b.t)) - Number(isNx(a.t))) || (Number(b.t.started) - Number(a.t.started)) || (a.i - b.i))
    .map((x) => x.t);
  const locked = left.filter((t) => t.allLocked);
  const keep = open.filter((t) => isNx(t) || t.started).length + 2;
  const rest = open.slice(keep);
  const firstLockedPrev = locked[0] ? model.prev.get(locked[0].lessons[0].id) : undefined;
  const firstReason = firstLockedPrev ? `${fill(tr.overview.opensAfter, { x: lessonLabel(firstLockedPrev) })} — ${tr.overview.needOver}` : null;
  const anyLocked = left.some((t) => t.lessons.some((l) => l.is_locked));
  const topicUnit = (n: number) => `${n} ${plural(n, tr.grammar.topicsCount)}`;
  const legend = model.touched ? tr.overview.legend : tr.overview.legendNew;
  const row = (t: GTopic, reason?: string | null) => (
    <TopicRow key={t.key} model={model} topic={t} reason={reason} showArticle={!shared} onStart={onStart} />
  );

  const done = model.topics.filter((t) => t.passed).sort((a, b) => byScore(a.weakest!, b.weakest!));
  const w = done[0]?.weakest ?? null;

  return (
    <>
      <ProgramSwitcher
        backHref="/dashboard/grammar"
        backLabel={tr.grammar.title}
        chips={mine.filter((m) => m.program.id !== p.id).map((m) => ({
          id: m.program.id, href: programHref(m.program.id), title: programTitle(m.program, lang),
          complete: m.complete, done: m.done, total: m.total,
        }))}
      />
      {justAdded && <AddedBanner title={programTitle(p, lang)} onUndo={onUndo} />}
      {notice}
      <ProgramHeader
        title={programTitle(p, lang)}
        description={programDescription(p, lang)}
        done={model.done}
        total={model.total}
        statsLabel={tr.grammar.statsPassed}
        extraStat={fill(tr.overview.topicsPassed, { d: model.topicsDone, t: model.topics.length, u: plural(model.topics.length, tr.grammar.topicsCount) })}
        theory={shared ? { href: `/dashboard/articles/${shared.slug}`, label: (lang === 'ru' ? shared.ru : shared.en) || tr.grammar.articleFallback } : null}
        line={line}
        cta={cta}
        mascotPhrase="Mokomės!"
        onRemove={onRemove}
      />
      {left.length > 0 && (
        <RemainingCard countLabel={topicUnit(left.length)} legend={legend} foot={anyLocked ? <PremiumFoot /> : null}>
          <Rows>
            {open.slice(0, keep).map((t) => row(t))}
            <Fold key={`open-${wide}`} label={fill(tr.overview.moreOpen, { k: topicUnit(rest.length) })} rows={rest.map((t) => row(t))} defaultOpen={wide} testId="fold-open" />
            {locked.slice(0, 2).map((t, i) => row(t, i === 0 ? firstReason : null))}
            <Fold label={fill(tr.overview.moreLocked, { k: topicUnit(locked.length - 2) })} rows={locked.slice(2).map((t) => row(t))} testId="fold-locked" />
          </Rows>
        </RemainingCard>
      )}
      {done.length > 0 && (
        <PassedCard
          countLabel={topicUnit(done.length)}
          weakest={w ? <>{lessonLabel(w)} <span className="text-emerald-600 font-semibold whitespace-nowrap">✓ {pct(w.best_score_pct ?? 0)}</span></> : null}
          complete={model.complete}
          review={model.canReview ? { label: tr.overview.reviewTasks, hint: tr.overview.reviewHint, onClick: onReview } : null}
          legend={legend}
        >
          {done.map((t) => row(t))}
        </PassedCard>
      )}
    </>
  );
}
