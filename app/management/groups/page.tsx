'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ProtectedLayout } from '@/components/layout/ProtectedLayout';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/store';

type UserItem = {
  id: string;
  name: string;
  email: string;
  role: string;
  schoolId: string;
  schoolName?: string;
};

type GroupItem = {
  id: string;
  name: string;
  description?: string;
  memberIds: string[];
  schoolId: string;
};

type SchoolItem = {
  id: string;
  name: string;
};

export default function GroupsPage() {
  const user = useAuthStore((state) => state.user);
  const isAdmin = (user?.role || '').toLowerCase() === 'admin';
  const isGlobalAdmin = isAdmin && (user?.schoolId || '').toLowerCase() === 'global';
  const router = useRouter();

  const [users, setUsers] = useState<UserItem[]>([]);
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [schools, setSchools] = useState<SchoolItem[]>([]);
  const [groupForm, setGroupForm] = useState({
    name: '',
    description: '',
    memberIds: [] as string[],
    schoolId: '',
  });
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [loadingSchools, setLoadingSchools] = useState(false);
  const [savingGroup, setSavingGroup] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isAdmin) return;
    loadUsers();
    loadGroups();
    if (isGlobalAdmin) loadSchools();
    if (!isGlobalAdmin && user?.schoolId) {
      setGroupForm((prev) => ({ ...prev, schoolId: user.schoolId }));
    }
  }, [isAdmin, isGlobalAdmin, user]);

  const loadUsers = async () => {
    setLoadingUsers(true);
    setError('');
    try {
      const res = await apiClient.getUsers();
      setUsers(res.data || []);
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        'No se pudieron cargar usuarios';
      setError(msg);
    } finally {
      setLoadingUsers(false);
    }
  };

  const loadSchools = async () => {
    setLoadingSchools(true);
    setError('');
    try {
      const res = await apiClient.getSchools();
      setSchools(res.data || []);
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        'No se pudieron cargar colegios';
      setError(msg);
    } finally {
      setLoadingSchools(false);
    }
  };

  const loadGroups = async () => {
    setLoadingGroups(true);
    setError('');
    try {
      const schoolIdParam = isGlobalAdmin ? groupForm.schoolId || undefined : undefined;
      const res = await apiClient.getGroups(schoolIdParam);
      setGroups(res.data || []);
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        'No se pudieron cargar grupos';
      setError(msg);
    } finally {
      setLoadingGroups(false);
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingGroup(true);
    setError('');
    try {
      const schoolId = isGlobalAdmin
        ? groupForm.schoolId || user?.schoolId
        : user?.schoolId || groupForm.schoolId;
      if (!schoolId) {
        setError('Selecciona colegio para el grupo');
        return;
      }
      if (!groupForm.memberIds.length) {
        setError('Selecciona al menos un miembro');
        return;
      }
      await apiClient.createGroup({
        name: groupForm.name,
        description: groupForm.description,
        memberIds: groupForm.memberIds,
        schoolId,
      });
      setGroupForm({
        name: '',
        description: '',
        memberIds: [],
        schoolId: isGlobalAdmin ? '' : schoolId,
      });
      await loadGroups();
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        'No se pudo crear el grupo';
      setError(msg);
    } finally {
      setSavingGroup(false);
    }
  };

  if (!isAdmin) {
    useEffect(() => {
      router.replace('/dashboard');
    }, [router]);
    return null;
  }

  return (
    <ProtectedLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Gestión</p>
            <h1 className="text-4xl font-bold text-gray-900">Grupos</h1>
            <p className="text-gray-600 mt-1">Crea grupos de usuarios para enviar mensajes</p>
          </div>
          <Link href="/dashboard" className="text-primary hover:text-green-800 transition-colors">
            ← Volver
          </Link>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Nuevo grupo</h2>
              <p className="text-sm text-gray-600">Define nombre, miembros y colegio</p>
            </div>
            {(loadingGroups || loadingUsers) && (
              <span className="text-sm text-gray-500">Cargando...</span>
            )}
          </div>
          <form className="grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={handleCreateGroup}>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del grupo</label>
              <input
                type="text"
                value={groupForm.name}
                onChange={(e) => setGroupForm((prev) => ({ ...prev, name: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
              <input
                type="text"
                value={groupForm.description}
                onChange={(e) => setGroupForm((prev) => ({ ...prev, description: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200"
                placeholder="Opcional"
              />
            </div>
            {isGlobalAdmin && (
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Colegio</label>
                <select
                  value={groupForm.schoolId}
                  onChange={(e) => setGroupForm((prev) => ({ ...prev, schoolId: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200 bg-white"
                >
                  <option value="">Selecciona colegio</option>
                  {schools.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.id})
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Miembros</label>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-y-auto border border-gray-200 rounded-lg p-2">
                {users.map((u) => (
                  <label key={u.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={groupForm.memberIds.includes(u.id)}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setGroupForm((prev) => {
                          const next = new Set(prev.memberIds);
                          if (checked) next.add(u.id);
                          else next.delete(u.id);
                          return { ...prev, memberIds: Array.from(next) };
                        });
                      }}
                    />
                    <span className="text-gray-800">{u.name}</span>
                    <span className="text-gray-500 text-xs">({u.role})</span>
                  </label>
                ))}
                {!users.length && (
                  <p className="text-sm text-gray-500">No hay usuarios para seleccionar.</p>
                )}
              </div>
            </div>
            <div className="md:col-span-2 flex justify-end">
              <button
                type="submit"
                disabled={savingGroup}
                className="px-4 py-2 bg-primary text-white rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-60"
              >
                {savingGroup ? 'Guardando...' : 'Crear grupo'}
              </button>
            </div>
          </form>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">Grupos creados</h2>
            <button
              type="button"
              onClick={loadGroups}
              className="text-sm text-primary hover:text-green-800"
            >
              Refrescar
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {groups.map((g) => (
              <div
                key={g.id}
                className="border border-gray-200 rounded-lg p-3 hover:shadow-sm transition-shadow"
              >
                <p className="text-sm font-semibold text-gray-900">{g.name}</p>
                {g.description && <p className="text-xs text-gray-600 mb-1">{g.description}</p>}
                <p className="text-xs text-gray-600">
                  Miembros: {g.memberIds?.length || 0} • Colegio: {g.schoolId}
                </p>
              </div>
            ))}
            {!groups.length && (
              <div className="text-sm text-gray-500">No hay grupos registrados.</div>
            )}
          </div>
        </div>
      </div>
    </ProtectedLayout>
  );
}
