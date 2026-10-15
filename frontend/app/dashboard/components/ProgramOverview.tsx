'use client';

// #66 — the shared pieces of the Грамматика / Практика overview and program pages:
// overview cards («В процессе»), completed rows («Завершённые»), catalogue cards («Другие
// программы»), the program page shell (switcher, header, «Осталось», «Пройдено») and the one
// status wording both pages use. Presentational only: each page builds its own rows and
// passes them in. See documentation/overview-pages.md.

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import PageMascot from '../../../components/PageMascot';
import TakChevron from '../../../components/TakChevron';
import { useT } from '../../../lib/useT';
import { CARD, INK_BTN, LockIcon, ProgressBar, SOFT_BTN } from './BentoParts';

/** Small uppercase label in the readable info grey. */
export const OV_KICKER = 'text-[11px] font-semibold tracking-[0.06em] uppercase text-ink-soft';
/** Outline button used for the review session («Повторить · ~10 заданий»). */
export const OUTLINE_BTN = 'inline-flex items-center justify-center gap-1.5 min-h-11 min-[860px]:min-h-9 px-3.5 rounded-[10px] border border-line bg-white text-ink hover:border-faint text-[13px] font-semibold tabular-nums whitespace-nowrap transition-colors';
const SECTION_LINK = 'inline-flex items-center gap-1 text-[13px] font-semibold text-emerald-600 hover:text-emerald-700 transition-colors min-h-11 min-[860px]:min-h-0';
const ROW_HOVER = 'hover:bg-[#fafbfa]';
const NEXT_TINT = 'bg-[#f7faf8]';

/** «Пора повторить» keys on 7+ days since the program's last session (#66 decision). */
export const DUE_AFTER_DAYS = 7;

export function fill(s: string, values: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (_, k) => String(values[k] ?? ''));
}

export const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Whole days since an ISO date (the API's `last_result_at`); null when there is no date. */
export function daysSince(iso: string | null | undefined, now: number = Date.now()): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : Math.max(0, Math.floor((now - t) / 86_400_000));
}

export const isDue = (iso: string | null | undefined) => (daysSince(iso) ?? 0) >= DUE_AFTER_DAYS;

/** Titles that already carry «» must not get a second pair when quoted. */
export const quoteless = (s: string) => s.replace(/^«(.*)»$/, '$1');

/** Most recent first; programs never practised go last, in their original order. */
export function byLastResult<T extends { lastResultAt: string | null }>(xs: T[]): T[] {
  return [...xs].sort((a, b) => (Date.parse(b.lastResultAt ?? '') || 0) - (Date.parse(a.lastResultAt ?? '') || 0));
}

// ── One status wording on both pages ────────────────────────────────────────
// New → «нужно …»; tried below the pass mark → amber «лучший 45%»; passed → green «✓ 90%»;
// the sample test (pass mark 0) → «без проходного балла», never «нужно 0%».

export function StatusLabel({
  score,
  passed,
  trial = false,
  need,
}: {
  score: number | null;
  passed: boolean;
  trial?: boolean;
  need: string; // «нужно больше 75%» (grammar) / «нужно 60%» (practice)
}) {
  const { tr } = useT();
  if (passed && score !== null) {
    return <span className="text-emerald-600 font-semibold tabular-nums whitespace-nowrap" data-status="passed">✓ {pct(score)}</span>;
  }
  if (trial) return <span data-status="trial">{tr.overview.noPass}</span>;
  if (score !== null) {
    return (
      <span data-status="tried">
        <span className="text-amber-700 font-semibold tabular-nums whitespace-nowrap">
          {fill(tr.overview.best, { s: Math.round(score * 100) })}
        </span>{' '}· {need}
      </span>
    );
  }
  return <span data-status="new">{need}</span>;
}

export function DueTag() {
  const { tr } = useT();
  return (
    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#fdf6e3] text-[#8a6d1d] whitespace-nowrap" data-testid="due-tag">
      {tr.overview.due}
    </span>
  );
}

