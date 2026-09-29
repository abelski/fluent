'use client';

// Shared presentational pieces of the hero → chips → bento → cards layout (#53 grammar,
// #55 practice + articles). Extracted from GrammarOverview.tsx without changing its
// markup. Each page keeps its own data, states and copy. See documentation/grammar-bento.md
// and documentation/practice-articles-bento.md.

import type { ReactNode } from 'react';
import Link from 'next/link';
import PageMascot from '../../../components/PageMascot';
import TakChevron from '../../../components/TakChevron';

export const INK_BTN = 'inline-flex items-center gap-1.5 bg-ink hover:bg-black text-white text-sm font-semibold rounded-[10px] px-[18px] py-[11px] transition-colors';
export const SOFT_BTN = 'inline-flex items-center bg-emerald-50 text-emerald-600 hover:bg-emerald-100 font-semibold rounded-[10px] transition-colors';
export const CARD = 'bg-white border border-line rounded-[14px]';
export const KICKER = 'text-xs font-semibold tracking-[0.06em] uppercase text-muted';
export const FEATURED_SHELL = `${CARD} p-5 min-[860px]:px-8 min-[860px]:py-7 flex flex-col gap-3.5 min-[860px]:min-h-[340px]`;
export const FEATURED_HEADING = 'text-[28px] min-[420px]:text-[32px] font-bold tracking-[-0.02em] leading-tight text-ink [overflow-wrap:anywhere]';
/** The hero's right-side sample card (declension / exam question / themes); hidden below 860px. */
export const HERO_ART = 'hidden min-[860px]:block border border-line rounded-xl px-4 py-3 text-sm min-w-[190px]';
export const HERO_ART_LABEL = 'text-[11px] font-semibold tracking-[0.06em] uppercase text-muted mb-1.5';
export const BENTO_GRID = 'grid gap-4 grid-cols-1 min-[860px]:grid-cols-[1.75fr_1fr]';
export const CARD_GRID = 'grid gap-3 grid-cols-1 min-[860px]:grid-cols-2 min-[1200px]:grid-cols-3';

export function ProgressBar({ pct, className = '' }: { pct: number; className?: string }) {
  return (
    <div className={`h-1.5 bg-gray-100 rounded-full overflow-hidden ${className}`}>
      <div className="h-full bg-emerald-600 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function LockIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" className="shrink-0" aria-hidden="true">
      <path d="M18 8h-1V6A5 5 0 007 6v2H6a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V10a2 2 0 00-2-2zm-6 9a2 2 0 110-4 2 2 0 010 4zm3.1-9H8.9V6a3.1 3.1 0 016.2 0v2z" />
    </svg>
  );
}

// ── Hero ────────────────────────────────────────────────────────────────────

export function BentoHero({
  testId,
  title,
  subtitle,
  note,
  count,
  countTestId,
  badge,
  label,
  pct,
  actions,
  hint,
  art,
  mascotPhrase,
}: {
  testId: string;
  title: string;
  subtitle: string;
  note?: string;
  count: number;
  countTestId: string;
  badge: string | null; // «из M» pill; null hides it
  label: string;
  pct: number | null; // null = no progress bar (articles)
  actions: ReactNode | null; // the button row; null hides the row
  hint?: string;
  art: ReactNode; // right-side sample (use HERO_ART), next to the mascot
  mascotPhrase: string;
}) {
  return (
    <section
      data-testid={testId}
      className={`${CARD} px-5 py-[22px] min-[860px]:px-9 min-[860px]:py-8 flex flex-col min-[860px]:flex-row min-[860px]:items-center gap-5 min-[860px]:gap-8`}
    >
      <div className="flex-1 min-w-0">
        <h1 className="text-[28px] min-[420px]:text-[32px] font-bold tracking-[-0.02em] text-ink mb-1.5">{title}</h1>
        <p className="text-[15px] text-muted max-w-[52ch]">{subtitle}</p>
        {note && <p className="text-[13px] text-muted mt-1">{note}</p>}

        <div className="mt-5 flex items-baseline flex-wrap gap-2.5">
          <p className="text-[30px] font-bold text-ink leading-none tabular-nums" data-testid={countTestId}>{count}</p>
          {badge && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 whitespace-nowrap">
              {badge}
            </span>
          )}
          <p className="text-[13px] text-muted">{label}</p>
        </div>
        {pct !== null && <ProgressBar pct={pct} className="mt-3 max-w-[440px]" />}

        {actions && <div className="mt-5 flex flex-wrap gap-2.5">{actions}</div>}
        {hint && <p className="text-xs text-faint mt-1.5">{hint}</p>}
      </div>

      <div className="order-first min-[860px]:order-none flex items-end gap-5 shrink-0">
        {art}
        <PageMascot phrase={mascotPhrase} className="shrink-0" />
      </div>
    </section>
  );
}

// ── Chips ───────────────────────────────────────────────────────────────────

export interface ChipItem {
  key: string | number;
  label: string;
  count: number;
  active: boolean;
  dot?: boolean; // enrolled marker
  testId: string;
  onClick?: () => void;
}

