'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BACKEND_URL, getToken } from '../../../lib/api';

interface UserRow {
  id: string;
  email: string;
  name: string;
  is_premium: boolean;
  premium_until: string | null;
  premium_active: boolean;
  is_admin: boolean;
  sessions_today: number;
  daily_limit: number | null;
}

export default function AdminPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [grantDate, setGrantDate] = useState('');
  const [saving, setSaving] = useState(false);

  function loadUsers() {
    const token = getToken();
    if (!token) { router.replace('/login'); return; }
    fetch(`${BACKEND_URL}/api/admin/users`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (r.status === 403 || r.status === 401) { router.replace('/dashboard/lists'); return null; }
        return r.json();
      })
      .then((data) => { if (data) setUsers(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadUsers(); }, []);

  function startGrant(userId: string) {
    setEditingId(userId);
    setGrantDate('');
  }

  function cancelEdit() {
    setEditingId(null);
    setGrantDate('');
  }

  async function applyPremium(userId: string, isPremium: boolean, until: string | null) {
    setSaving(true);
    const token = getToken();
    await fetch(`${BACKEND_URL}/api/admin/users/${userId}/premium`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        is_premium: isPremium,
        premium_until: until ? `${until}T00:00:00` : null,
      }),
    }).catch(() => {});
    setSaving(false);
    setEditingId(null);
    setGrantDate('');
    loadUsers();
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#07070f] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <main className="bg-[#07070f] text-white min-h-screen">
      <div className="pointer-events-none fixed inset-0 flex items-start justify-center overflow-hidden">
        <div className="w-full max-w-[600px] h-[400px] bg-violet-700/10 blur-[120px] rounded-full mt-[-100px]" />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-6 py-8">
        <h1 className="text-3xl font-bold mb-2">Администрирование</h1>
        <p className="text-white/40 mb-8">Управление пользователями и Premium-доступом</p>

        <div className="overflow-x-auto rounded-2xl border border-white/[0.08]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.08] text-white/40 text-left">
                <th className="px-4 py-3 font-medium">Пользователь</th>
                <th className="px-4 py-3 font-medium">Тариф</th>
                <th className="px-4 py-3 font-medium hidden sm:table-cell">Premium до</th>
                <th className="px-4 py-3 font-medium hidden sm:table-cell">Сессий сегодня</th>
                <th className="px-4 py-3 font-medium">Действие</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-white truncate max-w-[180px]">{u.name}</p>
                    <p className="text-white/30 text-xs truncate max-w-[180px]">{u.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    {u.is_admin ? (
                      <span className="text-xs font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-0.5">Админ</span>
                    ) : u.premium_active ? (
                      <span className="text-xs font-semibold text-violet-400 bg-violet-500/10 border border-violet-500/20 rounded-full px-2 py-0.5">Premium</span>
                    ) : (
                      <span className="text-xs font-semibold text-white/30 bg-white/[0.04] border border-white/10 rounded-full px-2 py-0.5">Basic</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-white/40 hidden sm:table-cell">
                    {u.premium_until
                      ? new Date(u.premium_until).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
                      : u.premium_active ? '∞' : '—'}
                  </td>
                  <td className="px-4 py-3 text-white/40 hidden sm:table-cell">
                    {u.sessions_today} / {u.daily_limit ?? '∞'}
                  </td>
                  <td className="px-4 py-3">
                    {editingId === u.id ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <input
                          type="date"
                          value={grantDate}
                          onChange={(e) => setGrantDate(e.target.value)}
                          className="bg-white/[0.06] border border-white/10 rounded-lg px-2 py-1 text-sm text-white outline-none focus:border-violet-500/50"
                        />
                        <button
                          onClick={() => applyPremium(u.id, true, grantDate || null)}
                          disabled={saving}
                          className="text-xs px-3 py-1.5 bg-violet-600 hover:bg-violet-500 rounded-lg font-medium transition-colors disabled:opacity-50"
                        >
                          {saving ? '...' : 'Сохранить'}
                        </button>
                        <button onClick={cancelEdit} className="text-xs px-2 py-1.5 text-white/40 hover:text-white transition-colors">
                          Отмена
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        {u.premium_active ? (
                          <button
                            onClick={() => applyPremium(u.id, false, null)}
                            className="text-xs px-3 py-1.5 text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-500/40 rounded-lg transition-colors"
                          >
                            Отозвать
                          </button>
                        ) : null}
                        <button
                          onClick={() => startGrant(u.id)}
                          className="text-xs px-3 py-1.5 text-violet-400 hover:text-violet-300 border border-violet-500/20 hover:border-violet-500/40 rounded-lg transition-colors"
                        >
                          {u.premium_active ? 'Продлить' : 'Выдать Premium'}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