export function StartedTag() {
  const { tr } = useT();
  return (
    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#f2f3f3] text-ink-soft whitespace-nowrap" data-testid="started-tag">
      {tr.overview.started}
    </span>
  );
}

export function LockLine({ reason }: { reason: ReactNode }) {
  return (
    <div className="text-[13px] text-[#3a3d42] mt-1 flex items-start gap-1.5" data-testid="lock-reason">
      <span className="mt-[3px]"><LockIcon /></span>
      <span className="[overflow-wrap:anywhere]">{reason}</span>
    </div>
  );
}

/** «последний раз N дней назад» / «последний раз сегодня»; nothing without a date. */
export function lastTimeText(iso: string | null | undefined, tr: ReturnType<typeof useT>['tr'], plural: ReturnType<typeof useT>['plural']): string | null {
  const d = daysSince(iso);
  if (d === null) return null;
  if (d === 0) return tr.overview.lastToday;
  return fill(tr.overview.lastTime, { d, u: plural(d, tr.overview.days) });
}

// Named groups so a caret only follows its own <details>, never an open ancestor.
const CARET_TURN = {
  passed: 'group-open/passed:rotate-180',
  fold: 'group-open/fold:rotate-180',
  inside: 'group-open/inside:rotate-180',
  block: 'group-open/block:rotate-180',
} as const;

export function Caret({ group }: { group: keyof typeof CARET_TURN }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" className={`shrink-0 text-muted transition-transform ${CARET_TURN[group]}`} aria-hidden="true">
      <path d="M6 8L1 3h10L6 8z" />
    </svg>
  );
}

export function SectionTitle({ title, hint, children }: { title: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="flex items-baseline gap-x-2.5 gap-y-1 flex-wrap">
      <h2 className="text-xl font-bold text-ink">{title}</h2>
      {hint && <span className="text-[13px] text-muted">{hint}</span>}
      {children}
    </div>
  );
}

/** Grid for overview cards: 1 column on phones, 2 from 860px, 3 from 1200px when it divides evenly. */
export const gridFor = (n: number, stretch = false) =>
  `grid gap-3 ${stretch ? 'items-stretch' : 'items-start'} grid-cols-1 min-[860px]:grid-cols-2${n % 3 === 0 ? ' min-[1200px]:grid-cols-3' : ''}`;

// ── Overview ────────────────────────────────────────────────────────────────

/** «В процессе»: the whole card opens the program page and names its next step. No buttons. */
export function InProgressCard({
  href, title, done, total, unit, next, testId,
}: {
  href: string;
  title: string;
  done: number;
  total: number;
  unit: string;
  next: ReactNode | null;
  testId: string;
}) {
  const { tr } = useT();
  return (
    <Link href={href} data-testid={testId} className={`${CARD} px-[22px] py-5 flex flex-col gap-3 hover:border-faint transition-colors`}>
      <span className="flex justify-between items-baseline gap-3">
        <span className="text-[17px] font-bold text-ink">{title}</span>
        <span className="text-[13px] text-muted tabular-nums whitespace-nowrap">{done}/{total} {unit}</span>
      </span>
      <ProgressBar pct={total ? Math.round((done / total) * 100) : 0} className="w-full" />
      {next && <span className="block text-[13px] text-ink-soft [overflow-wrap:anywhere]">{tr.overview.next} — {next}</span>}
      <span className="mt-auto inline-flex items-center gap-1 text-[13px] font-semibold text-emerald-600">
        {tr.overview.openProgram} <TakChevron size={9} />
      </span>
    </Link>
  );
}

export interface CompletedRow {
  key: number;
  href: string;
  title: string;
  done: number;
  total: number;
  lastResultAt: string | null;
  weakest: ReactNode | null; // «X — ✓ 78%»
  reviewLabel: string;
  reviewHint: string;
  onReview: (() => void) | null; // null hides the button (nothing eligible)
}

