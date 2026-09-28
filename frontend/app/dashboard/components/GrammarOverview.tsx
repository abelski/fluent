'use client';

// #53 — the Грамматика lesson list: hero → program chips → bento (featured card +
// stacked program cards) → topic cards. Presentational only: the page fetches,
// owns state and passes handlers in. See documentation/grammar-bento.md.

import Link from 'next/link';
import type { GrammarProgramSummary } from '../../../lib/api';
import { useT } from '../../../lib/useT';
import PageMascot from '../../../components/PageMascot';
import TakChevron from '../../../components/TakChevron';
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

export type Featured =
  | { kind: 'next'; program: GrammarProgramSummary; lesson: Lesson }
  | { kind: 'preview'; program: GrammarProgramSummary }
  | { kind: 'done'; program: GrammarProgramSummary; premium: boolean };

const LEVEL_STYLES: Record<string, string> = {
  basic: 'bg-teal-50 border-line text-teal-600',
  advanced: 'bg-emerald-50 border-line text-emerald-600',
  practice: 'bg-amber-50 border-line text-amber-600',
};

const INK_BTN = 'inline-flex items-center gap-1.5 bg-ink hover:bg-black text-white text-sm font-semibold rounded-[10px] px-[18px] py-[11px] transition-colors';
const SOFT_BTN = 'inline-flex items-center bg-emerald-50 text-emerald-600 hover:bg-emerald-100 font-semibold rounded-[10px] transition-colors';
const CARD = 'bg-white border border-line rounded-[14px]';
const KICKER = 'text-xs font-semibold tracking-[0.06em] uppercase text-muted';

export const isPassed = (l: Lesson) => (l.best_score_pct ?? 0) > 0.75;
const isNoun = (l: Lesson) => l.id < 200;

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

// Consecutive lessons with the same title form one topic (same rule the old accordion used).
function groupTopics(lessons: Lesson[]): Lesson[][] {
  const groups: Lesson[][] = [];
  for (const l of lessons) {
    const last = groups[groups.length - 1];
    if (last && last[0].title === l.title) last.push(l);
    else groups.push([l]);
  }
  return groups;
}

// Next lesson: first lesson (list order) of the first enrolled program (programs order)
// that is neither locked nor passed.
function pickNext(programs: GrammarProgramSummary[], byProgram: LessonsByProgram) {
  for (const program of programs) {
    if (!program.enrolled) continue;
    const lesson = (byProgram[program.id] ?? []).find((l) => !l.is_locked && !isPassed(l));
    if (lesson) return { program, lesson };
  }
  return null;
}

/** What the featured card shows for the selected chip; null when there are no programs. */
export function featuredFor(
  selected: number | 'all',
  programs: GrammarProgramSummary[],
  byProgram: LessonsByProgram,
): Featured | null {
  const hasLocked = (ps: GrammarProgramSummary[]) => ps.some((p) => (byProgram[p.id] ?? []).some((l) => l.is_locked));
  if (selected === 'all') {
    const next = pickNext(programs, byProgram);
    if (next) return { kind: 'next', ...next };
    const notEnrolled = programs.find((p) => !p.enrolled);
    if (notEnrolled) return { kind: 'preview', program: notEnrolled };
    if (programs.length === 0) return null;
    return { kind: 'done', program: programs[0], premium: hasLocked(programs) };
  }
  const program = programs.find((p) => p.id === selected);
  if (!program) return null;
  if (!program.enrolled) return { kind: 'preview', program };
  const next = pickNext([program], byProgram);
  if (next) return { kind: 'next', ...next };
  return { kind: 'done', program, premium: hasLocked([program]) };
}

function ProgressBar({ pct, className = '' }: { pct: number; className?: string }) {
  return (
    <div className={`h-1.5 bg-gray-100 rounded-full overflow-hidden ${className}`}>
      <div className="h-full bg-emerald-600 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
    </div>
  );
}

function LockIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" className="shrink-0" aria-hidden="true">
      <path d="M18 8h-1V6A5 5 0 007 6v2H6a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V10a2 2 0 00-2-2zm-6 9a2 2 0 110-4 2 2 0 010 4zm3.1-9H8.9V6a3.1 3.1 0 016.2 0v2z" />
    </svg>
  );
}

function levelTail(l: Lesson, preview: boolean) {
  if (preview || l.best_score_pct === null || l.best_score_pct === undefined) return '';
  return isPassed(l) ? '✓' : `${Math.round(l.best_score_pct * 100)}%`;
}

