'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { BACKEND_URL, getToken } from '../lib/api';
import { useT } from '../lib/useT';

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

interface JwtUser {
  name: string;
  picture?: string;
}

function parseJwtUser(token: string): JwtUser | null {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch {
    return null;
  }
}

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null);
  const [user, setUser] = useState<JwtUser | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isRedactor, setIsRedactor] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { tr, lang, setLang } = useT();

  useEffect(() => {
    const token = getToken();
    setIsAuthed(!!token);
    if (token) {
      setUser(parseJwtUser(token));
      fetch(`${BACKEND_URL}/api/me/quota`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.is_admin || data?.is_superadmin) setIsAdmin(true);
          if (data?.is_redactor) setIsRedactor(true);
        })
        .catch((err) => console.error('Failed to fetch admin status:', err));
    }
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close mobile nav on route change
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  function logout() {
    localStorage.removeItem('fluent_token');
    setIsAuthed(false);
    setUser(null);
    setMenuOpen(false);
    router.push('/');
  }

  const listsActive = pathname.startsWith('/dashboard/lists') || pathname === '/dashboard';
  const phrasesActive = pathname.startsWith('/dashboard/phrases');
  const grammarActive = pathname.startsWith('/dashboard/grammar');
  const practiceActive = pathname.startsWith('/dashboard/practice');
  const articlesActive = pathname.startsWith('/dashboard/articles');

  const navLinks = (
    <>
      <Link
        href="/dashboard/lists"
        className={`px-3 py-2.5 rounded-full text-sm font-medium transition-colors ${
          listsActive ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-emerald-600'
        }`}
      >
        {tr.nav.dictionaries}
      </Link>
      <Link
        href="/dashboard/phrases"
        className={`px-3 py-2.5 rounded-full text-sm font-medium transition-colors ${
          phrasesActive ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-emerald-600'
        }`}
      >
        Фразы
      </Link>
      <Link
        href="/dashboard/grammar"
        className={`relative px-3 py-2.5 rounded-full text-sm font-medium transition-colors ${
          grammarActive ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-emerald-600'
        }`}
      >
        {tr.nav.grammar}
      </Link>
      <Link
        href="/dashboard/practice"
        className={`px-3 py-2.5 rounded-full text-sm font-medium transition-colors ${
          practiceActive ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-emerald-600'
        }`}
      >
        {tr.nav.practice}
      </Link>
      <Link
        href="/dashboard/articles"
        className={`px-3 py-2.5 rounded-full text-sm font-medium transition-colors ${
          articlesActive ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-emerald-600'
        }`}
      >
        {tr.nav.articles}
      </Link>
    </>
  );

  return (
    <header className="relative z-20 border-b border-gray-100 bg-white/90 backdrop-blur-md sticky top-0 shadow-sm">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">

        <Link href="/" className="font-bold text-[1.75rem] tracking-tight shrink-0 leading-none">
          fluent<span className="text-emerald-600">.</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden sm:flex gap-1 bg-gray-100/70 rounded-full p-1 shrink-0">
          {navLinks}
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          {/* Language toggle */}
          <button
            onClick={() => { setLang(lang === 'ru' ? 'en' : 'ru'); window.location.reload(); }}
            data-testid="lang-toggle"
            className="text-xs font-medium px-2 py-1 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors flex items-center gap-1"
          >
            <span className={lang === 'ru' ? 'text-gray-900 font-semibold' : 'text-gray-400'}>RU</span>
            <span className="text-gray-300">/</span>
            <span className={lang === 'en' ? 'text-gray-900 font-semibold' : 'text-gray-400'}>EN</span>
          </button>

          {isAuthed === null && (
            <div className="w-20 h-9 rounded-xl bg-gray-100 animate-pulse" />
          )}
          {isAuthed === false && (
            <a
              href={`${BACKEND_URL}/api/auth/google`}
              className="flex items-center gap-2 bg-gray-900 text-white font-medium px-4 py-2 rounded-xl text-sm hover:bg-gray-700 transition-colors shadow-sm"
            >
              <GoogleIcon />
              {tr.nav.signIn}
            </a>
          )}
          {isAuthed && user && (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="flex items-center gap-2.5 hover:opacity-80 transition-opacity min-h-[44px] px-1"
              >
                {user.picture ? (
                  <img
                    src={user.picture}
                    alt={user.name}
                    className="w-8 h-8 rounded-full ring-2 ring-white ring-offset-1 ring-offset-gray-100"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center text-sm font-medium">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="text-gray-500 text-sm hidden sm:block">{user.name}</span>
                <svg
                  width="12" height="12" viewBox="0 0 12 12" fill="currentColor"
                  className={`text-gray-400 transition-transform hidden sm:block ${menuOpen ? 'rotate-180' : ''}`}
                >
                  <path d="M6 8L1 3h10L6 8z" />
                </svg>
              </button>

              {menuOpen && (
                <div className="absolute right-0 mt-2 w-44 bg-white border border-gray-100 rounded-xl shadow-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100">
                    <p className="text-gray-900 text-sm font-medium truncate">{user.name}</p>
                  </div>
                  {isAdmin && (
                    <Link
                      href="/dashboard/admin"
                      onClick={() => setMenuOpen(false)}
                      className="block px-4 py-3 text-sm text-amber-600 hover:text-amber-600 hover:bg-gray-50 transition-colors"
                    >
                      {tr.nav.admin}
                    </Link>
                  )}
                  {isRedactor && (
                    <Link
                      href="/dashboard/programs/new"
                      onClick={() => setMenuOpen(false)}
                      className="block px-4 py-3 text-sm text-purple-600 hover:text-purple-700 hover:bg-gray-50 transition-colors"
                    >
                      + Создать программу
                    </Link>
                  )}
                  <Link
                    href="/dashboard/settings"
                    onClick={() => setMenuOpen(false)}
                    className="block px-4 py-3 text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-colors"
                  >
                    {tr.nav.settings}
                  </Link>
                  <button
                    onClick={logout}
                    className="w-full text-left px-4 py-3 text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-colors"
                  >
                    {tr.nav.signOut}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Mobile hamburger */}
          <button
            className="sm:hidden flex flex-col justify-center items-center w-11 h-11 gap-1.5"
            onClick={() => setMobileNavOpen((o) => !o)}
            aria-label={tr.nav.menu}
          >
            <span className={`block w-5 h-0.5 bg-gray-600 transition-all duration-200 ${mobileNavOpen ? 'rotate-45 translate-y-2' : ''}`} />
            <span className={`block w-5 h-0.5 bg-gray-600 transition-all duration-200 ${mobileNavOpen ? 'opacity-0' : ''}`} />
            <span className={`block w-5 h-0.5 bg-gray-600 transition-all duration-200 ${mobileNavOpen ? '-rotate-45 -translate-y-2' : ''}`} />
          </button>
        </div>
      </div>

      {/* Mobile nav dropdown */}
      {mobileNavOpen && (
        <div className="sm:hidden border-t border-gray-100 bg-white/95 px-4 py-3 flex flex-col gap-1">
          {navLinks}
        </div>
      )}
    </header>
  );
}