/** «Завершённые»: one row per fully passed program; due rows first. */
export function CompletedBlock({ rows }: { rows: CompletedRow[] }) {
  const { tr, plural } = useT();
  if (!rows.length) return null;
  const sorted = [...rows].sort((a, b) => Number(isDue(b.lastResultAt)) - Number(isDue(a.lastResultAt)));
  return (
    <details className="group/passed flex flex-col gap-3" data-testid="completed-section">
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden min-h-11 flex items-center">
        <SectionTitle title={tr.overview.completed} hint={tr.overview.completedHint}>
          <span className="text-[13px] text-muted tabular-nums">{rows.length}</span>
          <Caret group="passed" />
        </SectionTitle>
      </summary>
      <div className={`${CARD} overflow-hidden divide-y divide-line-soft mt-3`}>
        {sorted.map((r) => {
          const last = lastTimeText(r.lastResultAt, tr, plural);
          return (
            <div key={r.key} className={`relative px-5 py-4 pr-11 flex flex-col gap-2 ${ROW_HOVER} transition-colors`} data-testid={`completed-row-${r.key}`}>
              <div className="flex items-center gap-x-2 gap-y-1 flex-wrap">
                <span className="text-emerald-600 font-bold" aria-hidden="true">✓</span>
                <Link href={r.href} className="text-[15px] font-bold text-ink after:absolute after:inset-0">{r.title}</Link>
                <span className="text-[13px] text-muted tabular-nums">{r.done}/{r.total}</span>
                {isDue(r.lastResultAt) && <DueTag />}
              </div>
              <span className="absolute right-5 top-5" aria-hidden="true"><TakChevron size={10} /></span>
              {(last || r.weakest) && (
                <p className="text-[12.5px] text-ink-soft [overflow-wrap:anywhere]">
                  {last}{last && r.weakest ? ' · ' : ''}
                  {r.weakest && <>{tr.overview.weakest.toLowerCase()}: {r.weakest}</>}
                </p>
              )}
              {r.onReview && (
                <div className="relative z-10 flex flex-col min-[860px]:flex-row min-[860px]:items-center gap-2 min-[860px]:gap-3">
                  <button type="button" onClick={r.onReview} className={`${OUTLINE_BTN} self-start min-[860px]:self-auto`} data-testid="completed-review">
                    {r.reviewLabel} <TakChevron size={9} />
                  </button>
                  <p className="text-[12.5px] text-muted">{r.reviewHint}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </details>
  );
}

/** «Другие программы» card: «Что внутри» (format line + contents) and «Добавить». */
export function CatalogCard({
  kicker, title, countLabel, description, recommended, format, inside, onAdd, testId,
}: {
  kicker?: string | null;
  title: string;
  countLabel: string;
  description: string;
  recommended: boolean;
  format: string;
  inside: ReactNode[];
  onAdd: () => void;
  testId: string;
}) {
  const { tr } = useT();
  return (
    <div className={`${CARD} px-[22px] py-5 flex flex-col gap-2.5`} data-testid={testId}>
      {kicker && <div className={OV_KICKER}>{kicker}</div>}
      <div className="flex justify-between items-baseline gap-3">
        <h3 className="text-[17px] font-bold text-ink">{title}</h3>
        <span className="text-[13px] text-muted whitespace-nowrap">{countLabel}</span>
      </div>
      {description && <p className="text-[13px] text-muted">{description}</p>}
      {recommended && (
        <span className="self-start text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#f2f3f3] text-ink-soft">{tr.overview.startHere}</span>
      )}
      <details className="group/inside">
        <summary className={`${SECTION_LINK} gap-1.5 cursor-pointer list-none [&::-webkit-details-marker]:hidden`} data-testid={`${testId}-inside`}>
          {tr.overview.inside} <Caret group="inside" />
        </summary>
        <p className="mt-2 text-[12.5px] text-ink-soft">{format}</p>
        <ul className="mt-2 grid gap-1 text-[13px] text-ink">
          {inside.map((x, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-faint" aria-hidden="true">·</span>
              <span className="[overflow-wrap:anywhere]">{x}</span>
            </li>
          ))}
        </ul>
      </details>
      <div className="pt-1">
        <button type="button" onClick={onAdd} className={`${SOFT_BTN} text-[13px] px-3.5 py-[7px] min-h-11 min-[860px]:min-h-0 gap-1.5`} data-testid={`${testId}-add`}>
          {tr.overview.add} <TakChevron size={9} />
        </button>
      </div>
    </div>
  );
}

// ── Program page ────────────────────────────────────────────────────────────

export interface SwitcherChip {
  id: number;
  href: string;
  title: string;
  complete: boolean;
  done: number;
  total: number;
}

/** Back link + «Перейти:» chips for my other programs (a sideways-scrolling row on a phone). */
export function ProgramSwitcher({ backHref, backLabel, chips }: { backHref: string; backLabel: string; chips: SwitcherChip[] }) {
  const { tr } = useT();
  const ordered = [...chips.filter((c) => !c.complete), ...chips.filter((c) => c.complete)];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1" data-testid="program-switcher">
      <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink transition-colors min-h-11" data-testid="program-back">
        <TakChevron size={10} direction="left" /> {backLabel}
      </Link>
      {ordered.length > 0 && (
        <div className="w-full min-[860px]:w-auto min-[860px]:ml-auto flex items-center gap-2 overflow-x-auto min-[860px]:flex-wrap min-[860px]:justify-end -mx-4 px-4 min-[860px]:mx-0 min-[860px]:px-0 [scrollbar-width:none]">
          <span className="shrink-0 text-[12.5px] text-muted">{tr.overview.switchTo}</span>
          {ordered.map((c) => (
            <Link
              key={c.id}
              href={c.href}
              data-testid={`switch-chip-${c.id}`}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 min-h-11 min-[860px]:min-h-9 text-[13px] font-semibold text-ink hover:border-faint whitespace-nowrap transition-colors"
            >
              {c.complete && <span className="text-emerald-600" aria-hidden="true">✓</span>}
              {c.title}
              {!c.complete && <span className="text-xs font-medium tabular-nums text-muted">{c.done}/{c.total}</span>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** «✓ X — теперь в твоих программах · Отменить» after «Добавить». */
export function AddedBanner({ title, onUndo }: { title: string; onUndo: () => void }) {
  const { tr } = useT();
  return (
    <div role="status" className="rounded-xl bg-emerald-50 text-emerald-700 text-[13.5px] font-semibold px-4 py-2 min-h-11 flex items-center gap-3" data-testid="added-banner">
      <span className="flex-1">✓ {fill(tr.overview.added, { x: title })}</span>
      <button type="button" onClick={onUndo} className="shrink-0 underline underline-offset-2 hover:text-emerald-600" data-testid="added-undo">
        {tr.overview.undo}
      </button>
    </div>
  );
}

function ProgramMenu({ onRemove }: { onRemove: () => void }) {
  const { tr } = useT();
  return (
    <details className="relative shrink-0">
      <summary
        aria-label={tr.overview.moreActions}
        className="min-w-11 min-h-11 flex items-center justify-center rounded-[10px] text-muted hover:text-ink text-xl leading-none cursor-pointer list-none [&::-webkit-details-marker]:hidden"
        data-testid="program-menu"
      >
        ⋯
      </summary>
      <div className="absolute right-0 top-full z-30 mt-1 w-56 bg-white border border-line rounded-xl py-1 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
        <button
          type="button"
          onClick={(e) => { (e.currentTarget.closest('details') as HTMLDetailsElement | null)?.removeAttribute('open'); onRemove(); }}
          className="w-full text-left px-4 py-2.5 text-[13.5px] text-destructive hover:bg-[#fafbfa]"
          data-testid="unenroll-button"
        >
          {tr.overview.remove}
        </button>
      </div>
    </details>
  );
}

/**
 * Compact program header: title (⋯ menu in the corner), stats, bar, the «Дальше» line and the
 * page's one button. TAK stays 128px but sits beside the stats, so the button is on the first
 * phone screen (same layout as the compact BentoHero).
 */
export function ProgramHeader({
  title, description, done, total, statsLabel, extraStat, theory, line, cta, mascotPhrase, onRemove,
}: {
  title: string;
  description: string;
  done: number;
  total: number;
  statsLabel: string;
  extraStat?: string | null;
  theory?: { href: string; label: string } | null;
  line: ReactNode | null;
  cta: ReactNode | null;
  mascotPhrase: string;
  onRemove: () => void;
}) {
  const { tr } = useT();
  return (
    <section className={`relative ${CARD} px-5 py-5 min-[860px]:px-8 min-[860px]:py-6 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 min-[860px]:gap-x-8 gap-y-3`} data-testid="program-header">
      <span className="absolute right-2 top-2 z-10"><ProgramMenu onRemove={onRemove} /></span>
      <div className="col-span-2 min-[860px]:col-span-1 pr-10 min-[860px]:pr-0">
        <h1 className="text-[24px] min-[860px]:text-[28px] font-bold tracking-[-0.02em] text-ink leading-tight">{title}</h1>
      </div>
      <div className="row-start-2 col-start-1 min-w-0">
        {description && <p className="hidden min-[860px]:block text-[14px] text-muted mt-1 max-w-[62ch]">{description}</p>}
        <div className="mt-1 min-[860px]:mt-3 flex items-baseline flex-wrap gap-x-2 gap-y-0.5">
          <p className="text-[22px] font-bold text-ink leading-none tabular-nums" data-testid="program-done">{done}</p>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 whitespace-nowrap">{tr.grammar.statsOf} {total}</span>
          <p className="text-[13px] text-muted">{statsLabel}</p>
        </div>
        {extraStat && <p className="text-[13px] text-muted mt-0.5">{extraStat}</p>}
        <ProgressBar pct={total ? Math.round((done / total) * 100) : 0} className="mt-2.5 max-w-[440px]" />
      </div>
      <div className="row-start-2 col-start-2 min-[860px]:row-start-1 min-[860px]:row-span-3 self-start min-[860px]:self-center">
        <PageMascot phrase={mascotPhrase} className="shrink-0" />
      </div>
      <div className="col-span-2 min-[860px]:col-span-1 min-[860px]:col-start-1 flex flex-col gap-2.5">
        {theory && (
          <a href={theory.href} className="self-start inline-flex items-center gap-1 text-[13px] text-emerald-600 hover:text-emerald-700">
            <span aria-hidden="true">↗</span>{tr.overview.theory}: {theory.label}
          </a>
        )}
        {line && <div className="text-[13px] text-ink-soft [overflow-wrap:anywhere]" data-testid="program-next">{line}</div>}
        {cta}
      </div>
    </section>
  );
}

/** The header's main button: full width on a phone. */
export const HEADER_BTN = `${INK_BTN} w-full min-[860px]:w-auto min-[860px]:self-start`;

/** The «Дальше» / «Начни здесь» kicker on the tinted next row. */
export function NextKicker({ label }: { label: string }) {
  return <div className={`${OV_KICKER} mb-0.5`}>{label}</div>;
}

export const rowClass = (isNext: boolean) => (isNext ? NEXT_TINT : '');

export function Rows({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-line-soft">{children}</div>;
}

/** A folded tail of rows («Ещё 6 тем»); a single row is never folded. */
export function Fold({ label, rows, defaultOpen = false, testId }: { label: string; rows: ReactNode[]; defaultOpen?: boolean; testId?: string }) {
  if (rows.length < 2) return <>{rows}</>;
  return (
    <details className="group/fold" open={defaultOpen || undefined} data-testid={testId}>
      <summary className={`px-5 py-3 min-h-11 flex items-center gap-2 text-[13px] font-semibold text-ink ${ROW_HOVER} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
        {label} <Caret group="fold" />
      </summary>
      <div className="border-t border-line-soft"><Rows>{rows}</Rows></div>
    </details>
  );
}

/** True from 860px — Premium's open-topic fold starts open on desktop. */
export function useWide(): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 860px)');
    setWide(mq.matches);
  }, []);
  return wide;
}

/** «Осталось N» card: header (+ legend), rows, optional foot (the Premium link). */
export function RemainingCard({ countLabel, legend, children, foot }: { countLabel: string; legend?: string | null; children: ReactNode; foot?: ReactNode }) {
  const { tr } = useT();
  return (
    <section className={CARD} data-testid="remaining-card">
      <div className="px-5 py-3.5 border-b border-line-strong">
        <div className="flex items-baseline gap-x-2 gap-y-0.5 flex-wrap">
          <h2 className="text-[15px] font-bold text-ink">{tr.overview.remaining}</h2>
          <span className="text-[13px] text-muted tabular-nums">{countLabel}</span>
        </div>
        {legend && <p className="text-[12.5px] text-ink-soft mt-0.5">{legend}</p>}
      </div>
      {children}
      {foot}
    </section>
  );
}

export function PremiumFoot() {
  const { tr } = useT();
  return (
    <Link
      href="/pricing"
      className="flex items-center gap-1 min-h-11 px-5 py-2.5 border-t border-line-soft text-[12.5px] font-medium text-amber-700 hover:text-amber-600"
      data-testid="premium-link"
    >
      {tr.overview.premiumLink} <TakChevron size={9} />
    </Link>
  );
}

/**
 * «Пройдено N · слабее всего: X ✓ 78%» with «Показать ▾». Collapsed while the program is in
 * progress (then it starts with the review session), open once it is complete.
 */
export function PassedCard({
  countLabel, weakest, complete, review, legend, children,
}: {
  countLabel: string;
  weakest: ReactNode | null;
  complete: boolean;
  review: { label: string; hint: string; onClick: () => void } | null;
  legend?: string | null;
  children: ReactNode;
}) {
  const { tr } = useT();
  return (
    <details className={`${CARD} group/passed`} open={complete || undefined} data-testid="passed-card">
      <summary className={`px-5 py-3.5 min-h-11 flex items-baseline gap-x-2 gap-y-0.5 flex-wrap ${ROW_HOVER} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
        <h2 className="text-[15px] font-bold text-ink">{tr.overview.passed}</h2>
        <span className="text-[13px] text-muted tabular-nums">
          {countLabel}
          {!complete && weakest && <> · {tr.overview.weakest.toLowerCase()}: {weakest}</>}
        </span>
        <span className="ml-auto self-center inline-flex items-center gap-1 text-[13px] font-semibold text-emerald-600">
          <span className="group-open/passed:hidden">{tr.overview.show}</span>
          <span className="hidden group-open/passed:inline">{tr.overview.hide}</span>
          <Caret group="passed" />
        </span>
        {complete && legend && <span className="w-full text-[12.5px] text-ink-soft">{legend}</span>}
      </summary>
      <div className="border-t border-line-strong">
        {!complete && review && (
          <div className="px-5 py-3 flex flex-col min-[860px]:flex-row min-[860px]:items-center gap-2 border-b border-line-soft">
            <p className="flex-1 text-[13px] text-ink-soft">{review.hint}</p>
            <button type="button" onClick={review.onClick} className={`${OUTLINE_BTN} self-start min-[860px]:self-auto`} data-testid="passed-review">
              {review.label} <TakChevron size={9} />
            </button>
          </div>
        )}
        <Rows>{children}</Rows>
      </div>
    </details>
  );
}

/** Line under a finished program's header: ✓ done, «Пора повторить», last time, weakest. */
export function DoneLine({ doneLabel, lastResultAt, weakest }: { doneLabel: string; lastResultAt: string | null; weakest: ReactNode | null }) {
  const { tr, plural } = useT();
  const last = lastTimeText(lastResultAt, tr, plural);
  return (
    <>
      <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-emerald-600 font-semibold">✓ {doneLabel}</span>
        {isDue(lastResultAt) && <DueTag />}
        {last && <span>{last}</span>}
      </span>
      {weakest && <><br />{tr.overview.weakest}: {weakest}</>}
    </>
  );
}

/** Errors on the page (enroll/unenroll/remind failures): one 13px destructive line. */
export function OverviewNotice({ children, testId }: { children: ReactNode; testId: string }) {
  return <p className="text-[13px] text-destructive" role="alert" data-testid={testId}>{children}</p>;
}

/** The row chevron used on whole-row links. */
export function RowChevron() {
  return <TakChevron size={10} className="shrink-0" />;
}