// ── Hero ────────────────────────────────────────────────────────────────────

const DECLENSION: [string, string][] = [['as', 'V.'], ['o', 'K.'], ['ui', 'N.'], ['ą', 'G.']];

export function GrammarHero({
  passed,
  total,
  none,
  onContinue,
  onStartCases,
  remind,
}: {
  passed: number;
  total: number;
  none: boolean;
  onContinue: (() => void) | null;
  onStartCases: (() => void) | null;
  remind: { onClick: () => void; disabled: boolean; hint?: string } | null;
}) {
  const { tr } = useT();
  const pct = total > 0 ? Math.round((passed / total) * 100) : 0;

  return (
    <section
      data-testid="stats-card-grammar"
      className={`${CARD} px-5 py-[22px] min-[860px]:px-9 min-[860px]:py-8 flex flex-col min-[860px]:flex-row min-[860px]:items-center gap-5 min-[860px]:gap-8`}
    >
      <div className="flex-1 min-w-0">
        <h1 className="text-[28px] min-[420px]:text-[32px] font-bold tracking-[-0.02em] text-ink mb-1.5">{tr.grammar.title}</h1>
        <p className="text-[15px] text-muted max-w-[52ch]">{none ? tr.grammar.emptySubtitle : tr.grammar.subtitle}</p>
        <p className="text-[13px] text-muted mt-1">{tr.grammar.charactersNote}</p>

        <div className="mt-5 flex items-baseline flex-wrap gap-2.5">
          <p className="text-[30px] font-bold text-ink leading-none tabular-nums" data-testid="grammar-hero-count">{passed}</p>
          {!none && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 whitespace-nowrap">
              {tr.grammar.statsOf} {total}
            </span>
          )}
          <p className="text-[13px] text-muted">{tr.grammar.statsPassed}</p>
        </div>
        <ProgressBar pct={pct} className="mt-3 max-w-[440px]" />

        {(onContinue || onStartCases || remind) && (
          <div className="mt-5 flex flex-wrap gap-2.5">
            {onStartCases && (
              <button type="button" onClick={onStartCases} className={INK_BTN} data-testid="hero-start-cases">
                {tr.grammar.startWithCases}
              </button>
            )}
            {onContinue && (
              <button type="button" onClick={onContinue} className={INK_BTN} data-testid="hero-continue">
                {tr.grammar.continue} <TakChevron size={10} />
              </button>
            )}
            {remind && (
              <button
                type="button"
                onClick={remind.onClick}
                disabled={remind.disabled}
                className={`${SOFT_BTN} text-sm px-[18px] py-[11px] ${remind.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {tr.stats.remindForgotten}
              </button>
            )}
          </div>
        )}
        {remind?.hint && <p className="text-xs text-faint mt-1.5">{remind.hint}</p>}
      </div>

      <div className="order-first min-[860px]:order-none flex items-end gap-5 shrink-0">
        <div aria-hidden="true" className="hidden min-[860px]:block border border-line rounded-xl px-4 py-3 text-sm min-w-[190px]">
          <div className="text-[11px] font-semibold tracking-[0.06em] uppercase text-muted mb-1.5">
            <span lang="lt">namas</span> · {tr.grammar.declHouse}
          </div>
          {DECLENSION.map(([ending, letter], i) => (
            <div key={letter} className={`flex justify-between gap-4 py-1 ${i > 0 ? 'border-t border-line-soft' : ''}`}>
              <span lang="lt">nam<span className="text-emerald-600 font-bold">{ending}</span></span>
              <span className="text-xs text-muted">{letter}</span>
            </div>
          ))}
        </div>
        <PageMascot phrase="Mokomės!" className="shrink-0" />
      </div>
    </section>
  );
}

// ── Chips ───────────────────────────────────────────────────────────────────

export function ProgramChips({
  programs,
  counts,
  allCount,
  selected,
  onSelect,
}: {
  programs: GrammarProgramSummary[];
  counts: Record<number, number>;
  allCount: number;
  selected: number | 'all';
  onSelect: (id: number | 'all') => void;
}) {
  const { tr, lang } = useT();
  const chip = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 min-h-11 min-[860px]:min-h-0 text-sm font-semibold transition-colors ${
      active ? 'bg-ink border-ink text-white' : 'bg-white border-line text-ink hover:border-faint'
    }`;
  const count = (active: boolean) => `text-xs font-medium tabular-nums ${active ? 'text-white/70' : 'text-muted'}`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" aria-pressed={selected === 'all'} onClick={() => onSelect('all')} className={chip(selected === 'all')} data-testid="category-all">
        {tr.grammar.allChip}
        <span className={count(selected === 'all')}>{allCount}</span>
      </button>
      {programs.map((p) => {
        const active = selected === p.id;
        return (
          <button
            key={p.id}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(p.id)}
            className={chip(active)}
            data-testid={`category-program-${p.id}`}
          >
            {p.enrolled && <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" data-testid="enrolled-dot" />}
            {programTitle(p, lang)}
            <span className={count(active)}>{counts[p.id] ?? 0}</span>
          </button>
        );
      })}
      <Link
        href="/dashboard/grammar/programs"
        data-testid="browse-programs-link"
        className="w-full min-[860px]:w-auto min-[860px]:ml-auto text-sm font-medium text-emerald-600 hover:text-emerald-700 transition-colors"
      >
        {tr.grammar.browseProgramsLink} <TakChevron size={10} className="inline-block align-[-1px]" />
      </Link>
    </div>
  );
}

// ── Featured card ───────────────────────────────────────────────────────────

export function FeaturedCard({
  featured,
  lessons,
  hideAddFor,
  onStart,
  onAdd,
}: {
  featured: Featured;
  lessons: Lesson[]; // the featured program's lessons
  hideAddFor: number | null; // program the hero already offers to enroll
  onStart: (l: Lesson) => void;
  onAdd: (programId: number) => void;
}) {
  const { tr, plural, lang } = useT();
  const title = programTitle(featured.program, lang);
  const shell = `${CARD} p-5 min-[860px]:px-8 min-[860px]:py-7 flex flex-col gap-3.5 min-[860px]:min-h-[340px]`;
  const heading = 'text-[28px] min-[420px]:text-[32px] font-bold tracking-[-0.02em] leading-tight text-ink [overflow-wrap:anywhere]';

  if (featured.kind === 'next') {
    const { lesson } = featured;
    const topic = groupTopics(lessons).find((g) => g.some((l) => l.id === lesson.id)) ?? [lesson];
    const sub = caseName(lesson, lang);
    const donePassed = topic.filter(isPassed).length;
    return (
      <article className={shell} data-testid="featured-card" data-kind="next">
        <div className={KICKER}>{tr.grammar.continueHere} · {title}</div>
        <h2 className={heading} lang={isNoun(lesson) ? 'lt' : undefined} data-testid="featured-heading">
          {lessonHeading(lesson, lang)}
        </h2>
        {sub && <p className="text-xl font-bold text-ink" data-testid="featured-subheading">{sub}</p>}
        <div className="text-sm text-muted">
          {tr.grammar.levels[lesson.level] ?? lesson.level} ·{' '}
          {tr.grammar.lessonOf.replace('{i}', String(topic.indexOf(lesson) + 1)).replace('{n}', String(topic.length))} ·{' '}
          {lesson.task_count} {plural(lesson.task_count, tr.grammar.tasksCount)}
        </div>
        <div className="flex flex-wrap gap-2">
          {topic.map((l) => {
            const tail = levelTail(l, false);
            return (
              <span key={l.id} className={`inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full border ${LEVEL_STYLES[l.level] ?? ''} ${l.is_locked ? 'opacity-40' : ''}`}>
                {l.is_locked && <LockIcon />}
                {tr.grammar.levels[l.level] ?? l.level}
                {tail && ` ${tail}`}
              </span>
            );
          })}
        </div>
        <div className="mt-auto pt-2 flex items-center gap-3.5 flex-wrap">
          <button type="button" onClick={() => onStart(lesson)} className={INK_BTN} data-testid="featured-start">
            {tr.grammar.startLesson} <TakChevron size={10} />
          </button>
          <span className="text-[13px] text-muted">
            {donePassed}/{topic.length} {plural(topic.length, tr.grammar.lessonsCount)}
          </span>
        </div>
      </article>
    );
  }

  if (featured.kind === 'preview') {
    const p = featured.program;
    const topics = groupTopics(lessons).length;
    return (
      <article className={shell} data-testid="featured-card" data-kind="preview">
        <div className={KICKER}>
          {tr.grammar.program}
          {tr.grammar.difficulty[p.difficulty] ? ` · ${tr.grammar.difficulty[p.difficulty]}` : ''}
        </div>
        <h2 className={heading}>{title}</h2>
        {programDescription(p, lang) && (
          <p className="text-[14.5px] leading-relaxed text-muted max-w-[56ch]">{programDescription(p, lang)}</p>
        )}
        <div className="text-sm text-muted">
          {lessons.length} {plural(lessons.length, tr.grammar.lessonsCount)} · {topics} {plural(topics, tr.grammar.topicsCount)}
        </div>
        {p.id !== hideAddFor && (
          <div className="mt-auto pt-2">
            <button type="button" onClick={() => onAdd(p.id)} className={INK_BTN} data-testid="featured-add">
              {tr.grammar.add}
            </button>
          </div>
        )}
      </article>
    );
  }

  return (
    <article className={shell} data-testid="featured-card" data-kind="done">
      <div className={KICKER}>{title}</div>
      <h2 className="text-xl font-bold text-ink">{tr.grammar.programDone}</h2>
      {featured.premium && (
        <Link
          href="/pricing"
          data-testid="featured-premium-link"
          className="self-start text-sm font-semibold text-amber-700 hover:text-amber-600 transition-colors"
        >
          {tr.grammar.premiumNext} <TakChevron size={10} className="inline-block align-[-1px]" />
        </Link>
      )}
    </article>
  );
}

// ── Stack ───────────────────────────────────────────────────────────────────

export function ProgramStack({
  programs,
  byProgram,
  onOpen,
  onAdd,
}: {
  programs: GrammarProgramSummary[];
  byProgram: LessonsByProgram;
  onOpen: (programId: number) => void;
  onAdd: (programId: number) => void;
}) {
  const { tr, plural, lang } = useT();
  return (
    <div className="flex flex-col gap-4">
      {programs.map((p) => {
        const ls = byProgram[p.id] ?? [];
        const title = <h3 className="text-[17px] font-bold text-ink">{programTitle(p, lang)}</h3>;
        if (p.enrolled) {
          const done = ls.filter(isPassed).length;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onOpen(p.id)}
              data-testid={`stack-card-${p.id}`}
              className={`${CARD} px-[22px] py-5 flex flex-col gap-2.5 text-left w-full hover:border-faint transition-colors`}
            >
              <div className="flex justify-between items-baseline gap-3 w-full">
                {title}
                <span className="text-[13px] text-muted tabular-nums whitespace-nowrap">{done}/{ls.length}</span>
              </div>
              <ProgressBar pct={ls.length ? Math.round((done / ls.length) * 100) : 0} className="w-full" />
              <span className="text-[13px] font-semibold text-emerald-600">
                {tr.grammar.open} <TakChevron size={9} className="inline-block align-[-1px]" />
              </span>
            </button>
          );
        }
        return (
          <div key={p.id} className={`${CARD} px-[22px] py-5 flex flex-col gap-2.5`} data-testid={`stack-card-${p.id}`}>
            <div className="flex justify-between items-baseline gap-3">
              {title}
              <span className="text-[13px] text-muted whitespace-nowrap">{ls.length} {plural(ls.length, tr.grammar.lessonsCount)}</span>
            </div>
            {programDescription(p, lang) && <p className="text-[13px] text-muted">{programDescription(p, lang)}</p>}
            <button
              type="button"
              onClick={() => onAdd(p.id)}
              className={`${SOFT_BTN} self-start text-[13px] px-3.5 py-[7px] min-h-11 min-[860px]:min-h-0`}
              data-testid={`stack-add-${p.id}`}
            >
              {tr.grammar.add}
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ── Topics ──────────────────────────────────────────────────────────────────

export function TopicCard({
  lessons,
  preview,
  onStart,
}: {
  lessons: Lesson[];
  preview: boolean;
  onStart: (l: Lesson) => void;
}) {
  const { tr, plural, lang } = useT();
  const first = lessons[0];
  const total = lessons.length;
  const passed = preview ? 0 : lessons.filter(isPassed).length;
  const complete = !preview && total > 0 && passed === total;
  const sub = caseName(first, lang);
  const rule = first.rules?.find((r) => r.article_slug);
  const draft = lessons.find((l) => l.status && l.status !== 'published')?.status;
  const hasLocked = !preview && lessons.some((l) => l.is_locked);

  return (
    <div className={`${CARD} px-5 py-[18px] flex flex-col gap-3`} data-testid="topic-card">
      <div className="flex justify-between items-start gap-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-[14.5px] font-semibold text-ink" lang={isNoun(first) ? 'lt' : undefined}>
              {lessonHeading(first, lang)}
            </h3>
            {draft && (
              <span className="text-[10px] font-semibold uppercase tracking-wide bg-amber-50 text-amber-600 border border-amber-200 rounded px-1.5 py-px leading-tight">
                {draft === 'draft' ? tr.grammar.lessonStatusDraft : tr.grammar.lessonStatusTesting}
              </span>
            )}
          </div>
          {sub && <div className="text-[12.5px] text-muted mt-0.5">{sub}</div>}
          {rule?.article_slug && (
            <a
              href={`/dashboard/articles/${rule.article_slug}`}
              className="inline-flex items-center gap-1 text-[13px] text-emerald-600 hover:text-emerald-700 mt-1"
            >
              <span aria-hidden="true">↗</span>
              {(lang === 'ru' ? rule.article_title_ru : rule.article_title_en) || tr.grammar.articleFallback}
            </a>
          )}
        </div>
        <span className={`text-[13px] tabular-nums whitespace-nowrap ${complete ? 'text-emerald-600' : 'text-faint'}`}>
          {preview ? `${total} ${plural(total, tr.grammar.levelsCount)}` : `${passed}/${total}`}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {lessons.map((l) => {
          const locked = l.is_locked;
          const tail = levelTail(l, preview);
          return (
            <button
              key={l.id}
              type="button"
              onClick={() => onStart(l)}
              disabled={locked || preview}
              data-testid={locked ? 'lesson-locked' : 'level-button'}
              className={`inline-flex items-center justify-center gap-1 text-xs px-3 py-1 min-h-11 min-[860px]:min-h-0 rounded-full border transition-colors ${LEVEL_STYLES[l.level] ?? ''} ${
                locked ? 'opacity-40 cursor-not-allowed' : preview ? 'cursor-default' : 'hover:border-faint'
              }`}
            >
              {locked && <LockIcon />}
              {tr.grammar.levels[l.level] ?? l.level}
              {tail && <span className="font-semibold">{tail}</span>}
            </button>
          );
        })}
      </div>
      {/* The upsell sits outside the (disabled, dimmed) level buttons so it stays
          clickable and legible. `is_locked` is server-side and already false for
          premium/admin, so this only ever renders for free users. */}
      {hasLocked && (
        <Link
          href="/pricing"
          data-testid="lesson-locked-upsell"
          className="self-start text-[12px] font-medium text-amber-700 hover:text-amber-600 transition-colors"
        >
          {tr.grammar.lockedUpsell}
        </Link>
      )}
    </div>
  );
}

export function TopicsSection({
  program,
  lessons,
  onStart,
  onUnenroll,
}: {
  program: GrammarProgramSummary;
  lessons: Lesson[];
  onStart: (l: Lesson) => void;
  onUnenroll: () => void;
}) {
  const { tr, plural, lang } = useT();
  const preview = !program.enrolled;
  return (
    <section className="flex flex-col gap-3 mt-3" data-testid="topics-section">
      <div className="flex items-baseline gap-2.5 flex-wrap">
        <h2 className="text-xl font-bold text-ink">
          {preview ? tr.grammar.insideTitle : tr.grammar.topicsTitle}: {programTitle(program, lang)}
        </h2>
        <span className="text-[13px] text-muted">{lessons.length} {plural(lessons.length, tr.grammar.lessonsCount)}</span>
        {!preview && (
          <button
            type="button"
            onClick={onUnenroll}
            className="ml-auto text-[13px] text-destructive hover:opacity-70 transition-opacity min-h-11 min-[860px]:min-h-0"
            data-testid="unenroll-button"
          >
            {tr.grammar.unenrollBtn}
          </button>
        )}
      </div>
      {lessons.length === 0 ? (
        <p className="text-faint text-sm py-8 text-center">{tr.grammar.noLessons}</p>
      ) : (
        <div className="grid gap-3 grid-cols-1 min-[860px]:grid-cols-2 min-[1200px]:grid-cols-3">
          {groupTopics(lessons).map((g) => (
            <TopicCard key={g[0].id} lessons={g} preview={preview} onStart={onStart} />
          ))}
        </div>
      )}
    </section>
  );
}
