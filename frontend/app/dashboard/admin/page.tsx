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
  is_superadmin: boolean;
  sessions_today: number;
  daily_limit: number | null;
}

interface ReportRow {
  id: number;
  user_name: string;
  user_email: string;
  context: string | null;
  description: string;
  status: 'open' | 'resolved';
  created_at: string;
}

type Tab = 'users' | 'reports';

export default function AdminPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('users');
  const [users, setUsers] = useState<UserRow[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [grantDate, setGrantDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [isSuperadmin, setIsSuperadmin] = useState(false);

  function loadData() {
    const token = getToken();
    if (!token) { router.replace('/login'); return; }
    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch(`${BACKEND_URL}/api/admin/users`, { headers }),
      fetch(`${BACKEND_URL}/api/me/quota`, { headers }),
      fetch(`${BACKEND_URL}/api/admin/reports`, { headers }),
    ])
      .then(async ([usersRes, quotaRes, reportsRes]) => {
        if (usersRes.status === 403 || usersRes.status === 401) { router.replace('/dashboard/lists'); return; }
        const [usersData, quotaData] = await Promise.all([usersRes.json(), quotaRes.json()]);
        setUsers(usersData);
        setIsSuperadmin(!!quotaData.is_superadmin);
        if (reportsRes.ok) setReports(await reportsRes.json());
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadData(); }, []);

  function startGrant(userId: string) {
    setEditingId(userId);
    setGrantDate('');
  }

  function cancelEdit() {
    setEditingId(null);
    setGrantDate('');
  }

  async function applyAdmin(userId: string, isAdmin: boolean) {
    setSaving(true);
    const token = getToken();
    await fetch(`${BACKEND_URL}/api/admin/users/${userId}/set-admin`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ is_admin: isAdmin }),
    }).catch(() => {});
    setSaving(false);
    loadData();
  }

  async function applyPremium(userId: string, isPremium: boolean, until: string | null) {
    setSaving(true);
    const token = getToken();
    await fetch(`${BACKEND_URL}/api/admin/users/${userId}/premium`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ is_premium: isPremium, premium_until: until ? `${until}T00:00:00` : null }),
    }).catch(() => {});
    setSaving(false);
    setEditingId(null);
    setGrantDate('');
    loadData();
  }

  async function resolveReport(id: number) {
    const token = getToken();
    await fetch(`${BACKEND_URL}/api/admin/reports/${id}/resolve`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
    loadData();
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#060d07] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const openReports = reports.filter((r) => r.status === 'open').length;

  return (
    <main className="bg-[#060d07] text-white min-h-screen">
      <div className="pointer-events-none fixed inset-0 flex items-start justify-center overflow-hidden">
        <div className="w-full max-w-[600px] h-[400px] bg-emerald-700/10 blur-[120px] rounded-full mt-[-100px]" />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-6 py-8">
        <h1 className="text-3xl font-bold mb-2">Администрирование</h1>
        <p className="text-white/40 mb-6">Управление пользователями и Premium-доступом</p>

        {/* Tabs */}
        <div className="flex gap-1 bg-white/[0.05] border border-white/10 rounded-xl p-1 w-fit mb-8">
          <button
            onClick={() => setTab('users')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'users' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white'}`}
          >
            Пользователи
          </button>
          <button
            onClick={() => setTab('reports')}
            className={`relative px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'reports' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white'}`}
          >
            Жалобы
            {openReports > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold bg-red-500 rounded-full">{openReports}</span>
            )}
          </button>
        </div>

        {/* ── Users tab ── */}
        {tab === 'users' && (
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
                      {u.is_superadmin ? (
                        <span className="text-xs font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-full px-2 py-0.5">Суперадмин</span>
                      ) : u.is_admin ? (
                        <span className="text-xs font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-0.5">Админ</span>
                      ) : u.premium_active ? (
                        <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5">Premium</span>
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
                            className="bg-white/[0.06] border border-white/10 rounded-lg px-2 py-1 text-sm text-white outline-none focus:border-emerald-500/50"
                          />
                          <button
                            onClick={() => applyPremium(u.id, true, grantDate || null)}
                            disabled={saving}
                            className="text-xs px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-lg font-medium transition-colors disabled:opacity-50"
                          >
                            {saving ? '...' : 'Сохранить'}
                          </button>
                          <button onClick={cancelEdit} className="text-xs px-2 py-1.5 text-white/40 hover:text-white transition-colors">
                            Отмена
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 flex-wrap">
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
                            className="text-xs px-3 py-1.5 text-emerald-400 hover:text-emerald-300 border border-emerald-500/20 hover:border-emerald-500/40 rounded-lg transition-colors"
                          >
                            {u.premium_active ? 'Продлить' : 'Выдать Premium'}
                          </button>
                          {isSuperadmin && !u.is_superadmin && (
                            <button
                              onClick={() => applyAdmin(u.id, !u.is_admin)}
                              disabled={saving}
                              className={`text-xs px-3 py-1.5 border rounded-lg transition-colors disabled:opacity-50 ${
                                u.is_admin
                                  ? 'text-amber-400 hover:text-amber-300 border-amber-500/20 hover:border-amber-500/40'
                                  : 'text-amber-400/60 hover:text-amber-400 border-amber-500/10 hover:border-amber-500/30'
                              }`}
                            >
                              {u.is_admin ? 'Снять админа' : 'Назначить админом'}
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Reports tab ── */}
        {tab === 'reports' && (
          <div className="flex flex-col gap-3">
            {reports.length === 0 && (
              <p className="text-white/30 text-sm py-8 text-center">Жалоб пока нет.</p>
            )}
            {reports.map((r) => (
              <div
                key={r.id}
                className={`rounded-2xl border p-4 transition-colors ${
                  r.status === 'resolved' ? 'border-white/[0.04] bg-white/[0.01] opacity-50' : 'border-white/[0.08] bg-white/[0.03]'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-white/60 truncate">{r.user_name}</span>
                      <span className="text-white/20 text-xs">·</span>
                      <span className="text-white/30 text-xs">{new Date(r.created_at).toLocaleDateString('ru-RU')}</span>
                      {r.context && (
                        <>
                          <span className="text-white/20 text-xs">·</span>
                          <span className="text-xs text-emerald-400/60 font-mono">{r.context}</span>
                        </>
                      )}
                    </div>
                    <p className="text-white text-sm">{r.description}</p>
                  </div>
                  {r.status === 'open' && (
                    <button
                      onClick={() => resolveReport(r.id)}
                      className="shrink-0 text-xs px-3 py-1.5 text-emerald-400 hover:text-emerald-300 border border-emerald-500/20 hover:border-emerald-500/40 rounded-lg transition-colors"
                    >
                      Решено
                    </button>
                  )}
                  {r.status === 'resolved' && (
                    <span className="shrink-0 text-xs text-white/20">✓ Решено</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