export function BentoChips({
  items,
  more,
}: {
  items: ChipItem[]; // «Все» first
  more?: { href: string; label: string; testId: string };
}) {
  const chip = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 min-h-11 min-[860px]:min-h-0 text-sm font-semibold transition-colors ${
      active ? 'bg-ink border-ink text-white' : 'bg-white border-line text-ink hover:border-faint'
    }`;
  const count = (active: boolean) => `text-xs font-medium tabular-nums ${active ? 'text-white/70' : 'text-muted'}`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.map((c) => (
        <button key={c.key} type="button" aria-pressed={c.active} onClick={c.onClick} className={chip(c.active)} data-testid={c.testId}>
          {c.dot && <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" data-testid="enrolled-dot" />}
          {c.label}
          <span className={count(c.active)}>{c.count}</span>
        </button>
      ))}
      {more && (
        <Link
          href={more.href}
          data-testid={more.testId}
          className="w-full min-[860px]:w-auto min-[860px]:ml-auto text-sm font-medium text-emerald-600 hover:text-emerald-700 transition-colors"
        >
          {more.label} <TakChevron size={10} className="inline-block align-[-1px]" />
        </Link>
      )}
    </div>
  );
}

/** Enroll/unenroll failure — one line under the chips. */
export function ErrorLine({ children, testId }: { children: ReactNode; testId: string }) {
  return (
    <p className="mt-2 text-[13px] text-destructive" role="alert" data-testid={testId}>
      {children}
    </p>
  );
}

// ── Stack ───────────────────────────────────────────────────────────────────

/** Enrolled program/category: the whole card is a button that selects it. */
export function StackProgressCard({
  title,
  done,
  total,
  openLabel,
  onOpen,
  testId,
}: {
  title: string;
  done: number;
  total: number;
  openLabel: string;
  onOpen: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid={testId}
      className={`${CARD} px-[22px] py-5 flex flex-col gap-2.5 text-left w-full hover:border-faint transition-colors`}
    >
      <div className="flex justify-between items-baseline gap-3 w-full">
        <h3 className="text-[17px] font-bold text-ink">{title}</h3>
        <span className="text-[13px] text-muted tabular-nums whitespace-nowrap">{done}/{total}</span>
      </div>
      <ProgressBar pct={total ? Math.round((done / total) * 100) : 0} className="w-full" />
      <span className="text-[13px] font-semibold text-emerald-600">
        {openLabel} <TakChevron size={9} className="inline-block align-[-1px]" />
      </span>
    </button>
  );
}

/** Not-enrolled program/category: count, description and a soft «Добавить». */
export function StackAddCard({
  title,
  countLabel,
  description,
  addLabel,
  onAdd,
  testId,
  addTestId,
}: {
  title: string;
  countLabel: string;
  description: string;
  addLabel: string;
  onAdd: () => void;
  testId: string;
  addTestId: string;
}) {
  return (
    <div className={`${CARD} px-[22px] py-5 flex flex-col gap-2.5`} data-testid={testId}>
      <div className="flex justify-between items-baseline gap-3">
        <h3 className="text-[17px] font-bold text-ink">{title}</h3>
        <span className="text-[13px] text-muted whitespace-nowrap">{countLabel}</span>
      </div>
      {description && <p className="text-[13px] text-muted">{description}</p>}
      <button
        type="button"
        onClick={onAdd}
        className={`${SOFT_BTN} self-start text-[13px] px-3.5 py-[7px] min-h-11 min-[860px]:min-h-0`}
        data-testid={addTestId}
      >
        {addLabel}
      </button>
    </div>
  );
}

// ── Cards section ───────────────────────────────────────────────────────────

/** «Темы: X» heading row + count + optional «Убрать». */
export function SectionHeading({
  title,
  countLabel,
  removeLabel,
  onRemove,
  id,
}: {
  title: string;
  countLabel: string;
  removeLabel?: string;
  onRemove?: () => void;
  id?: string;
}) {
  return (
    <div className="flex items-baseline gap-2.5 flex-wrap">
      <h2 className="text-xl font-bold text-ink" id={id}>{title}</h2>
      <span className="text-[13px] text-muted">{countLabel}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-auto text-[13px] text-destructive hover:opacity-70 transition-opacity min-h-11 min-[860px]:min-h-0"
          data-testid="unenroll-button"
        >
          {removeLabel}
        </button>
      )}
    </div>
  );
}

// ── Confirm dialog ──────────────────────────────────────────────────────────

/** Remove-program confirm — same markup as lists/page.tsx. */
export function ConfirmDialog({
  title,
  body,
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  cancelLabel: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        data-testid="unenroll-confirm"
        className="bg-white rounded-2xl shadow-xl p-6 mx-4 w-full max-w-sm flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-[14.5px] font-semibold text-ink">{title}</h2>
        <p className="text-sm text-muted">{body}</p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-muted hover:text-ink border border-line rounded-full transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            data-testid="unenroll-confirm-button"
            className="px-4 py-2 text-sm font-semibold text-white bg-destructive hover:opacity-90 rounded-full transition-opacity"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
