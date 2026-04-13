'use client';

import { useState, useMemo } from 'react';
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

  // Shuffle both columns independently once on mount
  const leftItems = useMemo(() => shuffle(words), [words]);
  const rightItems = useMemo(() => shuffle(words), [words]);

  const [selectedLeft, setSelectedLeft] = useState<number | null>(null);
  const [paired, setPaired] = useState<Set<number>>(() => new Set());
  const [wrongFlash, setWrongFlash] = useState<{ leftIdx: number; rightIdx: number } | null>(null);

  const allDone = paired.size === words.length;

  function handleLeftClick(i: number) {
    if (paired.has(leftItems[i].id)) return;
    setSelectedLeft((prev) => (prev === i ? null : i));
  }

  function handleRightClick(j: number) {
    if (paired.has(rightItems[j].id)) return;
    if (selectedLeft === null) return;

    const leftWord = leftItems[selectedLeft];
    const rightWord = rightItems[j];

    if (leftWord.id === rightWord.id) {
      // Correct match
      setPaired((prev) => new Set([...prev, leftWord.id]));
      setSelectedLeft(null);
    } else {
      // Wrong match — flash red then clear
      setWrongFlash({ leftIdx: selectedLeft, rightIdx: j });
      setSelectedLeft(null);
      setTimeout(() => setWrongFlash(null), 600);
    }
  }

  function leftBoxClass(i: number): string {
    const word = leftItems[i];
    const base = 'w-full py-4 px-5 rounded-xl font-medium text-center transition-all duration-200 border cursor-pointer select-none ';
    if (paired.has(word.id)) return base + 'bg-emerald-50 border-emerald-400 text-emerald-600 cursor-default';
    if (wrongFlash?.leftIdx === i) return base + 'bg-red-50 border-red-400 text-red-600';
    if (selectedLeft === i) return base + 'bg-emerald-50 border-emerald-500 text-emerald-700 ring-2 ring-emerald-300';
    return base + 'bg-white border-gray-900 hover:bg-gray-50 text-gray-900';
  }

  function rightBoxClass(j: number): string {
    const word = rightItems[j];
    const base = 'w-full py-4 px-5 rounded-xl font-medium text-center transition-all duration-200 border cursor-pointer select-none ';
    if (paired.has(word.id)) return base + 'bg-emerald-50 border-emerald-400 text-emerald-600 cursor-default';
    if (wrongFlash?.rightIdx === j) return base + 'bg-red-50 border-red-400 text-red-600';
    if (selectedLeft !== null && !paired.has(rightItems[j].id)) return base + 'bg-white border-gray-900 hover:bg-emerald-50 text-gray-900';
    return base + 'bg-white border-gray-900 text-gray-900';
  }

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

        {/* Two-column matching grid */}
        <div className="grid grid-cols-2 gap-3 mb-8">
          {/* Left column — translation (EN/RU) */}
          <div className="flex flex-col gap-3">
            {leftItems.map((word, i) => (
              <button
                key={word.id}
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
                data-testid={`match-right-${j}`}
                onClick={() => handleRightClick(j)}
                className={rightBoxClass(j)}
                disabled={paired.has(word.id)}
              >
                {word.lithuanian}
              </button>
            ))}
          </div>
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
