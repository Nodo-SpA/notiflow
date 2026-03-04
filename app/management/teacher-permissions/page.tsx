'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ProtectedLayout } from '@/components/layout/ProtectedLayout';
import { apiClient } from '@/lib/api-client';
import { sortGroupsByName } from '@/lib/group-sort';
import { matchesSearchQuery } from '@/lib/search-utils';
import { useAuthStore } from '@/store';

type Teacher = { id: string; name?: string; email: string; role?: string };
type Group = { id: string; name: string };
type Permission = { email: string; allowedGroupIds: string[] };

export default function TeacherPermissionsPage() {
  const user = useAuthStore((state) => state.user);
  const canCreateUsers = useAuthStore((state) => state.hasPermission('users.create'));
  const canUpdateUsers = useAuthStore((state) => state.hasPermission('users.update'));
  const canManage = canCreateUsers || canUpdateUsers;
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [perms, setPerms] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [savingEmail, setSavingEmail] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [saveSuccess, setSaveSuccess] = useState('');

  useEffect(() => {
    if (!canManage) return;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const fetchAllUsers = async () => {
          const all: Teacher[] = [];
          const pageSize = 100;
          let page = 1;
          while (true) {
            const res = await apiClient.getUsers({ page, pageSize });
            const raw = res.data;
            const chunk = (Array.isArray(raw) ? raw : (raw as any)?.items || []) as Teacher[];
            if (!chunk.length) break;
            all.push(...chunk);
            if (chunk.length < pageSize) break;
            page += 1;
            if (page > 50) break;
          }
          return all;
        };
        const fetchAllGroups = async () => {
          const all: Group[] = [];
          const pageSize = 100;
          let page = 1;
          while (true) {
            const res = await apiClient.getGroups(undefined, undefined, undefined, page, pageSize);
            const raw = res.data;
            const chunk = (Array.isArray(raw) ? raw : (raw as any)?.items || []) as Group[];
            if (!chunk.length) break;
            all.push(...chunk);
            const hasMore = Array.isArray(raw) ? chunk.length === pageSize : (raw as any)?.hasMore === true;
            if (!hasMore) break;
            page += 1;
            if (page > 50) break;
          }
          return all;
        };

        const [fetchedTeachers, fetchedGroups, permsRes] = await Promise.all([
          fetchAllUsers(),
          fetchAllGroups(),
          apiClient.getTeacherPermissions?.(),
        ]);
        const onlyTeachers = fetchedTeachers.filter((t) => (t.role || '').toLowerCase() === 'teacher');
        setTeachers(onlyTeachers);
        setGroups(sortGroupsByName(fetchedGroups));
        const permList = (permsRes?.data || []) as Permission[];
        const map: Record<string, string[]> = {};
        permList.forEach((p) => {
          map[p.email.toLowerCase()] = p.allowedGroupIds || [];
        });
        setPerms(map);
      } catch (err: any) {
        const msg =
          err?.response?.data?.message ||
          err?.response?.data?.error ||
          err?.message ||
          'No se pudieron cargar los datos';
        setError(msg);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [canManage]);

  const filteredTeachers = useMemo(() => {
    if (!search.trim()) return teachers;
    return teachers.filter((t) => matchesSearchQuery(search, t.name, t.email));
  }, [teachers, search]);

  const toggleGroup = (email: string, groupId: string) => {
    const key = email.toLowerCase();
    setPerms((prev) => {
      const current = prev[key] || [];
      const next = current.includes(groupId)
        ? current.filter((g) => g !== groupId)
        : [...current, groupId];
      return { ...prev, [key]: next };
    });
  };

  const savePerms = async (email: string) => {
    setSavingEmail(email);
    setError('');
    setSaveSuccess('');
    try {
      const allowedGroupIds = perms[email.toLowerCase()] || [];
      await apiClient.updateTeacherPermission?.(email, { email, allowedGroupIds });
      const teacherName =
        teachers.find((t) => t.email.toLowerCase() === email.toLowerCase())?.name || email;
      setSaveSuccess(`Se guardaron los accesos del profesor ${teacherName}.`);
      setTimeout(() => setSaveSuccess(''), 3000);
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        'No se pudo guardar';
      setError(msg);
    } finally {
      setSavingEmail(null);
    }
  };

  if (!canManage) {
    return (
      <ProtectedLayout>
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Sin permisos</h1>
          <p className="text-gray-600">No tienes permisos para gestionar permisos de profesores.</p>
        </div>
      </ProtectedLayout>
    );
  }

  return (
    <ProtectedLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Gestión escolar</p>
            <h1 className="text-4xl font-bold text-gray-900">Permisos profesores</h1>
            <p className="text-gray-600 mt-1">Define qué cursos/grupos puede usar cada profesor al enviar mensajes.</p>
          </div>
          <Link href="/dashboard" className="text-primary hover:text-green-800 transition-colors">
            ← Volver al dashboard
          </Link>
        </div>

        {saveSuccess && (
          <div className="p-3 bg-green-50 border border-green-200 text-green-800 rounded text-sm">
            {saveSuccess}
          </div>
        )}

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">
            {error}
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Profesores</h2>
              <p className="text-sm text-gray-600">Selecciona los grupos permitidos por profesor.</p>
            </div>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre o email"
              className="w-full sm:w-80 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200"
            />
          </div>

          {loading && <p className="text-sm text-gray-500">Cargando...</p>}
          {!loading && (
            <div className="space-y-4">
              {filteredTeachers.map((t) => {
                const allowed = perms[t.email.toLowerCase()] || [];
                return (
                  <div key={t.id} className="border border-gray-200 rounded-lg p-3">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{t.name || t.email}</p>
                        <p className="text-xs text-gray-500">{t.email}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => savePerms(t.email)}
                        disabled={savingEmail === t.email}
                        className="px-3 py-1.5 text-xs bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-50"
                      >
                        {savingEmail === t.email ? 'Guardando...' : 'Guardar'}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {groups.map((g) => {
                        const active = allowed.includes(g.id);
                        return (
                          <button
                            type="button"
                            key={g.id}
                            onClick={() => toggleGroup(t.email, g.id)}
                            className={`px-3 py-1.5 rounded-full border text-xs transition ${
                              active
                                ? 'bg-primary text-white border-primary'
                                : 'border-gray-200 text-gray-700 hover:border-primary'
                            }`}
                          >
                            {g.name}
                          </button>
                        );
                      })}
                      {groups.length === 0 && <p className="text-xs text-gray-500">No hay grupos.</p>}
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      {allowed.length} grupo(s) permitidos
                    </p>
                  </div>
                );
              })}
              {!filteredTeachers.length && <p className="text-sm text-gray-500">No hay profesores para este colegio.</p>}
            </div>
          )}
        </div>
      </div>
    </ProtectedLayout>
  );
}
