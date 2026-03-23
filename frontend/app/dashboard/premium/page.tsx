'use client';

import Link from 'next/link';

export default function PremiumPage() {
  return (
    <main className="bg-slate-50 text-gray-900 min-h-screen">
      <div className="max-w-2xl mx-auto px-6 py-16 flex flex-col items-center text-center gap-8">

        <div className="w-16 h-16 rounded-2xl bg-amber-100 border border-amber-300 flex items-center justify-center text-3xl">
          ★
        </div>

        <div className="flex flex-col gap-3">
          <h1 className="text-3xl font-bold text-gray-900">Fluent Premium</h1>
          <p className="text-gray-500 text-lg leading-relaxed">
            Этот тест доступен только для Premium-пользователей.<br />
            Получите доступ ко всем тестам, упражнениям и материалам.
          </p>
        </div>

        <div className="border border-gray-900 rounded-2xl bg-white w-full divide-y divide-gray-100 text-left">
          {[
            'Все практические тесты без ограничений',
            'Неограниченное количество учебных сессий в день',
            'Доступ к новым материалам в приоритетном порядке',
          ].map((benefit) => (
            <div key={benefit} className="px-6 py-4 flex items-center gap-3">
              <span className="text-emerald-500 font-bold text-sm shrink-0">✓</span>
              <span className="text-sm text-gray-700">{benefit}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <Link
            href="/dashboard/practice"
            className="px-6 py-2.5 border border-gray-900 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50 transition-colors text-center"
          >
            ← Назад к практике
          </Link>
          <a
            href="mailto:support@fluent.lt?subject=Premium"
            className="px-6 py-2.5 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-700 transition-colors text-center"
          >
            Связаться для подключения
          </a>
        </div>

        <p className="text-xs text-gray-400">
          Для активации Premium обратитесь к администратору или напишите нам.
        </p>
      </div>
    </main>
  );
}
