'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ProtectedLayout } from '@/components/layout/ProtectedLayout';
import { apiClient } from '@/lib/api-client';
import { useAuthStore, useYearStore } from '@/store';

type MessageReport = {
  id: string;
  content: string;
  senderName: string;
  createdAt?: string;
  emailStatus?: string;
  appStatus?: string;
};
type UserLight = { id: string; email?: string };
type StudentLight = { id: string; email?: string; guardians?: { email?: string }[]; guardianEmails?: string[] };

const statusLabel = (status?: string) => {
  const s = (status || '').toLowerCase();
  switch (s) {
    case 'sent':
    case 'delivered':
      return 'Enviado';
    case 'failed':
      return 'Falló';
    case 'pending':
      return 'Pendiente';
    case 'read':
      return 'Leído';
    case 'scheduled':
      return 'Programado';
    case 'draft':
      return 'Borrador';
    default:
      return status || '—';
  }
};

const statusIcon = (status?: string) => {
  const s = (status || '').toLowerCase();
  if (s === 'sent' || s === 'delivered') {
    return '✔';
  }
  if (s === 'read') {
    return '✔✔';
  }
  return '';
};

export default function ReportsPage() {
  const { year } = useYearStore();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const canView = hasPermission('reports.view');
  const canCreateMessage = hasPermission('messages.create');
  const [messages, setMessages] = useState<MessageReport[]>([]);
  const [users, setUsers] = useState<UserLight[]>([]);
  const [students, setStudents] = useState<StudentLight[]>([]);
  const [appActiveUsers, setAppActiveUsers] = useState<number | string>('—');
  const [appActiveBySchool, setAppActiveBySchool] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  useEffect(() => {
    if (!canView) return;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const fetchAllMessages = async () => {
          const all: MessageReport[] = [];
          const pageSize = 100;
          let page = 1;
          let hasMore = true;
          while (hasMore) {
            const res = await apiClient.getMessages({ year, page, pageSize });
            const data = res.data || {};
            const items = (data as any).items ?? data ?? [];
            if (!Array.isArray(items) || items.length === 0) break;
            all.push(...items);
            hasMore = (data as any).hasMore === true;
            if (!hasMore) break;
            page += 1;
            if (page > 100) break;
          }
          return all;
        };

        const pageSize = 100;
        const fetchAllUsers = async () => {
          let page = 1;
          const acc: UserLight[] = [];
          while (true) {
            const resUsers = await apiClient.getUsers({ page, pageSize });
            const dataUsers = resUsers.data;
            const itemsUsers = Array.isArray(dataUsers) ? dataUsers : (dataUsers as any)?.items || [];
            if (!Array.isArray(itemsUsers) || itemsUsers.length === 0) break;
            acc.push(...itemsUsers);
            if (itemsUsers.length < pageSize) break;
            page++;
            if (page > 100) break;
          }
          return acc;
        };
        const fetchAllStudents = async () => {
          let page = 1;
          const acc: StudentLight[] = [];
          const studentPageSize = 200;
          let hasMore = true;
          while (hasMore) {
            const resStudents = await apiClient.getStudents({
              year: year || undefined,
              page,
              pageSize: studentPageSize,
            });
            const dataStudents = resStudents.data || {};
            const itemsStudents = (dataStudents as any).items ?? dataStudents ?? [];
            if (!Array.isArray(itemsStudents) || itemsStudents.length === 0) break;
            acc.push(...itemsStudents);
            hasMore = (dataStudents as any).hasMore === true;
            if (!hasMore) break;
            page++;
            if (page > 100) break;
          }
          return acc;
        };
        const [allMessages, allUsers, allStudents] = await Promise.all([
          fetchAllMessages(),
          fetchAllUsers(),
          fetchAllStudents(),
        ]);
        setMessages(allMessages);
        setUsers(allUsers);
        setStudents(allStudents);
        const usageRes = await apiClient.getUsageMetrics();
        setAppActiveUsers(usageRes.data?.appActiveUsers ?? '—');
        setAppActiveBySchool(usageRes.data?.appActiveBySchool ?? {});
      } catch (err: any) {
        const msg =
          err?.response?.data?.message ||
          err?.response?.data?.error ||
          err?.message ||
          'No se pudieron cargar los mensajes';
        setError(msg);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [canView, year]);

  const filtered = messages.filter((m) => {
    const term = search.toLowerCase();
    return (
      !term ||
      m.content?.toLowerCase().includes(term) ||
      m.senderName?.toLowerCase().includes(term)
    );
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  // Métricas de envío (totales del mes actual, sin filtro de búsqueda)
  const now = new Date();
  const baseMessages = messages.filter((m) => {
    const d = m.createdAt ? new Date(m.createdAt) : null;
    if (!d || Number.isNaN(d.getTime())) return false;
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const total = baseMessages.length;
  const emailStatus = (m: any) => (m.emailStatus || '').toLowerCase();
  const appStatus = (m: any) => (m.appStatus || '').toLowerCase();

  const sentEmail = baseMessages.filter((m) => ['sent', 'delivered'].includes(emailStatus(m))).length;
  const failedEmail = baseMessages.filter((m) => emailStatus(m) === 'failed').length;
  const totalUsers = users.length;
  const totalStudents = students.length;
  const guardianEmailSet = useMemo(() => {
    const set = new Set<string>();
    students.forEach((s) => {
      (s.guardianEmails || []).forEach((e) => {
        if (e) set.add(e.toLowerCase());
      });
      (s.guardians || []).forEach((g) => {
        if (g.email) set.add(g.email.toLowerCase());
      });
    });
    return set;
  }, [students]);
  const guardiansWithEmail = guardianEmailSet.size;
  const studentHasEmail = (s: any) => {
    const selfEmail = s?.email && s.email.trim() !== '';
    const guardianEmails =
      (s?.guardianEmails || []).some((e: string) => e && e.trim() !== '') ||
      (s?.guardians || []).some((g: any) => g?.email && g.email.trim() !== '');
    return selfEmail || guardianEmails;
  };
  const studentsWithEmail = students.filter((s) => studentHasEmail(s)).length;
  const studentsWithoutEmail = Math.max(0, totalStudents - studentsWithEmail);
  const appActiveNumber = useMemo(() => {
    const global =
      typeof appActiveUsers === 'number'
        ? appActiveUsers
        : Number.isFinite(parseInt(appActiveUsers as any, 10))
          ? parseInt(appActiveUsers as any, 10)
          : 0;
    const schoolId = (useAuthStore.getState().user?.schoolId || '').toLowerCase();
    if (!schoolId) return global;
    const perSchool = appActiveBySchool[schoolId] ?? appActiveBySchool[schoolId.toLowerCase()];
    return perSchool ?? global;
  }, [appActiveUsers, appActiveBySchool]);
  const appActiveCapped = totalStudents === 0 || guardiansWithEmail === 0 ? 0 : appActiveNumber;
  const emailStatusCounts = (() => {
    const base = { sent: 0, failed: 0, read: 0, other: 0 };
    baseMessages.forEach((m) => {
      const s = (m.emailStatus || '').toLowerCase();
      if (s === 'sent' || s === 'delivered') base.sent++;
      else if (s === 'read' || s === 'opened') base.read++;
      else if (s === 'failed') base.failed++;
      else base.other++;
    });
    return base;
  })();
  const appStatusCounts = (() => {
    const base = { read: 0, pending: 0, sent: 0, other: 0 };
    baseMessages.forEach((m) => {
      const s = (m.appStatus || '').toLowerCase();
      if (s === 'read') base.read++;
      else if (s === 'pending') base.pending++;
      else if (s === 'sent' || s === 'delivered') base.sent++;
      else base.other++;
    });
    return base;
  })();
  const appSent = appStatusCounts.sent;
  const appRead = appStatusCounts.read;
  const emailRead = emailStatusCounts.read;
  const weeklyUsage = useMemo(() => {
    const counts = [0, 0, 0, 0]; // 0: semana actual, 1: hace 1 semana, etc.
    const now = new Date();
    messages.forEach((m) => {
      const d = m.createdAt ? new Date(m.createdAt) : null;
      if (!d || Number.isNaN(d.getTime())) return;
      const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays < 0 || diffDays >= 28) return; // solo últimas 4 semanas
      const bucket = Math.floor(diffDays / 7);
      if (bucket >= 0 && bucket < 4) counts[bucket] += 1;
    });
    const labels = ['Semana actual', 'Hace 1 semana', 'Hace 2 semanas', 'Hace 3 semanas'];
    const palette = ['#0ea5e9', '#8b5cf6', '#f97316', '#10b981'];
    return counts.map((value, idx) => ({
      label: labels[idx],
      value,
      color: palette[idx],
    })).reverse(); // mostrar de la más antigua a la más reciente
  }, [messages]);

  if (!canView) {
    return (
      <ProtectedLayout>
        <div className="glass-panel rounded-2xl p-6 soft-shadow">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Sin permisos</h1>
          <p className="text-gray-600">No tienes permisos para ver los reportes.</p>
        </div>
      </ProtectedLayout>
    );
  }

  return (
    <ProtectedLayout>
      <div className="space-y-8">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-sm text-gray-500">Analítica</p>
            <h1 className="text-4xl font-bold text-gray-900">Reportes</h1>
            <p className="text-gray-600 mt-1">Indicadores de envíos y uso (año {year})</p>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="glass-panel rounded-2xl soft-shadow p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Mensajería</p>
              <h2 className="text-lg font-semibold text-gray-900">Indicadores de envíos</h2>
              <p className="text-xs text-gray-500">Datos del mes en curso ({now.toLocaleString('es-CL', { month: 'long', year: 'numeric' })})</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard
              title="Mensajes totales enviados"
              value={loading ? '—' : total}
              accent="border-indigo-200 bg-indigo-50"
              text="text-indigo-800"
            />
            <StatCard
              title="Email enviados"
              value={loading ? '—' : sentEmail}
              accent="border-cyan-200 bg-cyan-50"
              text="text-cyan-800"
            />
            <StatCard
              title="Email leídos"
              value={loading ? '—' : emailRead}
              accent="border-cyan-200 bg-cyan-50"
              text="text-cyan-800"
            />
            <StatCard
              title="Email fallidos"
              value={loading ? '—' : failedEmail}
              accent="border-cyan-200 bg-cyan-50"
              text="text-cyan-800"
            />
            <StatCard
              title="App enviados"
              value={loading ? '—' : appSent}
              accent="border-emerald-200 bg-emerald-50"
              text="text-emerald-800"
            />
            <StatCard
              title="App leídos"
              value={loading ? '—' : appRead}
              accent="border-emerald-200 bg-emerald-50"
              text="text-emerald-800"
            />
          </div>
        </div>

        <div className="glass-panel rounded-2xl soft-shadow p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Usuarios</p>
              <h2 className="text-lg font-semibold text-gray-900">Alcance de la plataforma</h2>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard title="Usuarios totales" value={loading ? '—' : totalUsers} />
            <StatCard title="Estudiantes totales" value={loading ? '—' : totalStudents} />
            <StatCard title="Estudiantes alcanzables (con email)" value={loading ? '—' : studentsWithEmail} />
            <StatCard title="Estudiantes sin email" value={loading ? '—' : studentsWithoutEmail} />
            <StatCard
              title="Apoderados activos en la app (últimos 30 días)"
              value={loading ? '—' : appActiveCapped}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard
            title="Uso semanal (últimas 4 semanas)"
            subtitle="Mensajes enviados por semana"
            data={weeklyUsage}
          />
          <ChartCard
            title="Uso de la app en apoderados"
            subtitle="Apoderados con email vs apoderados que usaron la app en los últimos 30 días"
            data={[
              { label: 'Apoderados con email', value: guardiansWithEmail, color: '#0ea5e9' },
              { label: 'Apoderados activos en app (30 días)', value: appActiveCapped, color: '#10b981' },
            ]}
          />
          <ChartCard
            title="Estado Email"
            subtitle="Distribución por canal email"
            data={[
              { label: 'Enviado', value: emailStatusCounts.sent, color: '#10b981' },
              { label: 'Falló', value: emailStatusCounts.failed, color: '#ef4444' },
              { label: 'No se usó este medio', value: emailStatusCounts.other, color: '#94a3b8' },
            ]}
          />
          <ChartCard
            title="Estado App"
            subtitle="Lecturas y envíos en app"
            data={[
              { label: 'Leído', value: appStatusCounts.read, color: '#3b82f6' },
              { label: 'Enviado', value: appStatusCounts.sent, color: '#10b981' },
              { label: 'Pendiente', value: appStatusCounts.pending, color: '#f59e0b' },
              { label: 'No se usó este medio', value: appStatusCounts.other, color: '#94a3b8' },
            ]}
          />
        </div>
      </div>
    </ProtectedLayout>
  );
}

function StatCard({
  title,
  value,
  accent = '',
  text = 'text-gray-900',
}: {
  title: string;
  value: string | number;
  accent?: string;
  text?: string;
}) {
  return (
    <div className={`glass-panel rounded-2xl p-5 soft-shadow border ${accent}`}>
      <p className="text-sm text-gray-600">{title}</p>
      <div className="mt-2 flex items-baseline gap-2">
        <span className={`text-3xl font-bold ${text}`}>{value}</span>
      </div>
    </div>
  );
}

function Badge({ status }: { status: string }) {
  const s = (status || '').toLowerCase();
  const map: Record<string, string> = {
    sent: 'bg-primary/10 text-primary',
    delivered: 'bg-primary/10 text-primary',
    failed: 'bg-red-100 text-red-700',
    pending: 'bg-yellow-100 text-yellow-700',
    read: 'bg-blue-100 text-blue-700',
  };
  const cls = map[s] || 'bg-gray-100 text-gray-700';
  return (
    <span className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${cls}`}>
      <span className="mr-1">{statusIcon(status)}</span>
      {statusLabel(status)}
    </span>
  );
}

function ChartCard({
  title,
  subtitle,
  data,
}: {
  title: string;
  subtitle?: string;
  data: { label: string; value: number; color: string }[];
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="glass-panel rounded-2xl p-4 soft-shadow">
      <div className="mb-3">
        <p className="text-xs uppercase tracking-wide text-gray-500">{title}</p>
        {subtitle && <p className="text-sm text-gray-600">{subtitle}</p>}
      </div>
      <div className="space-y-2">
        {data.map((d) => (
          <div key={d.label} className="space-y-1">
            <div className="flex items-center justify-between text-sm text-gray-700">
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full" style={{ background: d.color }} />
                {d.label}
              </span>
              <span className="font-semibold">{d.value}</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full"
                style={{
                  width: `${(d.value / max) * 100}%`,
                  background: d.color,
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
