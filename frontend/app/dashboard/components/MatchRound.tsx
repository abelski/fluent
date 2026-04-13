'use client';

import { useState, useMemo, useRef, useLayoutEffect } from 'react';
import Link from 'next/link';
import { useT } from '../../../lib/useT';
import type { Word } from './QuizSession';
import type { Lang } from '../../../lib/useLang';

interface MatchRoundProps {
  words: Word[];
  lang: Lang;
  onDone: () => void;
  backHref: string;
}

interface Line {
  x1: number; y1: number;
  x2: number; y2: number;
  color: 'green' | 'red';
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function translation(word: Word, lang: Lang): string {
  return lang === 'en' ? word.translation_en : word.translation_ru;
}

export default function MatchRound({ words, lang, onDone, backHref }: MatchRoundProps) {
  const { tr } = useT();

  const leftItems  = useMemo(() => shuffle(words), [words]);
  const rightItems = useMemo(() => shuffle(words), [words]);

  const [selectedLeft, setSelectedLeft] = useState<number | null>(null);
  const [paired, setPaired]             = useState<Set<number>>(() => new Set());
  const [wrongFlash, setWrongFlash]     = useState<{ leftIdx: number; rightIdx: number } | null>(null);
  const [lines, setLines]               = useState<Line[]>([]);

  const leftRefs      = useRef<Array<HTMLButtonElement | null>>([]);
  const rightRefs     = useRef<Array<HTMLButtonElement | null>>([]);
  const containerRef  = useRef<HTMLDivElement>(null);

  const allDone = paired.size === words.length;

  // ── Recompute SVG lines after every relevant state change ─────────────────
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const box = container.getBoundingClientRect();
    const next: Line[] = [];

    // Draw a line for each correctly paired word
    for (const wordId of paired) {
      const li = leftItems.findIndex((w) => w.id === wordId);
      const ri = rightItems.findIndex((w) => w.id === wordId);
      const lEl = leftRefs.current[li];
      const rEl = rightRefs.current[ri];
      if (!lEl || !rEl) continue;
      const lr = lEl.getBoundingClientRect();
      const rr = rEl.getBoundingClientRect();
      next.push({
        x1: lr.right  - box.left,
        y1: lr.top    - box.top + lr.height / 2,
        x2: rr.left   - box.left,
        y2: rr.top    - box.top + rr.height / 2,
        color: 'green',
      });
    }

    // Draw a transient red line for the wrong pair
    if (wrongFlash) {
      const lEl = leftRefs.current[wrongFlash.leftIdx];
      const rEl = rightRefs.current[wrongFlash.rightIdx];
      if (lEl && rEl) {
        const lr = lEl.getBoundingClientRect();
        const rr = rEl.getBoundingClientRect();
        next.push({
          x1: lr.right  - box.left,
          y1: lr.top    - box.top + lr.height / 2,
          x2: rr.left   - box.left,
          y2: rr.top    - box.top + rr.height / 2,
          color: 'red',
        });
      }
    }

    setLines(next);
  }, [paired, wrongFlash, leftItems, rightItems]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  function handleLeftClick(i: number) {
    if (paired.has(leftItems[i].id)) return;
    setSelectedLeft((prev) => (prev === i ? null : i));
  }

  function handleRightClick(j: number) {
    if (paired.has(rightItems[j].id)) return;
    if (selectedLeft === null) return;
    const leftWord  = leftItems[selectedLeft];
    const rightWord = rightItems[j];
    if (leftWord.id === rightWord.id) {
      setPaired((prev) => new Set([...prev, leftWord.id]));
      setSelectedLeft(null);
    } else {
      setWrongFlash({ leftIdx: selectedLeft, rightIdx: j });
      setSelectedLeft(null);
      setTimeout(() => setWrongFlash(null), 600);
    }
  }

  // ── Box styles ────────────────────────────────────────────────────────────
  function leftBoxClass(i: number): string {
    const word = leftItems[i];
    const base = 'w-full py-4 px-5 rounded-xl font-medium text-center transition-all duration-200 border cursor-pointer select-none ';
    if (paired.has(word.id))       return base + 'bg-emerald-50 border-emerald-400 text-emerald-600 cursor-default';
    if (wrongFlash?.leftIdx === i) return base + 'bg-red-50 border-red-400 text-red-600';
    if (selectedLeft === i)        return base + 'bg-emerald-50 border-emerald-500 text-emerald-700 ring-2 ring-emerald-300';
    return base + 'bg-white border-gray-900 hover:bg-gray-50 text-gray-900';
  }

