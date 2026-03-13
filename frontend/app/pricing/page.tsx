'use client';

import Link from 'next/link';

const FREE_FEATURES = [
  '10 учебных сессий в день',
  'Все словари и темы',
  'Отслеживание прогресса',
  'Грамматические уроки',
];

const PREMIUM_FEATURES = [
  'Неограниченное количество сессий',
  'Все словари и темы',
  'Отслеживание прогресса',
  'Грамматические уроки',
  'Поддержка развития сервиса',
];

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0 mt-0.5">
      <circle cx="8" cy="8" r="8" fill="currentColor" fillOpacity="0.15" />
      <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function PricingPage() {
  return (
    <main className="bg-slate-50 text-gray-900 min-h-screen">
      <div className="pointer-events-none fixed inset-0 flex items-start justify-center overflow-hidden">
        <div className="w-full max-w-[700px] h-[500px] bg-emerald-100/40 blur-[140px] rounded-full mt-[-150px]" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-6 py-16">

        {/* Header */}
        <div className="text-center mb-4">
          <span className="inline-block text-xs font-semibold uppercase tracking-widest text-emerald-600/70 mb-4">Тарифы</span>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">Простые и честные условия</h1>
        </div>

        {/* Mission statement */}
        <div className="max-w-2xl mx-auto text-center mb-16">
          <p className="text-gray-500 text-lg leading-relaxed">
            Fluent создан не ради заработка — мы хотим помочь людям выучить литовский язык и чувствовать себя свободно.
            Деньги от Premium идут исключительно на поддержку серверов и развитие новых функций.
            Спасибо, что помогаете нам делать это лучше.
          </p>
        </div>

        {/* Cards */}
        <div className="grid sm:grid-cols-2 gap-6 max-w-2xl mx-auto">

          {/* Free */}
          <div className="bg-white border border-gray-900 rounded-2xl p-8 flex flex-col">
            <div className="mb-6">
              <p className="text-gray-400 text-sm font-medium uppercase tracking-wide mb-2">Бесплатно</p>
              <div className="flex items-end gap-1">
                <span className="text-4xl font-bold">0 €</span>
                <span className="text-gray-400 mb-1">/ месяц</span>
              </div>
            </div>
            <ul className="flex flex-col gap-3 flex-1 mb-8">
              {FREE_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-gray-500 text-sm">
                  <CheckIcon />
                  {f}
                </li>
              ))}
            </ul>
            <Link
              href="/dashboard/lists"
              className="w-full py-3 text-center text-sm font-medium border border-gray-900 hover:bg-gray-50 rounded-xl transition-colors text-gray-500 hover:text-gray-900"
            >
              Начать бесплатно
            </Link>
          </div>

          {/* Premium */}
          <div className="relative bg-emerald-600/10 border border-gray-900 rounded-2xl p-8 flex flex-col">
            <div className="absolute top-4 right-4 text-[10px] font-bold uppercase tracking-widest bg-emerald-100 text-emerald-600 border border-gray-900 rounded-full px-2.5 py-1">
              Premium
            </div>
            <div className="mb-6">
              <p className="text-emerald-600/70 text-sm font-medium uppercase tracking-wide mb-2">Premium</p>
              <div className="flex items-end gap-1">
                <span className="text-4xl font-bold">2 €</span>
                <span className="text-gray-400 mb-1">/ месяц</span>
              </div>
            </div>
            <ul className="flex flex-col gap-3 flex-1 mb-8">
              {PREMIUM_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-gray-700 text-sm">
                  <span className="text-emerald-600"><CheckIcon /></span>
                  {f}
                </li>
              ))}
            </ul>
            <a
              href="mailto:artyrbelski@gmail.com?subject=Fluent Premium&body=Привет! Хочу получить Premium-доступ."
              className="w-full py-3 text-center text-sm font-medium bg-gray-900 hover:bg-gray-800 text-white rounded-xl transition-colors"
            >
              Написать нам
            </a>
            <p className="text-gray-400 text-xs text-center mt-3">Мы активируем доступ вручную в течение 24 часов</p>
          </div>
        </div>

        {/* Why section */}
        <div className="mt-20 max-w-2xl mx-auto text-center">
          <h2 className="text-2xl font-bold mb-4">Почему платная версия?</h2>
          <p className="text-gray-400 leading-relaxed">
            Серверы, база данных, домен — всё это стоит денег. Мы не показываем рекламу и не продаём данные.
            Premium — это просто способ для тех, кто хочет поддержать проект и учиться без ограничений.
            Каждый евро идёт на улучшение Fluent.
          </p>
        </div>

        <div className="mt-10 text-center">
          <Link href="/dashboard/lists" className="text-gray-400 hover:text-gray-900 text-sm transition-colors">
            ← Вернуться к словарям
          </Link>
        </div>
      </div>
    </main>
  );
}
