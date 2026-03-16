'use client';

import { useT } from '../../../lib/useT';

export default function PracticePage() {
  const { tr } = useT();
  return (
    <main className="max-w-4xl mx-auto px-6 py-20 flex flex-col items-center justify-center text-center gap-4">
      <h1 className="text-3xl font-bold text-gray-900">{tr.practice.title}</h1>
      <p className="text-gray-400 text-lg">{tr.practice.comingSoon}</p>
    </main>
  );
}