  function rightBoxClass(j: number): string {
    const word = rightItems[j];
    const base = 'w-full py-4 px-5 rounded-xl font-medium text-center transition-all duration-200 border cursor-pointer select-none ';
    if (paired.has(word.id))        return base + 'bg-emerald-50 border-emerald-400 text-emerald-600 cursor-default';
    if (wrongFlash?.rightIdx === j) return base + 'bg-red-50 border-red-400 text-red-600';
    if (selectedLeft !== null && !paired.has(word.id))
                                    return base + 'bg-white border-gray-900 hover:bg-emerald-50 text-gray-900';
    return base + 'bg-white border-gray-900 text-gray-900';
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-slate-50 text-gray-900 flex flex-col px-6 py-4 sm:py-8">
      <div className="pointer-events-none fixed inset-0 flex items-start justify-center overflow-hidden">
        <div className="w-full max-w-[600px] h-[400px] bg-emerald-100/40 blur-[120px] rounded-full mt-[-100px]" />
      </div>

      <div className="relative z-10 max-w-2xl w-full mx-auto flex flex-col flex-1">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <Link href={backHref} className="text-gray-400 hover:text-gray-900 text-sm transition-colors">
            {tr.study.backToLists}
          </Link>
          <span className="text-gray-300 text-xs uppercase tracking-wider">
            {paired.size} / {words.length}
          </span>
        </div>

        {/* Title */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-xl sm:text-2xl font-bold mb-1">{tr.study.matchTitle}</h1>
          <p className="text-gray-400 text-sm">{tr.study.matchSubtitle}</p>
        </div>

        {/* Two-column matching grid with SVG overlay */}
        <div ref={containerRef} className="relative grid grid-cols-2 gap-3 mb-8">
          {/* Left column — translation (EN/RU) */}
          <div className="flex flex-col gap-3">
            {leftItems.map((word, i) => (
              <button
                key={word.id}
                ref={(el) => { leftRefs.current[i] = el; }}
                data-testid={`match-left-${i}`}
                onClick={() => handleLeftClick(i)}
                className={leftBoxClass(i)}
                disabled={paired.has(word.id)}
              >
                {translation(word, lang)}
              </button>
            ))}
          </div>

          {/* Right column — Lithuanian */}
          <div className="flex flex-col gap-3">
            {rightItems.map((word, j) => (
              <button
                key={word.id}
                ref={(el) => { rightRefs.current[j] = el; }}
                data-testid={`match-right-${j}`}
                onClick={() => handleRightClick(j)}
                className={rightBoxClass(j)}
                disabled={paired.has(word.id)}
              >
                {word.lithuanian}
              </button>
            ))}
          </div>

          {/* SVG lines + arrowheads */}
          {lines.length > 0 && (
            <svg
              className="absolute inset-0 pointer-events-none overflow-visible"
              style={{ width: '100%', height: '100%' }}
            >
              <defs>
                <marker id="arrow-green" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                  <polygon points="0 0, 8 3, 0 6" fill="#10b981" />
                </marker>
                <marker id="arrow-red" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                  <polygon points="0 0, 8 3, 0 6" fill="#ef4444" />
                </marker>
              </defs>
              {lines.map((ln, idx) => (
                <line
                  key={idx}
                  x1={ln.x1} y1={ln.y1}
                  x2={ln.x2} y2={ln.y2}
                  stroke={ln.color === 'green' ? '#10b981' : '#ef4444'}
                  strokeWidth="2"
                  markerEnd={ln.color === 'green' ? 'url(#arrow-green)' : 'url(#arrow-red)'}
                />
              ))}
            </svg>
          )}
        </div>

        {/* Continue button — only shown when all matched */}
        {allDone && (
          <button
            data-testid="match-continue"
            onClick={onDone}
            className="w-full py-3 bg-gray-900 hover:bg-gray-800 rounded-xl font-medium text-white transition-colors"
          >
            {tr.study.matchCheckBtn}
          </button>
        )}
      </div>
    </main>
  );
}
