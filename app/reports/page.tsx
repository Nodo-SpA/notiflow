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
        const res = await apiClient.getMessages({ year });
        const data = res.data || {};
        const items = (data as any).items ?? data ?? [];
        setMessages(items);
        const pageSize = 500;
        const fetchAllUsers = async () => {
          let page = 1;
          const acc: UserLight[] = [];
          while (true) {
            const resUsers = await apiClient.getUsers({ page, pageSize });
            const dataUsers = resUsers.data || {};
            const itemsUsers = (dataUsers as any).items ?? dataUsers ?? [];
            if (!Array.isArray(itemsUsers) || itemsUsers.length === 0) break;
            acc.push(...itemsUsers);
            const totalUsers = (dataUsers as any).total ?? itemsUsers.length;
            if (acc.length >= totalUsers) break;
            page++;
          }
          return acc;
        };
        const fetchAllStudents = async () => {
          let page = 1;
          const acc: StudentLight[] = [];
          while (true) {
            const resStudents = await apiClient.getStudents({
              year: year || undefined,
              page,
              pageSize,
            });
            const dataStudents = resStudents.data || {};
            const itemsStudents = (dataStudents as any).items ?? dataStudents ?? [];
            if (!Array.isArray(itemsStudents) || itemsStudents.length === 0) break;
            acc.push(...itemsStudents);
            const totalStudents = (dataStudents as any).total ?? itemsStudents.length;
            if (acc.length >= totalStudents) break;
            page++;
          }
          return acc;
        };
        const [allUsers, allStudents] = await Promise.all([fetchAllUsers(), fetchAllStudents()]);
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

  const total = filtered.length;
  const sentEmail = messages.filter((m) => (m.emailStatus || '').toLowerCase() === 'sent').length;
  const failedEmail = messages.filter((m) => (m.emailStatus || '').toLowerCase() === 'failed').length;
  const appPending = messages.filter((m) => (m.appStatus || '').toLowerCase() === 'pending').length;
  const appRead = messages.filter((m) => (m.appStatus || '').toLowerCase() === 'read').length;
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
  const studentsWithEmail = students.filter((s) => s.email).length;
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
    const base = { sent: 0, failed: 0, other: 0 };
    messages.forEach((m) => {
      const s = (m.emailStatus || '').toLowerCase();
      if (s === 'sent' || s === 'delivered') base.sent++;
      else if (s === 'failed') base.failed++;
      else base.other++;
    });
    return base;
  })();
  const appStatusCounts = (() => {
    const base = { read: 0, pending: 0, sent: 0, other: 0 };
    messages.forEach((m) => {
      const s = (m.appStatus || '').toLowerCase();
      if (s === 'read') base.read++;
      else if (s === 'pending') base.pending++;
      else if (s === 'sent' || s === 'delivered') base.sent++;
      else base.other++;
    });
    return base;
  })();
  const appSent = appStatusCounts.sent;
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
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
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

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Mensajería</p>
              <h2 className="text-lg font-semibold text-gray-900">Indicadores de envíos</h2>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard title="Mensajes (año)" value={loading ? '—' : total} />
            <StatCard title="Email enviados" value={loading ? '—' : sentEmail} />
            <StatCard title="Email fallidos" value={loading ? '—' : failedEmail} />
            <StatCard title="App enviados" value={loading ? '—' : appSent} />
            <StatCard title="App leídos" value={loading ? '—' : appRead} />
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 space-y-3">
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

function StatCard({ title, value }: { title: string; value: string | number }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
      <p className="text-sm text-gray-600">{title}</p>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-3xl font-bold text-gray-900">{value}</span>
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
    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
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
