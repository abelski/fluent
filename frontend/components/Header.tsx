'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { BACKEND_URL, getToken } from '../lib/api';

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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const token = getToken();
    setIsAuthed(!!token);
    if (token) setUser(parseJwtUser(token));
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

  function logout() {
    localStorage.removeItem('fluent_token');
    setIsAuthed(false);
    setUser(null);
    setMenuOpen(false);
    router.push('/');
  }

  const listsActive = pathname.startsWith('/dashboard/lists') || pathname === '/dashboard';
  const grammarActive = pathname.startsWith('/dashboard/grammar');
  const practiceActive = pathname.startsWith('/dashboard/practice');

  return (
    <header className="relative z-20 border-b border-white/10 bg-[#07070f] sticky top-0">
      <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between gap-6">

        <Link href="/dashboard/lists" className="font-bold text-[1.75rem] tracking-tight shrink-0 leading-none">
          fluent<span className="text-violet-400">.</span>
        </Link>

        <nav className="flex gap-1 bg-white/[0.05] border border-white/10 rounded-xl p-1">
          <Link
            href="/dashboard/lists"
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              listsActive ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white'
            }`}
          >
            Словари
          </Link>
          <Link
            href="/dashboard/grammar"
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              grammarActive ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white'
            }`}
          >
            Грамматика
          </Link>
          <Link
            href="/dashboard/practice"
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              practiceActive ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white'
            }`}
          >
            Практика
          </Link>
        </nav>

        <div className="shrink-0">
          {isAuthed === false && (
            <a
              href={`${BACKEND_URL}/api/auth/google`}
              className="flex items-center gap-2 bg-white text-gray-800 font-medium px-4 py-1.5 rounded-xl text-sm hover:bg-gray-100 transition-colors"
            >
              <GoogleIcon />
              Войти
            </a>
          )}
          {isAuthed && user && (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
              >
                {user.picture ? (
                  <img
                    src={user.picture}
                    alt={user.name}
                    className="w-8 h-8 rounded-full ring-1 ring-white/20"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center text-sm font-medium">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="text-white/60 text-sm hidden sm:block">{user.name}</span>
                <svg
                  width="12" height="12" viewBox="0 0 12 12" fill="currentColor"
                  className={`text-white/30 transition-transform hidden sm:block ${menuOpen ? 'rotate-180' : ''}`}
                >
                  <path d="M6 8L1 3h10L6 8z" />
                </svg>
              </button>

              {menuOpen && (
                <div className="absolute right-0 mt-2 w-44 bg-[#111118] border border-white/10 rounded-xl shadow-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-white/[0.06]">
                    <p className="text-white text-sm font-medium truncate">{user.name}</p>
                  </div>
                  <button
                    onClick={logout}
                    className="w-full text-left px-4 py-3 text-sm text-white/50 hover:text-white hover:bg-white/[0.05] transition-colors"
                  >
                    Выйти
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
