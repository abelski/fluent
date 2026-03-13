'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { BACKEND_URL, getToken } from '../../lib/api';

export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    if (getToken()) {
      router.replace('/dashboard');
    }
  }, [router]);

  return (
    <main className="min-h-screen bg-slate-50 text-gray-900 flex flex-col items-center justify-center px-6">
      <div className="pointer-events-none fixed inset-0 flex items-start justify-center">
        <div className="w-[600px] h-[400px] bg-emerald-100/40 blur-[120px] rounded-full mt-[-100px]" />
      </div>

      <div className="relative z-10 max-w-sm w-full text-center">
        <div className="text-5xl mb-6">📊</div>
        <h1 className="text-2xl font-bold mb-3">Войдите, чтобы учиться</h1>
        <p className="text-gray-400 text-sm leading-relaxed mb-8">
          Это бесплатно. Нам нужен аккаунт только чтобы сохранять ваш прогресс
          и показывать статистику — какие слова вы уже знаете, а какие стоит повторить.
        </p>

        <a
          href={`${BACKEND_URL}/api/auth/google`}
          className="flex items-center justify-center gap-3 w-full py-3.5 bg-white text-gray-800 font-medium rounded-xl ring-1 ring-gray-900 shadow-sm hover:bg-gray-50 transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
            <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
          </svg>
          Войти через Google
        </a>

        <button
          onClick={() => router.back()}
          className="mt-4 w-full py-2.5 text-gray-400 hover:text-gray-900 text-sm transition-colors"
        >
          ← Назад
        </button>
      </div>
    </main>
  );
}
