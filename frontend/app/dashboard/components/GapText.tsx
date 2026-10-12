'use client';

// #62d — gap text with a shared word bank. Tap a chip to fill the active gap, tap a filled
// gap to take its word back. Markup copied from the approved prototype
// (temp_files/prototypes/plan_62d_practice-gap-text.html).

import React, { useState } from 'react';
import { useT } from '../../../lib/useT';

export interface GapQuestion {
  id: number;
  question_lt: string | null; // its marker, "{n}"
  option_a: string; // the gap's correct word
  option_b: string; // its distractor
}

interface Props {
  title: string;
  text: string; // with markers {1} … {N}
  questions: GapQuestion[]; // matched to markers by question_lt, not by position
  passThreshold: number;
  onChecked: (score: number, total: number) => void;
  onRetry: () => void;
}

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function GapText({ title, text, questions, passThreshold, onChecked, onRetry }: Props) {
  const { tr } = useT();
  const t = tr.practice;
  // Gaps are matched by marker, like the backend: a deleted/reordered question never shifts the rest.
  const byMarker = new Map(questions.map((q) => [q.question_lt ?? '', q]));
  const parts = text.split(/\{(\d+)\}/);
  const gaps = Array.from(new Set(parts.filter((p, k) => k % 2 === 1 && byMarker.has(`{${p}}`))));
  const gapQs = gaps.map((p) => byMarker.get(`{${p}}`) as GapQuestion);
  const n = gaps.length;
  // Chips are tracked by index so two identical words stay two chips.
  const [bank] = useState(() => shuffle(gapQs.flatMap((q) => [q.option_a, q.option_b])));
  const [fills, setFills] = useState<(number | null)[]>(() => new Array(n).fill(null));
  const [active, setActive] = useState(0);
  const [checked, setChecked] = useState(false);

  const used = new Set(fills.filter((x): x is number => x !== null));
  const nFilled = used.size;
  const word = (gap: number) => (fills[gap] === null ? null : bank[fills[gap] as number]);
  const score = gapQs.filter((q, i) => word(i) === q.option_a).length;
  const filledLine = t.gapFilled.replace('{filled}', String(nFilled)).replace('{total}', String(n));

  function pick(chip: number) {
    if (checked || used.has(chip) || active < 0) return;
    const next = [...fills];
    next[active] = chip;
    setFills(next);
    const after = [...next.keys()].slice(active + 1).concat([...next.keys()].slice(0, active + 1));
    setActive(after.find((i) => next[i] === null) ?? -1);
  }

  function tapGap(gap: number) {
    if (checked) return;
    if (fills[gap] !== null) {
      const next = [...fills];
      next[gap] = null;
      setFills(next);
    }
    setActive(gap);
  }

  function check() {
    if (nFilled < n || checked) return;
    setChecked(true);
    onChecked(score, n);
  }

  const passed = score / n >= passThreshold;

  return (
    <div className="flex flex-col gap-4 mt-6" data-testid="gap-text">
      <div className="border border-gray-900 rounded-2xl overflow-hidden bg-white">
        <div className="px-6 py-3 border-b border-gray-100 flex items-center justify-between gap-4">
          <span className="text-sm font-medium text-gray-700">{title}</span>
          <span className="text-sm text-gray-400 shrink-0">{filledLine}</span>
        </div>
        <div className="h-1 bg-gray-100">
          <div className="h-full bg-gray-900 transition-all duration-300" style={{ width: `${(nFilled / n) * 100}%` }} />
        </div>
        <div className="px-6 py-5 text-[15px] leading-[2.1] text-gray-800 whitespace-pre-line" lang="lt" data-testid="gap-text-body">
          {parts.map((p, k) => {
            if (k % 2 === 0) return <React.Fragment key={k}>{p}</React.Fragment>;
            const i = gaps.indexOf(p);
            const q = gapQs[i];
            if (!q) return <React.Fragment key={k}>{`{${p}}`}</React.Fragment>;
            const w = word(i);
            if (checked) {
              return w === q.option_a ? (
                <span key={k} data-testid={`gap-${p}`} data-result="correct" className="inline-block px-1.5 py-0.5 ml-0.5 rounded-md bg-emerald-50 border border-emerald-400 text-emerald-800 font-medium">{w}</span>
              ) : (
                <span key={k} data-testid={`gap-${p}`} data-result="wrong">
                  <span className="inline-block px-1.5 py-0.5 ml-0.5 rounded-md bg-red-50 border border-red-300 text-red-700 line-through">{w}</span>
                  <span className="inline-block px-1.5 py-0.5 rounded-md bg-emerald-50 border border-emerald-400 text-emerald-800 font-medium">{q.option_a}</span>
                </span>
              );
            }
            const isActive = i === active;
            const label = w
              ? t.gapFilledAria.replace('{n}', p).replace('{word}', w)
              : t.gapEmptyAria.replace('{n}', p);
            return w ? (
              <button key={k} type="button" data-testid={`gap-${p}`} aria-label={label} aria-pressed={isActive} onClick={() => tapGap(i)}
                className={`inline-block px-1.5 py-0.5 ml-0.5 rounded-md border ${isActive ? 'border-ink ring-2 ring-ink/20' : 'border-line'} bg-line-soft text-ink font-medium`}>
                {w}
              </button>
            ) : (
              <button key={k} type="button" data-testid={`gap-${p}`} aria-label={label} aria-pressed={isActive} onClick={() => tapGap(i)}
                className={`inline-flex items-center justify-center min-w-[3.25rem] px-1.5 py-0.5 ml-0.5 rounded-md border-2 border-dashed ${isActive ? 'border-emerald-600 bg-emerald-50 text-emerald-700' : 'border-line text-muted'} text-xs font-semibold`}>
                {p}
              </button>
            );
          })}
        </div>
      </div>

      {checked ? (
        <div data-testid="gap-result" className="bg-white border border-gray-900 rounded-2xl px-6 py-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <p className="font-bold text-gray-900">
              {t.gapScore.replace('{score}', String(score)).replace('{total}', String(n))} — {Math.round((score / n) * 100)}%
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`px-3 py-1 rounded-full text-sm font-semibold border border-gray-900 ${passed ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
              {(passed ? t.passedLabel : t.notPassedLabel).replace('{pct}', String(Math.round(passThreshold * 100)))}
            </span>
            <button onClick={onRetry} className="px-4 py-1.5 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-700 transition-colors">
              {t.constitution.retryBtn}
            </button>
          </div>
        </div>
      ) : (
        <div data-testid="gap-bank" className="sticky bottom-0 -mx-4 sm:mx-0 px-4 sm:px-0 pt-3 pb-4 bg-[#f8fafc]/95 backdrop-blur border-t border-line sm:border-0">
          <div className="bg-white border border-line rounded-[14px] p-3 sm:p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold tracking-[0.06em] uppercase text-muted">{t.gapBankLabel}</span>
              <span className="text-xs text-muted">{filledLine}</span>
            </div>
            <div className="flex flex-wrap gap-2 max-h-[30vh] overflow-y-auto" lang="lt">
              {bank.map((w, c) => {
                const gone = used.has(c);
                return (
                  <button key={c} type="button" data-testid="gap-chip" disabled={gone} onClick={() => pick(c)}
                    className={`px-3 py-1.5 rounded-full border text-sm ${gone ? 'border-line-soft text-faint bg-line-soft line-through' : 'border-line bg-white text-ink hover:border-ink'}`}>
                    {w}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex justify-end mt-3">
            <button type="button" data-testid="gap-check" onClick={check} disabled={nFilled < n}
              className="px-6 py-2.5 bg-gray-900 text-white font-semibold rounded-xl hover:bg-gray-700 transition-colors disabled:opacity-40">
              {t.gapCheckBtn}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
