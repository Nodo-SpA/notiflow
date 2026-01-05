'use client';

import Link from 'next/link';
import { ProtectedLayout } from '@/components/layout/ProtectedLayout';
import { useEffect, useMemo, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { useAuthStore, useYearStore } from '@/store';
import { FiSend, FiBarChart, FiBookOpen } from 'react-icons/fi';

type MessageItem = { id: string; content: string; senderName: string; createdAt?: string; status?: string; recipients?: string[]; schoolId?: string };
type UserItem = { id: string; role: string; schoolId?: string; schoolName?: string };
type SchoolItem = { id: string; name: string };

export default function DashboardPage() {
  const { year } = useYearStore();
  // Siempre trabajamos con el año calendario actual cuando no hay uno seleccionado explícitamente
  const currentYear = new Date().getFullYear().toString();
  const effectiveYear = year || currentYear;
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const currentUser = useAuthStore((state) => state.user);
  const canCreateMessage = hasPermission('messages.create');
  const canSeeMessages = hasPermission('messages.list');
  const canSeeReports = hasPermission('reports.view');
  const canSeeUsers = hasPermission('users.list');
  const canSeeStudents =
    hasPermission('students.list') ||
    hasPermission('students.create') ||
    hasPermission('students.update') ||
    hasPermission('students.delete');
  const isSuperAdmin = (currentUser?.role || '').toLowerCase() === 'superadmin' || hasPermission('*');
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [schools, setSchools] = useState<SchoolItem[]>([]);
  const [studentCount, setStudentCount] = useState(0);
  const [appActiveBySchool, setAppActiveBySchool] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const msgPromise = apiClient.getMessages({ year: effectiveYear });
        const usrPromise = canSeeUsers ? apiClient.getUsers() : Promise.resolve({ data: [] });
        const studentPromise = canSeeStudents
          ? apiClient.getStudents({ page: 1, pageSize: 1, year: effectiveYear })
          : Promise.resolve({ data: { items: [], total: 0 } });
        const schPromise = isSuperAdmin ? apiClient.getSchools() : Promise.resolve({ data: [] });
        const usagePromise = isSuperAdmin ? apiClient.getUsageMetrics() : Promise.resolve({ data: {} });
        const [msgRes, usrRes, studentRes, schRes, usageRes] = await Promise.all([
          msgPromise,
          usrPromise,
          studentPromise,
          schPromise,
          usagePromise,
        ]);
        const msgData = msgRes.data || {};
        const msgItems = (msgData as any).items ?? msgData ?? [];
        setMessages(msgItems);
        setUsers(usrRes.data || []);
        const studentData = studentRes.data || {};
        const studentTotal = studentData.total ?? studentData.items?.length ?? 0;
        setStudentCount(studentTotal);
        setSchools((schRes.data || []).map((s: any) => ({ id: s.id, name: s.name })));
        const appMap = (usageRes.data?.appActiveBySchool as Record<string, number> | undefined) || {};
        setAppActiveBySchool(appMap);
      } catch {
        // silencioso; mostramos conteos en cero
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [effectiveYear, canSeeUsers, isSuperAdmin]);

  const stats = useMemo(
    () => {
      const base = [{ label: `Mensajes ${effectiveYear}`, value: messages.length }];
      if (canSeeStudents) {
        base.push({ label: `Estudiantes ${effectiveYear}`, value: studentCount });
      }
      if (canSeeUsers) {
        base.push({ label: 'Usuarios', value: users.length });
        base.push({
          label: 'Admins',
          value: users.filter((u) => (u.role || '').toLowerCase() === 'admin').length,
        });
      }
      return base;
    },
    [messages.length, users, canSeeUsers, canSeeStudents, studentCount, effectiveYear]
  );

  const schoolBreakdown = useMemo(() => {
    if (!isSuperAdmin) return [];
    const userCount = new Map<string, number>();
    const adminCount = new Map<string, number>();
    const messageCount = new Map<string, number>();
    const appActiveCount = new Map<string, number>();

    users.forEach((u) => {
      const id = u.schoolId || 'desconocido';
      userCount.set(id, (userCount.get(id) || 0) + 1);
      if ((u.role || '').toLowerCase() === 'admin') {
        adminCount.set(id, (adminCount.get(id) || 0) + 1);
      }
    });
    messages.forEach((m) => {
      const id = m.schoolId || 'desconocido';
      messageCount.set(id, (messageCount.get(id) || 0) + 1);
    });
    Object.entries(appActiveBySchool || {}).forEach(([id, count]) => {
      appActiveCount.set(id, (appActiveCount.get(id) || 0) + Number(count));
    });

    const knownSchools = new Map<string, string>();
    schools.forEach((s) => knownSchools.set(s.id, s.name));
    // Add any school seen only in data
    userCount.forEach((_, id) => {
      if (!knownSchools.has(id)) knownSchools.set(id, `Colegio ${id}`);
    });
    messageCount.forEach((_, id) => {
      if (!knownSchools.has(id)) knownSchools.set(id, `Colegio ${id}`);
    });
    appActiveCount.forEach((_, id) => {
      if (!knownSchools.has(id)) knownSchools.set(id, `Colegio ${id}`);
    });

    return Array.from(knownSchools.entries()).map(([id, name]) => ({
      id,
      name,
      users: userCount.get(id) || 0,
      admins: adminCount.get(id) || 0,
      messages: messageCount.get(id) || 0,
      appActive: appActiveCount.get(id) || 0,
    }));
  }, [isSuperAdmin, users, messages, schools, appActiveBySchool]);

  const quickActions = [
    canCreateMessage
      ? {
          title: 'Enviar Nuevo Mensaje',
          description: 'Crea y envía un mensaje a estudiantes, cursos o niveles',
          href: '/messages/new',
          color: 'bg-primary',
          icon: FiSend,
        }
      : null,
    canSeeMessages
      ? {
          title: 'Mis Mensajes',
          description: 'Revisa el historial de mensajes enviados',
          href: '/messages',
          color: 'bg-blue-600',
          icon: FiBookOpen,
        }
      : null,
    canSeeReports
      ? {
          title: 'Reportes',
          description: 'Revisa métricas y desempeño',
          href: '/reports',
          color: 'bg-purple-600',
          icon: FiBarChart,
        }
      : null,
  ].filter(Boolean) as { title: string; description: string; href: string; color: string; icon: any }[];

  return (
    <ProtectedLayout>
      <div className="space-y-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-gray-500">Panel general</p>
            <h1 className="text-4xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-gray-600 mt-1">
              Gestiona tu comunicación escolar de forma centralizada
            </p>
          </div>
          {canCreateMessage && (
            <Link
              href="/messages/new"
              className="inline-flex items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-white font-medium hover:bg-primary-dark transition-colors"
            >
              + Enviar mensaje
            </Link>
          )}
        </div>

        <div className={`grid grid-cols-1 gap-6 ${stats.length >= 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
          {stats.map((stat, idx) => (
            <div key={idx} className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
              <p className="text-gray-600 text-sm font-medium">{stat.label}</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                {loading ? '—' : stat.value}
              </p>
            </div>
          ))}
        </div>

        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-900">Acciones Rápidas</h2>
            <Link
              href="/messages"
              className="text-primary hover:text-green-800 transition-colors text-sm"
            >
              Ver historial
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {quickActions.map((action, idx) => (
              <Link
                key={idx}
                href={action.href}
                className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className={`${action.color} p-3 rounded-lg text-white flex items-center justify-center`}>
                    <action.icon size={20} />
                  </div>
                  <div className="text-gray-400 group-hover:text-primary transition-colors">→</div>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {action.title}
                </h3>
                <p className="text-gray-600 text-sm">{action.description}</p>
              </Link>
            ))}
          </div>
        </div>

        {isSuperAdmin && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-gray-900">Visión por colegio</h2>
              <p className="text-sm text-gray-500">Solo visible para Superadmin</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {schoolBreakdown.map((s) => (
                <div key={s.id} className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
                  <p className="text-sm text-gray-500 mb-1">{s.id}</p>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">{s.name}</h3>
                  <div className="space-y-2 text-sm text-gray-700">
                    <div className="flex justify-between">
                      <span>Usuarios</span>
                      <span className="font-bold">{loading ? '—' : s.users}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Admins</span>
                      <span className="font-bold">{loading ? '—' : s.admins}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Mensajes {effectiveYear}</span>
                      <span className="font-bold">{loading ? '—' : s.messages}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Usuarios activos en la app (últimos 30 días)</span>
                      <span className="font-bold">{loading ? '—' : s.appActive}</span>
                    </div>
                  </div>
                </div>
              ))}
              {schoolBreakdown.length === 0 && (
                <div className="bg-white border border-dashed border-gray-300 rounded-lg p-5 text-sm text-gray-500">
                  No hay datos de colegios aún.
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </ProtectedLayout>
  );
}
