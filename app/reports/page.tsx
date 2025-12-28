'use client';

import { useEffect, useState } from 'react';
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
  const [appActiveUsers, setAppActiveUsers] = useState<number | string>('—');
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
        const userRes = await apiClient.getUsers();
        setUsers(userRes.data || []);
        const usageRes = await apiClient.getUsageMetrics();
        setAppActiveUsers(usageRes.data?.appActiveUsers ?? '—');
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
  const usersWithEmail = users.filter((u) => u.email).length;
  const appActiveNumber =
    typeof appActiveUsers === 'number'
      ? appActiveUsers
      : Number.isFinite(parseInt(appActiveUsers as any, 10))
        ? parseInt(appActiveUsers as any, 10)
        : 0;
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
          {canCreateMessage && (
            <Link
              href="/messages/new"
              className="inline-flex items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-white font-medium hover:bg-primary-dark transition-colors"
            >
              + Crear campaña
            </Link>
          )}
        </div>

        {error && (
          <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Mensajes (año)" value={loading ? '—' : total} />
          <StatCard title="Email enviados" value={loading ? '—' : sentEmail} />
          <StatCard title="Email fallidos" value={loading ? '—' : failedEmail} />
          <StatCard title="App enviados" value={loading ? '—' : appSent} />
          <StatCard title="App leídos" value={loading ? '—' : appRead} />
          <StatCard title="Usuarios con email registrado" value={loading ? '—' : usersWithEmail} />
          <StatCard title="Usuarios activos app" value={loading ? '—' : appActiveUsers} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard
            title="Adopción App vs Colegio"
            subtitle="Comparativo de personas totales vs activas en la app"
            data={[
              { label: 'Personas del colegio', value: users.length, color: '#0ea5e9' },
              { label: 'Activos en app', value: appActiveNumber, color: '#10b981' },
            ]}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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

        <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
          <div className="flex flex-col gap-3 p-4 border-b border-gray-100">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-gray-900">Resumen de mensajes</h2>
              <span className="text-sm text-gray-500">
                {loading ? 'Cargando...' : `${paginated.length} mostrado(s)`}
              </span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <input
                type="search"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Buscar por contenido o remitente"
                className="w-full sm:w-96 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200"
              />
              <div className="text-sm text-gray-600">
                Mostrando {paginated.length} de {filtered.length} mensajes
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50 text-left text-sm text-gray-600">
                <tr>
                  <th className="px-4 py-3">Mensaje</th>
                  <th className="px-4 py-3">Enviado por</th>
                  <th className="px-4 py-3">Canal Email</th>
                  <th className="px-4 py-3">Canal App</th>
                  <th className="px-4 py-3">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 text-sm">
                {paginated.map((m) => (
                  <tr key={m.id} className="hover:bg-primary/5">
                    <td className="px-4 py-3 text-gray-900 font-medium line-clamp-2">{m.content}</td>
                    <td className="px-4 py-3 text-gray-700">{m.senderName || '—'}</td>
                    <td className="px-4 py-3">
                      {Array.isArray((m as any).channels) && (m as any).channels.includes('email') ? (
                        <Badge status={m.emailStatus || '—'} />
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {Array.isArray((m as any).channels) && (m as any).channels.includes('app') ? (
                        <Badge status={m.appStatus || '—'} />
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {m.createdAt ? new Date(m.createdAt).toLocaleString() : '—'}
                    </td>
                  </tr>
                ))}
                {!loading && !filtered.length && (
                  <tr>
                    <td className="px-4 py-4 text-gray-500" colSpan={5}>
                      No hay datos de mensajes todavía.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm disabled:opacity-50"
          >
            Anterior
          </button>
          <span className="text-sm text-gray-600">
            Página {page} de {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm disabled:opacity-50"
          >
            Siguiente
          </button>
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
