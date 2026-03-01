'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ProtectedLayout } from '@/components/layout/ProtectedLayout';
import { Modal } from '@/components/ui';
import { apiClient } from '@/lib/api-client';
import { useAuthStore, useYearStore } from '@/store';

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

type StudentItem = {
  id: string;
  run?: string;
  firstName: string;
  lastNameFather?: string;
  lastNameMother?: string;
  email?: string;
  guardians?: { name?: string; email?: string; phone?: string }[];
  schoolId?: string;
  course?: string;
};

const memberKeyVariants = (value?: string | number): string[] => {
  if (value == null) return [];
  const raw = String(value);
  const trimmed = raw.trim();
  const unquoted = trimmed.replace(/^['"`]+|['"`]+$/g, '').trim();
  if (!trimmed) return [];
  const lower = unquoted.toLowerCase();
  const compact = lower
    .replace(/[‐‑‒–—−]/g, '-')
    .replace(/[.\s'"`]/g, '');
  const variants = new Set<string>([trimmed, unquoted, lower, compact]);

  if (!lower.includes('@')) {
    const noHyphen = compact.replace(/-/g, '');
    const alnum = noHyphen.replace(/[^0-9a-z]/g, '');
    variants.add(noHyphen);
    variants.add(alnum);
    if (/^[0-9]+[0-9k]$/.test(alnum)) {
      const rutCompact = alnum;
      variants.add(rutCompact);
      variants.add(rutCompact.toUpperCase());
      variants.add(rutCompact.toLowerCase());
      variants.add(`${rutCompact.slice(0, -1)}${rutCompact.slice(-1).toUpperCase()}`);
      variants.add(`${rutCompact.slice(0, -1)}${rutCompact.slice(-1).toLowerCase()}`);
      variants.add(`${rutCompact.slice(0, -1)}-${rutCompact.slice(-1)}`);
      const rut = `${noHyphen.slice(0, -1)}-${noHyphen.slice(-1)}`;
      variants.add(rut);
      variants.add(rut.toLowerCase());
      variants.add(rut.toUpperCase());
    }
  }
  return Array.from(variants).filter(Boolean);
};

export default function GroupsPage() {
  const user = useAuthStore((state) => state.user);
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const role = (user?.role || '').toUpperCase();
  const { year } = useYearStore();
  const currentYear = new Date().getFullYear().toString();
  const effectiveYear = year || currentYear;
  // Acceso sólo si puede crear/editar/borrar grupos (listar por sí solo no muestra la sección)
  const canManageGroups =
    hasPermission('groups.create') ||
    hasPermission('groups.update') ||
    hasPermission('groups.delete');
  const isGlobalAdmin = (user?.schoolId || '').toLowerCase() === 'global';
  const canRebuildGroups = role === 'SUPERADMIN' || role === 'ADMIN';
  const router = useRouter();

  const [users, setUsers] = useState<UserItem[]>([]);
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [originalMemberIds, setOriginalMemberIds] = useState<string[]>([]);
  const [schools, setSchools] = useState<SchoolItem[]>([]);
  const [groupForm, setGroupForm] = useState({
    name: '',
    description: '',
    memberIds: [] as string[],
    schoolId: '',
  });
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [lookupStudents, setLookupStudents] = useState<StudentItem[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [loadingSchools, setLoadingSchools] = useState(false);
  const [savingGroup, setSavingGroup] = useState(false);
  const [rebuildingGroups, setRebuildingGroups] = useState(false);
  const [showRebuildConfirm, setShowRebuildConfirm] = useState(false);
  const [rebuildResult, setRebuildResult] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [searchUser, setSearchUser] = useState('');
  const [searchGroup, setSearchGroup] = useState('');
  const [debouncedSearchGroup, setDebouncedSearchGroup] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAllMembers, setShowAllMembers] = useState(false);
  const [showAllCandidates, setShowAllCandidates] = useState(false);

  useEffect(() => {
    if (!canManageGroups) return;
    loadUsers();
    loadStudents();
    loadLookupStudents();
    if (isGlobalAdmin) loadSchools();
    if (!isGlobalAdmin && user?.schoolId) {
      setGroupForm((prev) => ({ ...prev, schoolId: user.schoolId }));
    }
  }, [canManageGroups, isGlobalAdmin, user, effectiveYear]);

  useEffect(() => {
    if (!canManageGroups) return;
    loadStudents();
    loadLookupStudents();
  }, [groupForm.schoolId, effectiveYear, canManageGroups]);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearchGroup(searchGroup.trim()), 300);
    return () => clearTimeout(handle);
  }, [searchGroup]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearchGroup, isGlobalAdmin ? groupForm.schoolId : user?.schoolId, effectiveYear]);

  useEffect(() => {
    if (!canManageGroups) return;
    loadGroups();
  }, [canManageGroups, debouncedSearchGroup, page, isGlobalAdmin, groupForm.schoolId, effectiveYear]);

  const loadUsers = async () => {
    setLoadingUsers(true);
    setError('');
    try {
      const all: UserItem[] = [];
      const pageSize = 100;
      let pageIndex = 1;
      while (true) {
        const res = await apiClient.getUsers({ page: pageIndex, pageSize });
        const chunk = (res.data || []) as UserItem[];
        all.push(...chunk);
        if (!chunk.length || chunk.length < pageSize) break;
        pageIndex += 1;
        if (pageIndex > 20) break; // safety cap
      }
      setUsers(all);
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

  const loadStudents = async () => {
    const targetSchoolId = isGlobalAdmin ? groupForm.schoolId : user?.schoolId;
    if (!targetSchoolId) return;
    setLoadingStudents(true);
    try {
      const all: StudentItem[] = [];
      const pageSize = 500;
      let pageIndex = 1;
      let hasMore = true;
      while (hasMore) {
        const res = await apiClient.getStudents({
          page: pageIndex,
          pageSize,
          schoolId: targetSchoolId,
          year: effectiveYear,
        });
        const data = res.data || {};
        const items = data.items || [];
        all.push(...items);
        hasMore = data.hasMore === true;
        if (!hasMore || items.length === 0) break;
        pageIndex += 1;
        if (pageIndex > 50) break; // safety cap
      }
      setStudents(all);
    } catch (err: any) {
      // silencioso
    } finally {
      setLoadingStudents(false);
    }
  };

  const loadLookupStudents = async () => {
    const targetSchoolId = isGlobalAdmin ? groupForm.schoolId : user?.schoolId;
    if (!targetSchoolId) {
      setLookupStudents([]);
      return;
    }
    try {
      const all: StudentItem[] = [];
      const pageSize = 500;
      let pageIndex = 1;
      let hasMore = true;
      while (hasMore) {
        const res = await apiClient.getStudents({
          page: pageIndex,
          pageSize,
          schoolId: targetSchoolId,
        });
        const data = res.data || {};
        const items = data.items || [];
        all.push(...items);
        hasMore = data.hasMore === true;
        if (!hasMore || items.length === 0) break;
        pageIndex += 1;
        if (pageIndex > 50) break; // lookup only; evita loops infinitos
      }
      setLookupStudents(all);
    } catch {
      // lookup best-effort
    }
  };

  const filteredUsers = useMemo(() => {
    const combined = [
      ...users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        badge: 'Usuario',
      })),
      ...students
        .filter((s) => {
          const schoolFilter = isGlobalAdmin ? groupForm.schoolId : user?.schoolId;
          if (!schoolFilter) return true;
          return s.schoolId === schoolFilter;
        })
        .map((s) => ({
          id: s.id,
          name: `${s.firstName || ''} ${s.lastNameFather || ''} ${s.lastNameMother || ''}`.trim(),
          email: (() => {
            const emails = [
              s.email,
              ...(s.guardians || []).map((g) => g?.email).filter(Boolean),
            ].filter(Boolean);
            return emails[0];
          })(),
          role: s.course || 'Alumno',
          badge: 'Alumno',
        })),
  ];
    if (!searchUser.trim()) return combined;
    const term = searchUser.toLowerCase();
    return combined.filter(
      (u) =>
        u.name?.toLowerCase().includes(term) ||
        u.email?.toLowerCase().includes(term) ||
        u.role?.toLowerCase().includes(term)
    );
  }, [searchUser, users, students, user?.schoolId, isGlobalAdmin, groupForm.schoolId]);

  const memberLookup = useMemo(() => {
    const map = new Map<string, { label: string; detail?: string }>();
    const addLookup = (key: string | undefined, value: { label: string; detail?: string }) => {
      memberKeyVariants(key).forEach((variant) => map.set(variant, value));
    };

    users.forEach((u) => {
      const name = u.name || u.email || 'Usuario';
      addLookup(u.id, { label: name, detail: u.email });
      addLookup(u.email, { label: name, detail: u.email });
    });
    const allStudents = [...students, ...lookupStudents];
    allStudents.forEach((s) => {
      const fullName = `${s.firstName || ''} ${s.lastNameFather || ''} ${s.lastNameMother || ''}`.trim();
      const label = fullName || s.email || 'Alumno';
      addLookup(s.id, { label, detail: s.course });
      addLookup(s.run, { label, detail: s.course });
      addLookup(s.email, { label, detail: s.course });
      (s.guardians || []).forEach((g) => {
        if (!g?.email) return;
        addLookup(g.email, {
          label: fullName || 'Alumno',
          detail: fullName ? s.course || g.email : g.email,
        });
      });
    });
    return map;
  }, [users, students, lookupStudents]);

  const selectedMemberLabels = useMemo(() => {
    const unique = Array.from(new Set(groupForm.memberIds || []));
    const resolveLookup = (key: string) => {
      for (const variant of memberKeyVariants(key)) {
        const found = memberLookup.get(variant);
        if (found) return found;
      }
      return undefined;
    };
    return unique.map((id) => ({
      id,
      label: resolveLookup(id)?.label || id,
      detail: resolveLookup(id)?.detail,
    }));
  }, [groupForm.memberIds, memberLookup]);

  const candidateUsers = useMemo(() => {
    const selected = new Set((groupForm.memberIds || []).flatMap((id) => memberKeyVariants(id)));
    const isAlreadySelected = (raw?: string) =>
      memberKeyVariants(raw).some((variant) => selected.has(variant));
    return filteredUsers.filter((u) => !isAlreadySelected(u.id) && !isAlreadySelected(u.email || ''));
  }, [filteredUsers, groupForm.memberIds]);

  const memberChanges = useMemo(() => {
    if (!editingId) return { added: 0, removed: 0 };
    const original = new Set(originalMemberIds);
    const current = new Set(groupForm.memberIds || []);
    let added = 0;
    let removed = 0;
    current.forEach((id) => {
      if (!original.has(id)) added += 1;
    });
    original.forEach((id) => {
      if (!current.has(id)) removed += 1;
    });
    return { added, removed };
  }, [editingId, originalMemberIds, groupForm.memberIds]);

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
      const res = await apiClient.getGroups(
        schoolIdParam,
        effectiveYear,
        debouncedSearchGroup || undefined,
        page,
        pageSize
      );
      const data = res.data || {};
      const items = data.items ?? data ?? [];
      setGroups(items);
      setTotal(data.total ?? items.length ?? 0);
      setHasMore(data.hasMore ?? false);
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

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const paginatedGroups = groups;

  if (!canManageGroups) {
    return (
      <ProtectedLayout>
        <div className="glass-panel rounded-2xl p-6 soft-shadow">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Sin permisos</h1>
          <p className="text-gray-600">No tienes permisos para gestionar grupos.</p>
        </div>
      </ProtectedLayout>
    );
  }

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
      if (editingId) {
        await apiClient.updateGroup(editingId, {
          name: groupForm.name,
          description: groupForm.description,
          memberIds: groupForm.memberIds,
          schoolId,
        });
      } else {
        await apiClient.createGroup({
          name: groupForm.name,
          description: groupForm.description,
          memberIds: groupForm.memberIds,
          schoolId,
        });
      }
      setGroupForm({
        name: '',
        description: '',
        memberIds: [],
        schoolId: isGlobalAdmin ? '' : schoolId,
      });
      setEditingId(null);
      await loadGroups();
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        'No se pudo guardar el grupo';
      setError(msg);
    } finally {
      setSavingGroup(false);
    }
  };

  const startEdit = (g: GroupItem) => {
    setEditingId(g.id);
    setShowAllMembers(false);
    setShowAllCandidates(false);
    setOriginalMemberIds(g.memberIds || []);
    setGroupForm({
      name: g.name,
      description: g.description || '',
      memberIds: g.memberIds || [],
      schoolId: isGlobalAdmin ? g.schoolId : groupForm.schoolId || user?.schoolId || '',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setShowAllMembers(false);
    setShowAllCandidates(false);
    setOriginalMemberIds([]);
    setGroupForm({
      name: '',
      description: '',
      memberIds: [],
      schoolId: isGlobalAdmin ? '' : user?.schoolId || '',
    });
  };

  const handleDelete = async (id: string) => {
    setSavingGroup(true);
    setError('');
    try {
      await apiClient.deleteGroup(id);
      if (editingId === id) cancelEdit();
      await loadGroups();
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        'No se pudo eliminar el grupo';
      setError(msg);
    } finally {
      setSavingGroup(false);
    }
  };

  const handleRebuildCourses = () => {
    if (!canRebuildGroups) return;
    const targetSchool = isGlobalAdmin ? groupForm.schoolId : user?.schoolId;
    if (!targetSchool) {
      setError('Selecciona el colegio antes de recrear grupos.');
      return;
    }
    setShowRebuildConfirm(true);
  };

  const confirmRebuildCourses = async () => {
    const targetSchool = isGlobalAdmin ? groupForm.schoolId : user?.schoolId;
    if (!targetSchool) {
      setShowRebuildConfirm(false);
      setError('Selecciona el colegio antes de recrear grupos.');
      return;
    }
    setRebuildingGroups(true);
    setShowRebuildConfirm(false);
    setError('');
    setRebuildResult(null);
    try {
      const res = await apiClient.rebuildCourseGroups({ schoolId: targetSchool, year: effectiveYear });
      const updated = res?.data?.updated ?? 0;
      setRebuildResult(updated);
      await loadGroups();
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        'No se pudo recrear los grupos de curso';
      setError(msg);
    } finally {
      setRebuildingGroups(false);
    }
  };

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

        <div className="glass-panel rounded-2xl soft-shadow p-6 space-y-4">
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
              <div className="space-y-2 border border-gray-200 rounded-lg p-3">
                {groupForm.memberIds.length > 0 && (
                  <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-gray-600">
                        Miembros actuales: <strong>{groupForm.memberIds.length}</strong>
                      </p>
                      {selectedMemberLabels.length > 10 && (
                        <button
                          type="button"
                          onClick={() => setShowAllMembers((prev) => !prev)}
                          className="text-xs text-primary hover:underline"
                        >
                          {showAllMembers ? 'Mostrar menos' : 'Mostrar todos'}
                        </button>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(showAllMembers ? selectedMemberLabels : selectedMemberLabels.slice(0, 10)).map((m) => (
                        <button
                          type="button"
                          key={m.id}
                          title={m.detail ? `${m.label} · ${m.detail}` : m.label}
                          className="group flex max-w-[260px] items-center gap-2 truncate rounded-full border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:border-red-200 hover:bg-red-50"
                          onClick={() =>
                            setGroupForm((prev) => ({
                              ...prev,
                              memberIds: prev.memberIds.filter((id) => id !== m.id),
                            }))
                          }
                        >
                          <span className="truncate">
                            {m.detail ? `${m.label} · ${m.detail}` : m.label}
                          </span>
                          <span className="text-xs text-red-400 group-hover:text-red-600">×</span>
                        </button>
                      ))}
                      {selectedMemberLabels.length === 0 && (
                        <span className="text-xs text-gray-500">Sin miembros seleccionados.</span>
                      )}
                    </div>
                  </div>
                )}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <input
                    type="search"
                    value={searchUser}
                    onChange={(e) => setSearchUser(e.target.value)}
                    placeholder="Buscar para agregar..."
                    className="w-full sm:w-2/3 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200"
                  />
                  <span className="text-xs text-gray-500">
                    {candidateUsers.length} candidato(s)
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-1">
                  {(showAllCandidates ? candidateUsers : candidateUsers.slice(0, 60)).map((u) => {
                    const memberKey = u.email || u.id;
                    return (
                    <button
                      type="button"
                      key={u.id}
                      onClick={() =>
                        setGroupForm((prev) => ({
                          ...prev,
                          memberIds: prev.memberIds.includes(memberKey)
                            ? prev.memberIds
                            : [...prev.memberIds, memberKey],
                        }))
                      }
                      className="flex items-center gap-3 text-left text-sm border border-gray-200 rounded-lg px-3 py-2 hover:border-primary hover:bg-primary/5"
                    >
                      <div className="flex-1">
                        <p className="text-gray-800 font-medium">{u.name || 'Sin nombre'}</p>
                        <p className="text-gray-500 text-xs">{u.email || 'Sin correo'}</p>
                        <p className="text-gray-400 text-xs">{u.role || '—'}</p>
                      </div>
                      <span className="text-[11px] px-2 py-1 rounded-full border border-gray-200 bg-gray-50 text-gray-600">
                        {u.badge}
                      </span>
                    </button>
                  );
                  })}
                  {!users.length && (
                    <p className="text-sm text-gray-500">No hay usuarios para seleccionar.</p>
                  )}
                  {users.length > 0 && !candidateUsers.length && (
                    <p className="text-sm text-gray-500">Sin candidatos para agregar.</p>
                  )}
                </div>
                {candidateUsers.length > 60 && (
                  <button
                    type="button"
                    onClick={() => setShowAllCandidates((prev) => !prev)}
                    className="text-xs text-primary hover:underline self-start"
                  >
                    {showAllCandidates ? 'Mostrar menos candidatos' : 'Mostrar todos los candidatos'}
                  </button>
                )}
              </div>
            </div>
            <div className="md:col-span-2 flex justify-end">
              <button
                type="submit"
                disabled={savingGroup}
                className="px-4 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary-dark transition-colors disabled:opacity-60"
              >
                {savingGroup ? 'Guardando...' : editingId ? 'Actualizar grupo' : 'Crear grupo'}
              </button>
              {editingId && (memberChanges.added > 0 || memberChanges.removed > 0) && (
                <span className="ml-3 self-center text-xs text-gray-500">
                  Cambios: +{memberChanges.added} / -{memberChanges.removed}
                </span>
              )}
              {editingId && (
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="ml-3 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                  disabled={savingGroup}
                >
                  Cancelar
                </button>
              )}
            </div>
          </form>
        </div>

        <div className="glass-panel rounded-2xl soft-shadow p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">Grupos creados</h2>
            <div className="flex items-center gap-3">
              {canRebuildGroups && (
                <button
                  type="button"
                  onClick={handleRebuildCourses}
                  disabled={rebuildingGroups}
                  className="inline-flex items-center rounded-xl border border-amber-300 bg-gradient-to-r from-amber-400 to-orange-500 px-4 py-2 text-xs font-semibold tracking-wide text-white shadow-sm transition hover:from-amber-500 hover:to-orange-600 disabled:opacity-60"
                >
                  {rebuildingGroups ? 'Recreando...' : 'Recrear grupos de curso'}
                </button>
              )}
              <input
                type="search"
                value={searchGroup}
                onChange={(e) => {
                  setSearchGroup(e.target.value);
                }}
                placeholder="Buscar grupo"
                className="w-48 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200"
              />
              <span className="text-xs text-gray-500">
                Mostrando {paginatedGroups.length} de {total} grupo(s)
              </span>
              <button
                type="button"
                onClick={loadGroups}
                className="text-sm text-primary hover:text-green-800"
              >
                Refrescar
              </button>
            </div>
          </div>
          {rebuildResult !== null && (
            <div className="text-xs text-gray-600">
              Grupos de curso recreados/actualizados: <strong>{rebuildResult}</strong>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {paginatedGroups.map((g) => (
              <div
                key={g.id}
                className="border border-gray-200 rounded-lg p-3 hover:shadow-sm transition-shadow"
              >
                <p className="text-sm font-semibold text-gray-900">{g.name}</p>
                {g.description && <p className="text-xs text-gray-600 mb-1">{g.description}</p>}
                <p className="text-xs text-gray-600">
                  Miembros: {g.memberIds?.length || 0} • Colegio: {g.schoolId}
                </p>
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => startEdit(g)}
                    className="text-xs text-primary hover:underline"
                  >
                    Editar
                  </button>
                  <span className="text-gray-300">•</span>
                  <button
                    type="button"
                    onClick={() => handleDelete(g.id)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
            {!paginatedGroups.length && (
              <div className="text-sm text-gray-500">No hay grupos registrados.</div>
            )}
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
      </div>
      <Modal
        isOpen={showRebuildConfirm}
        title="Recrear grupos de curso"
        onClose={() => setShowRebuildConfirm(false)}
        onConfirm={confirmRebuildCourses}
        confirmText={rebuildingGroups ? 'Recreando...' : 'Sí, recrear'}
        cancelText="Cancelar"
      >
        <div className="space-y-2 text-sm text-gray-700">
          <p>
            Se recrearán los grupos para el colegio{' '}
            <span className="font-semibold">{isGlobalAdmin ? groupForm.schoolId || '—' : user?.schoolId || '—'}</span>{' '}
            del año <span className="font-semibold">{effectiveYear}</span>.
          </p>
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
            Esta acción actualiza miembros por curso según la matrícula vigente.
          </p>
        </div>
      </Modal>
    </ProtectedLayout>
  );
}
