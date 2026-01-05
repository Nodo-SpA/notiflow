'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ProtectedLayout } from '@/components/layout/ProtectedLayout';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/store';
import { FiUsers, FiDatabase, FiCpu, FiUpload, FiHome, FiChevronRight } from 'react-icons/fi';
import { Modal } from '@/components/ui';

type UserListItem = {
  id: string;
  name: string;
  email: string;
  role: string;
  schoolId: string;
  schoolName?: string;
  rut?: string;
};

type SchoolItem = {
  id: string;
  name: string;
  currentYear?: string;
  logoUrl?: string;
};

export default function SettingsPage() {
  const user = useAuthStore((state) => state.user);
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const canManageUsers =
    hasPermission('users.create') ||
    hasPermission('users.delete');
  const canUpdateUsers = hasPermission('users.update');
  const canManageSchools = hasPermission('schools.manage');
  const canManageAi = canManageSchools;
  const canAccessSettings = canManageUsers || canManageSchools;
  const canDeleteUsers = hasPermission('users.delete');
  const canCreateUsers = hasPermission('users.create');
  const isGlobalAdmin = (user?.schoolId || '').toLowerCase() === 'global';
  const canImportStudents = isGlobalAdmin;

  const [users, setUsers] = useState<UserListItem[]>([]);
  const [schools, setSchools] = useState<SchoolItem[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingSchools, setLoadingSchools] = useState(false);
  const [error, setError] = useState('');
  const [userForm, setUserForm] = useState({
    name: '',
    email: '',
    role: 'TEACHER',
    schoolId: '',
    schoolName: '',
    rut: '',
  });
  const [schoolForm, setSchoolForm] = useState({
    id: '',
    name: '',
    currentYear: '',
    logoUrl: '',
  });
  const [editingSchool, setEditingSchool] = useState<SchoolItem | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [csvInfo, setCsvInfo] = useState<{ fileName: string; rows: number }>({
    fileName: '',
    rows: 0,
  });
  const [csvData, setCsvData] = useState<
    { name: string; email: string; role: string; rut: string }[]
  >([]);
  const [savingUser, setSavingUser] = useState(false);
  const [savingSchool, setSavingSchool] = useState(false);
  const [importingCsv, setImportingCsv] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [userToDelete, setUserToDelete] = useState<UserListItem | null>(null);
  const [deletingUser, setDeletingUser] = useState(false);
  const [editingUser, setEditingUser] = useState<UserListItem | null>(null);
  const [aiPolicy, setAiPolicy] = useState({
    rewritePrompt: '',
    moderationRules: '',
    updatedBy: '',
    updatedAt: '',
  });
  const [importResult, setImportResult] = useState<{
    processed: number;
    created: number;
    updated: number;
    errors: string[];
  } | null>(null);
  const [importError, setImportError] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importSchoolId, setImportSchoolId] = useState('');
  const [loadingAi, setLoadingAi] = useState(false);
  const [savingAi, setSavingAi] = useState(false);
  const [importingStudents, setImportingStudents] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showSchoolModal, setShowSchoolModal] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [showImportUsersModal, setShowImportUsersModal] = useState(false);
  const [showImportStudentsModal, setShowImportStudentsModal] = useState(false);
  const [showEditSchool, setShowEditSchool] = useState(false);
  const [createLogoFile, setCreateLogoFile] = useState<File | null>(null);
  const [aiSuccess, setAiSuccess] = useState('');
  const defaultRewritePrompt = `Mejora la redacción del siguiente mensaje manteniendo el significado.
Adáptalo a un tono {tone}, claro y respetuoso. Devuelve solo el texto mejorado sin marcas adicionales.
Mensaje original:
{texto}`;
  const defaultRules = `Discurso de odio o racismo
Política partidista
Violencia o acoso
Información sensible no académica`;

  const availableRoles = useMemo(
    () => [
      { value: 'ADMIN', label: 'Admin' },
      { value: 'COORDINATOR', label: 'Gestión escolar' }, // unifica director/coordinador
      { value: 'TEACHER', label: 'Profesor' },
    ],
    []
  );

  const formatRut = (value: string) => {
    const clean = value.replace(/[^0-9kK]/g, '').toUpperCase();
    if (!clean) return '';
    const body = clean.slice(0, -1);
    const dv = clean.slice(-1);
    const withDots = body
      .split('')
      .reverse()
      .reduce<string[]>((acc, curr, idx) => {
        if (idx !== 0 && idx % 3 === 0) acc.push('.');
        acc.push(curr);
        return acc;
      }, [])
      .reverse()
      .join('');
    return `${withDots}-${dv}`;
  };

  useEffect(() => {
    if (!canAccessSettings) return;
    if (canManageUsers) {
      loadUsers();
    }
    if (canManageSchools) {
      loadSchools();
    }
    if (canManageAi) {
      loadAiPolicy();
    }
  }, [canAccessSettings, canManageSchools, canManageUsers, canManageAi]);

  useEffect(() => {
    if (isGlobalAdmin && importSchoolId === '' && schools.length > 0) {
      const preferred = schools.find((s) => s.id === '13376') || schools[0];
      setImportSchoolId(preferred.id);
    }
  }, [isGlobalAdmin, importSchoolId, schools]);

  useEffect(() => {
    if (!canManageUsers) return;
    // Prefill school for admins de colegio
    if (!isGlobalAdmin && user?.schoolId) {
      setUserForm((prev) => ({
        ...prev,
        schoolId: user.schoolId,
        schoolName: user.schoolName || '',
      }));
    }
  }, [canManageUsers, isGlobalAdmin, user]);

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
        'No se pudo cargar usuarios';
      setError(msg);
    } finally {
      setLoadingUsers(false);
    }
  };

  const loadAiPolicy = async () => {
    setLoadingAi(true);
    setError('');
    setAiSuccess('');
    try {
      const res = await apiClient.getAiPolicy();
      const data = res.data;
      setAiPolicy({
        rewritePrompt: data.rewritePrompt || defaultRewritePrompt,
        moderationRules: (data.moderationRules || []).join('\n') || defaultRules,
        updatedBy: data.updatedBy || '',
        updatedAt: data.updatedAt || '',
      });
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        'No se pudo cargar la política de IA';
      setError(msg);
    } finally {
      setLoadingAi(false);
    }
  };

  const handleSaveAi = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAi(true);
    setError('');
    setAiSuccess('');
    try {
      const rulesArr = aiPolicy.moderationRules
        .split('\n')
        .map((r) => r.trim())
        .filter(Boolean);
      await apiClient.updateAiPolicy({
        rewritePrompt: aiPolicy.rewritePrompt,
        moderationRules: rulesArr,
      });
      setAiSuccess('Política de IA guardada correctamente.');
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        'No se pudo guardar la política de IA';
      setError(msg);
    } finally {
      setSavingAi(false);
    }
  };

  const handleImportStudents = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFile) {
      setImportError('Selecciona un archivo CSV.');
      return;
    }
    if (!importSchoolId) {
      setImportError('Selecciona el colegio destino.');
      return;
    }
    setImportingStudents(true);
    setImportError('');
    setImportResult(null);
    try {
      const res = await apiClient.importStudentsCsv(importFile, importSchoolId);
      setImportResult(res.data);
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        'No se pudo importar el CSV';
      setImportError(msg);
    } finally {
      setImportingStudents(false);
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
        'No se pudo cargar escuelas';
      setError(msg);
    } finally {
      setLoadingSchools(false);
    }
  };

  const handleCreateSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSchool(true);
    setError('');
    try {
      if (!schoolForm.id || !schoolForm.name) {
        setError('Completa ID y nombre de la escuela');
        setSavingSchool(false);
        return;
      }
      await apiClient.createSchool({
        id: schoolForm.id.trim(),
        name: schoolForm.name.trim(),
        currentYear: schoolForm.currentYear || undefined,
        logoUrl: schoolForm.logoUrl || undefined,
      });
      if (createLogoFile) {
        try {
          const res = await apiClient.uploadSchoolLogo(schoolForm.id.trim(), createLogoFile);
          setSchoolForm((prev) => ({ ...prev, logoUrl: res.data?.logoUrl || prev.logoUrl }));
        } catch (logoErr: any) {
          const msg =
            logoErr?.response?.data?.message ||
            logoErr?.response?.data?.error ||
            logoErr?.message ||
            'Colegio creado, pero no se pudo subir el logo';
          setError(msg);
        } finally {
          setCreateLogoFile(null);
        }
      }
      setSchoolForm({ id: '', name: '', currentYear: '', logoUrl: '' });
      await loadSchools();
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        'No se pudo crear la escuela';
      setError(msg);
    } finally {
      setSavingSchool(false);
    }
  };

  const handleUploadLogo = async () => {
    if (!editingSchool || !logoFile) return;
    setSavingSchool(true);
    setError('');
    try {
      const res = await apiClient.uploadSchoolLogo(editingSchool.id, logoFile);
      const updated = res.data;
      setEditingSchool({
        id: updated.id,
        name: updated.name,
        currentYear: updated.currentYear,
        logoUrl: updated.logoUrl,
      });
      await loadSchools();
      setLogoFile(null);
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        'No se pudo subir el logo';
      setError(msg);
    } finally {
      setSavingSchool(false);
    }
  };

  const parseCsv = (text: string) => {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return [];
    const [headerLine, ...rows] = lines;
    const headers = headerLine.split(',').map((h) => h.trim().toLowerCase());
    const idx = {
      name: headers.indexOf('name'),
      email: headers.indexOf('email'),
      role: headers.indexOf('role'),
      rut: headers.indexOf('rut'),
    };
    if (idx.name === -1 || idx.email === -1 || idx.role === -1 || idx.rut === -1) {
      throw new Error('CSV debe tener columnas: name,email,role,rut');
    }
    return rows.map((row) => {
      const cols = row.split(',').map((c) => c.trim());
      const rawRole = (cols[idx.role] || 'TEACHER').toUpperCase();
      const normalizedRole = rawRole === 'DIRECTOR' ? 'COORDINATOR' : rawRole;
      return {
        name: cols[idx.name] || '',
        email: cols[idx.email] || '',
        role: normalizedRole,
        rut: cols[idx.rut] || '',
      };
    });
  };

  const handleCsvFile = async (file: File | null) => {
    if (!file) return;
    const text = await file.text();
    try {
      const parsed = parseCsv(text);
      setCsvData(parsed);
      setCsvInfo({ fileName: file.name, rows: parsed.length });
    } catch (err: any) {
      setError(err.message || 'Error al leer CSV');
    }
  };

  const handleImportCsv = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageUsers) return;
    if (!csvData.length) {
      setError('Sube un CSV válido antes de importar');
      return;
    }
    setImportingCsv(true);
    setError('');
    try {
      const schoolId = isGlobalAdmin ? schoolForm.id || userForm.schoolId : user?.schoolId || userForm.schoolId;
      const schoolName =
        isGlobalAdmin
          ? schoolForm.name || userForm.schoolName || schools.find((s) => s.id === schoolId)?.name || ''
          : user?.schoolName || userForm.schoolName;
      if (!schoolId) {
        setError('Define el colegio (ID) para importar usuarios');
        return;
      }
      // opcional: crear colegio si no existe y admin global proporcionó datos
      if (isGlobalAdmin && schoolForm.id && schoolForm.name) {
        try {
          await apiClient.createSchool({ id: schoolForm.id, name: schoolForm.name });
          await loadSchools();
        } catch (_) {
          // puede fallar si ya existe; ignoramos
        }
      }
      for (const row of csvData) {
        if (!row.email || !row.name || !row.rut) continue;
        const normalizedRole = (row.role || '').toUpperCase() === 'DIRECTOR' ? 'COORDINATOR' : row.role || 'TEACHER';
        await apiClient.createUser({
          name: row.name,
          email: row.email,
          role: normalizedRole,
          rut: row.rut,
          schoolId,
          schoolName: schoolName || 'Colegio',
        });
      }
      await loadUsers();
      setCsvData([]);
      setCsvInfo({ fileName: '', rows: 0 });
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        'Error al importar CSV';
      setError(msg);
    } finally {
      setImportingCsv(false);
    }
  };

  const openDeleteModal = (u: UserListItem) => {
    setError('');
    setUserToDelete(u);
  };

  const handleConfirmDeleteUser = async () => {
    if (!canDeleteUsers) return;
    if (!userToDelete) return;
    setDeletingUser(true);
    setError('');
    try {
      await apiClient.deleteUser(userToDelete.id);
      await loadUsers();
      setUserToDelete(null);
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        'No se pudo eliminar el usuario';
      setError(msg);
    } finally {
      setDeletingUser(false);
    }
  };

  const filteredUsers = useMemo(() => {
    if (!userSearch.trim()) return users;
    const term = userSearch.toLowerCase();
    return users.filter(
      (u) =>
        u.name?.toLowerCase().includes(term) ||
        u.email?.toLowerCase().includes(term) ||
        u.role?.toLowerCase().includes(term) ||
        u.schoolName?.toLowerCase().includes(term) ||
        u.rut?.toLowerCase().includes(term)
    );
  }, [userSearch, users]);

  const handleCreateOrUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreateUsers && !canUpdateUsers) return;
    setSavingUser(true);
    setError('');
    try {
      const schoolId = isGlobalAdmin ? userForm.schoolId : user?.schoolId || userForm.schoolId;
      const schoolName =
        isGlobalAdmin
          ? userForm.schoolName ||
            schools.find((s) => s.id === userForm.schoolId)?.name ||
            ''
          : user?.schoolName || userForm.schoolName;

      if (!schoolId) {
        setError('Selecciona una escuela');
        return;
      }
      if (!userForm.rut) {
        setError('Ingresa el RUT');
        return;
      }

      if (editingUser) {
        await apiClient.updateUser(editingUser.id, {
          name: userForm.name,
          email: userForm.email,
          role: userForm.role,
          rut: userForm.rut,
          schoolId,
          schoolName: schoolName || 'Colegio',
        });
      } else {
        await apiClient.createUser({
          name: userForm.name,
          email: userForm.email,
          role: userForm.role,
          rut: userForm.rut,
          schoolId,
          schoolName: schoolName || 'Colegio',
        });
      }
      setUserForm({
        name: '',
        email: '',
        role: 'TEACHER',
        rut: '',
        schoolId: isGlobalAdmin ? '' : schoolId,
        schoolName: isGlobalAdmin ? '' : schoolName,
      });
      setEditingUser(null);
      await loadUsers();
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        'No se pudo crear el usuario';
      setError(msg);
    } finally {
      setSavingUser(false);
    }
  };

  if (!canAccessSettings) {
    return (
      <ProtectedLayout>
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Sin permisos</h1>
          <p className="text-gray-600">No tienes permisos para acceder a configuración.</p>
        </div>
      </ProtectedLayout>
    );
  }

  return (
    <ProtectedLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Preferencias</p>
            <h1 className="text-4xl font-bold text-gray-900">Configuración</h1>
            <p className="text-gray-600 mt-1">Gestiona la configuración de tu institución</p>
          </div>
          <Link href="/dashboard" className="text-primary hover:text-green-800 transition-colors">
            ← Volver al dashboard
          </Link>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {canManageUsers && (
            <button
              type="button"
              onClick={() => setShowUserModal(true)}
              className="group bg-white border border-gray-200 rounded-xl p-5 text-left shadow-sm hover:shadow-md transition-all flex items-start gap-3"
            >
              <div className="p-2.5 bg-primary/10 rounded-lg text-primary">
                <FiUsers size={20} />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">Usuarios y roles</h3>
                  <FiChevronRight className="text-gray-400 group-hover:text-primary" />
                </div>
                <p className="text-sm text-gray-600">Alta/baja y permisos del equipo</p>
              </div>
            </button>
          )}

          {canManageSchools && isGlobalAdmin && (
            <button
              type="button"
              onClick={() => setShowSchoolModal(true)}
              className="group bg-white border border-gray-200 rounded-xl p-5 text-left shadow-sm hover:shadow-md transition-all flex items-start gap-3"
            >
              <div className="p-2.5 bg-primary/10 rounded-lg text-primary">
                <FiHome size={20} />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">Colegios</h3>
                  <FiChevronRight className="text-gray-400 group-hover:text-primary" />
                </div>
                <p className="text-sm text-gray-600">Identidad, logos y año académico</p>
              </div>
            </button>
          )}

          {canManageUsers && (
            <button
              type="button"
              onClick={() => setShowImportUsersModal(true)}
              className="group bg-white border border-gray-200 rounded-xl p-5 text-left shadow-sm hover:shadow-md transition-all flex items-start gap-3"
            >
              <div className="p-2.5 bg-primary/10 rounded-lg text-primary">
                <FiUpload size={20} />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">Importar usuarios</h3>
                  <FiChevronRight className="text-gray-400 group-hover:text-primary" />
                </div>
                <p className="text-sm text-gray-600">Carga masiva desde CSV</p>
              </div>
            </button>
          )}

          {canImportStudents && (
            <button
              type="button"
              onClick={() => setShowImportStudentsModal(true)}
              className="group bg-white border border-gray-200 rounded-xl p-5 text-left shadow-sm hover:shadow-md transition-all flex items-start gap-3"
            >
              <div className="p-2.5 bg-primary/10 rounded-lg text-primary">
                <FiDatabase size={20} />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">Importar estudiantes</h3>
                  <FiChevronRight className="text-gray-400 group-hover:text-primary" />
                </div>
                <p className="text-sm text-gray-600">Superadmin: CSV con generación de grupos</p>
              </div>
            </button>
          )}

          {canManageAi && (
            <button
              type="button"
              onClick={() => setShowAiModal(true)}
              className="group bg-white border border-gray-200 rounded-xl p-5 text-left shadow-sm hover:shadow-md transition-all flex items-start gap-3"
            >
              <div className="p-2.5 bg-primary/10 rounded-lg text-primary">
                <FiCpu size={20} />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">Política de IA</h3>
                  <FiChevronRight className="text-gray-400 group-hover:text-primary" />
                </div>
                <p className="text-sm text-gray-600">Prompt y reglas de moderación</p>
              </div>
            </button>
          )}
        </div>
      </div>

      <Modal
        isOpen={showUserModal}
        title="Usuarios y roles"
        onClose={() => setShowUserModal(false)}
        cancelText="Cerrar"
        size="xl"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <input
                type="search"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Buscar por nombre, email o rol"
                className="w-72 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200"
              />
              <span className="text-xs text-gray-500">{filteredUsers.length} resultado(s)</span>
            </div>
            {loadingUsers && <span className="text-xs text-gray-500">Cargando usuarios...</span>}
          </div>

          {(canCreateUsers || canUpdateUsers) && (
            <form className="grid grid-cols-1 md:grid-cols-2 gap-4 border border-gray-100 rounded-lg p-4" onSubmit={handleCreateOrUpdateUser}>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                <input
                  type="text"
                  value={userForm.name}
                  onChange={(e) => setUserForm((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={userForm.email}
                  onChange={(e) => setUserForm((prev) => ({ ...prev, email: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">RUT</label>
                <input
                  type="text"
                  value={userForm.rut}
                  onChange={(e) =>
                    setUserForm((prev) => ({
                      ...prev,
                      rut: formatRut(e.target.value),
                    }))
                  }
                  placeholder="12.345.678-9"
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
                <select
                  value={userForm.role}
                  onChange={(e) => setUserForm((prev) => ({ ...prev, role: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200 bg-white"
                >
                  {availableRoles.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Colegio</label>
                {isGlobalAdmin ? (
                  <select
                    value={userForm.schoolId}
                    onChange={(e) => setUserForm((prev) => ({ ...prev, schoolId: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200 bg-white"
                  >
                    <option value="">Selecciona colegio</option>
                    {schools.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.id})
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={user?.schoolName || user?.schoolId || ''}
                    disabled
                    className="w-full px-3 py-2 border rounded-lg text-sm bg-gray-100 text-gray-600"
                  />
                )}
              </div>
              {isGlobalAdmin && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del colegio</label>
                  <input
                    type="text"
                    value={userForm.schoolName}
                    onChange={(e) => setUserForm((prev) => ({ ...prev, schoolName: e.target.value }))}
                    placeholder="Solo si el colegio no está en la lista"
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200"
                  />
                </div>
              )}
              <div className="md:col-span-2 flex items-center justify-end gap-3">
                {editingUser && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingUser(null);
                      setUserForm({
                        name: '',
                        email: '',
                        role: 'TEACHER',
                        rut: '',
                        schoolId: isGlobalAdmin ? '' : user?.schoolId || '',
                        schoolName: isGlobalAdmin ? '' : user?.schoolName || '',
                      });
                    }}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                )}
                <button
                  type="submit"
                  disabled={savingUser}
                  className="px-4 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary-dark transition-colors disabled:opacity-60"
                >
                  {savingUser ? 'Guardando...' : editingUser ? 'Actualizar usuario' : 'Crear usuario'}
                </button>
              </div>
            </form>
          )}

          <div className="border-t border-gray-200 pt-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold text-gray-900">Listado</h3>
              {loadingUsers && <span className="text-sm text-gray-500">Cargando...</span>}
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-gray-600">
                    <th className="px-3 py-2">Nombre</th>
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">RUT</th>
                    <th className="px-3 py-2">Rol</th>
                    <th className="px-3 py-2">Colegio</th>
                    <th className="px-3 py-2 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium text-gray-900">{u.name}</td>
                      <td className="px-3 py-2 text-gray-700">{u.email}</td>
                      <td className="px-3 py-2 text-gray-700">{u.rut || '—'}</td>
                      <td className="px-3 py-2 text-gray-700">{u.role}</td>
                      <td className="px-3 py-2 text-gray-700">{u.schoolName || u.schoolId}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-3">
                          {canUpdateUsers && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingUser(u);
                                setUserForm({
                                  name: u.name,
                                  email: u.email,
                                  role: u.role,
                                  rut: u.rut || '',
                                  schoolId: u.schoolId,
                                  schoolName: u.schoolName || '',
                                });
                              }}
                              className="text-xs text-primary hover:underline"
                            >
                              Editar
                            </button>
                          )}
                          {canDeleteUsers && (
                            <button
                              type="button"
                              onClick={() => openDeleteModal(u)}
                              className="text-xs text-red-600 hover:underline"
                            >
                              Eliminar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!users.length && (
                    <tr>
                      <td className="px-3 py-3 text-gray-500" colSpan={6}>
                        No hay usuarios aún.
                      </td>
                    </tr>
                  )}
                  {users.length > 0 && !filteredUsers.length && (
                    <tr>
                      <td className="px-3 py-3 text-gray-500" colSpan={6}>
                        Sin coincidencias para la búsqueda.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showSchoolModal && isGlobalAdmin}
        title="Colegios"
        onClose={() => setShowSchoolModal(false)}
        cancelText="Cerrar"
        size="xl"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">Gestiona identificadores, nombre y logos</p>
            {loadingSchools && <span className="text-xs text-gray-500">Cargando colegios...</span>}
          </div>
          <form className="grid grid-cols-1 md:grid-cols-3 gap-4 border border-gray-100 rounded-lg p-4" onSubmit={handleCreateSchool}>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ID</label>
              <input
                type="text"
                value={schoolForm.id}
                onChange={(e) => setSchoolForm((prev) => ({ ...prev, id: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200"
                placeholder="ej: school-123"
                required
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
              <input
                type="text"
                value={schoolForm.name}
                onChange={(e) => setSchoolForm((prev) => ({ ...prev, name: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Año actual (opcional)</label>
              <input
                type="text"
                value={schoolForm.currentYear}
                onChange={(e) => setSchoolForm((prev) => ({ ...prev, currentYear: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200"
                placeholder="2025"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Logo (URL)</label>
              <input
                type="text"
                value={schoolForm.logoUrl}
                onChange={(e) => setSchoolForm((prev) => ({ ...prev, logoUrl: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200"
                placeholder="https://ejemplo.com/logo.png"
              />
            </div>
            <div className="md:col-span-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Logo (imagen)</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setCreateLogoFile(e.target.files?.[0] || null)}
                className="w-full text-sm"
              />
              {createLogoFile && <p className="text-xs text-gray-600 mt-1">{createLogoFile.name}</p>}
            </div>
            <div className="md:col-span-3 flex justify-end">
              <button
                type="submit"
                disabled={savingSchool}
                className="px-4 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary-dark transition-colors disabled:opacity-60"
              >
                {savingSchool ? 'Guardando...' : 'Crear colegio'}
              </button>
            </div>
          </form>

          <div className="border-t border-gray-200 pt-3">
            <h3 className="text-md font-semibold text-gray-900 mb-2">Listado</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {schools.map((s) => (
                <div
                  key={s.id}
                  className="border border-gray-200 rounded-lg p-3 hover:shadow-sm transition-shadow flex items-center gap-3"
                >
                  {s.logoUrl ? (
                    <img src={s.logoUrl} alt={s.name} className="w-10 h-10 rounded object-cover border" />
                  ) : (
                    <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center text-sm font-semibold text-gray-700">
                      {s.name?.charAt(0) || '?'}
                    </div>
                  )}
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-900">{s.name}</p>
                    <p className="text-xs text-gray-600">{s.id}</p>
                    {s.currentYear && <p className="text-xs text-gray-500">Año: {s.currentYear}</p>}
                  </div>
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() => {
                      setEditingSchool(s);
                      setShowEditSchool(true);
                    }}
                  >
                    Editar
                  </button>
                </div>
              ))}
              {!schools.length && <div className="text-sm text-gray-500">No hay colegios registrados.</div>}
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showImportUsersModal}
        title="Importar usuarios (CSV)"
        onClose={() => setShowImportUsersModal(false)}
        cancelText="Cerrar"
        size="lg"
      >
        <form className="space-y-4" onSubmit={handleImportCsv}>
          <p className="text-sm text-gray-600">
            Cabeceras requeridas: <strong>name, email, role, rut</strong>. Los usuarios se asociarán al colegio seleccionado.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Archivo CSV</label>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => handleCsvFile(e.target.files?.[0] || null)}
                className="w-full text-sm"
              />
              {csvInfo.fileName && (
                <p className="text-xs text-gray-600 mt-1">
                  {csvInfo.fileName} • {csvInfo.rows} fila(s)
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Colegio destino</label>
              {isGlobalAdmin ? (
                <select
                  value={userForm.schoolId}
                  onChange={(e) => setUserForm((prev) => ({ ...prev, schoolId: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200 bg-white"
                >
                  <option value="">Selecciona colegio</option>
                  {schools.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.id})
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={user?.schoolName || user?.schoolId || ''}
                  disabled
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-gray-100 text-gray-600"
                />
              )}
            </div>
            {isGlobalAdmin && (
              <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del colegio (si es nuevo)</label>
                  <input
                    type="text"
                    value={userForm.schoolName}
                    onChange={(e) => {
                      const value = e.target.value;
                      setUserForm((prev) => ({ ...prev, schoolName: value }));
                      setSchoolForm((prev) => ({ ...prev, name: value }));
                    }}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200"
                    placeholder="Solo si no existe"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Crear colegio con ID</label>
                  <input
                    type="text"
                    value={schoolForm.id}
                    onChange={(e) => setSchoolForm((prev) => ({ ...prev, id: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200"
                    placeholder="Opcional"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-500">Se crearán usuarios válidos; filas vacías se omiten.</div>
            <button
              type="submit"
              disabled={importingCsv}
              className="px-4 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary-dark transition-colors disabled:opacity-60"
            >
              {importingCsv ? 'Importando...' : 'Importar usuarios'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={showImportStudentsModal}
        title="Importar estudiantes (CSV)"
        onClose={() => setShowImportStudentsModal(false)}
        cancelText="Cerrar"
        size="xl"
      >
        <form className="space-y-4" onSubmit={handleImportStudents}>
          <p className="text-sm text-gray-600">
            Encabezados esperados: Año, Curso, RUN, Genero, Nombres, Apellido Paterno, Apellido Materno, Direccion, Comuna Residencia, Email, Celular.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Colegio destino</label>
              <select
                value={importSchoolId}
                onChange={(e) => setImportSchoolId(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200"
              >
                <option value="">Selecciona colegio</option>
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.id})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Archivo CSV</label>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                className="w-full text-sm"
              />
              {importFile && <p className="text-xs text-gray-600 mt-1">{importFile.name}</p>}
            </div>
          </div>
          <div className="flex gap-3 items-center">
            <button
              type="submit"
              disabled={importingStudents}
              className={`px-4 py-2 rounded-lg text-white font-semibold ${
                importingStudents ? 'bg-primary/70' : 'bg-primary hover:bg-primary-dark'
              } transition-colors`}
            >
              {importingStudents ? 'Importando...' : 'Importar estudiantes'}
            </button>
            <Link href="/management/students" className="text-sm text-primary hover:text-green-800 underline">
              Ver estudiantes
            </Link>
          </div>
          {importError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{importError}</div>
          )}
          {importResult && (
            <div className="p-3 bg-primary/10 border border-primary/30 text-primary text-sm rounded-lg space-y-1">
              <p>
                <strong>Procesadas:</strong> {importResult.processed} • <strong>Creadas:</strong> {importResult.created} •{' '}
                <strong>Actualizadas:</strong> {importResult.updated}
              </p>
              {importResult.errors && importResult.errors.length > 0 && (
                <details className="text-amber-800">
                  <summary className="cursor-pointer">Errores ({importResult.errors.length})</summary>
                  <ul className="list-disc list-inside">
                    {importResult.errors.map((e, idx) => (
                      <li key={idx}>{e}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </form>
      </Modal>

      <Modal
        isOpen={showAiModal}
        title="Política de IA"
        onClose={() => setShowAiModal(false)}
        cancelText="Cerrar"
        size="xl"
      >
        <form className="space-y-4" onSubmit={handleSaveAi}>
          {loadingAi && <p className="text-xs text-gray-500">Cargando política...</p>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Prompt de reescritura</label>
            <textarea
              value={aiPolicy.rewritePrompt}
              onChange={(e) => setAiPolicy((p) => ({ ...p, rewritePrompt: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200 min-h-[140px]"
              placeholder={defaultRewritePrompt}
            />
            <p className="text-xs text-gray-500 mt-1">
              Placeholders: {'{tone}'}, {'{texto}'} / {'{text}'}. Se inserta automáticamente según el mensaje.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reglas de moderación</label>
            <textarea
              value={aiPolicy.moderationRules}
              onChange={(e) => setAiPolicy((p) => ({ ...p, moderationRules: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200 min-h-[120px]"
              placeholder={defaultRules}
            />
            <p className="text-xs text-gray-500 mt-1">Una regla por línea. La IA marcará como sensible si detecta estos temas.</p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-gray-500">
              {aiPolicy.updatedBy && (
                <span>
                  Última edición por {aiPolicy.updatedBy}{' '}
                  {aiPolicy.updatedAt ? `(${new Date(aiPolicy.updatedAt).toLocaleString()})` : ''}
                </span>
              )}
            </div>
            {aiSuccess && (
              <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                {aiSuccess}
              </div>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() =>
                  setAiPolicy({
                    rewritePrompt: defaultRewritePrompt,
                    moderationRules: defaultRules,
                    updatedBy: aiPolicy.updatedBy,
                    updatedAt: aiPolicy.updatedAt,
                  })
                }
                className="px-4 py-2 border border-gray-300 text-gray-800 rounded-lg text-sm hover:border-primary hover:text-primary"
              >
                Restablecer valores sugeridos
              </button>
              <button
                type="submit"
                disabled={savingAi}
                className="px-4 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary-dark transition-colors disabled:opacity-60"
              >
                {savingAi ? 'Guardando...' : 'Guardar política'}
              </button>
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={!!userToDelete}
        title="Confirmar eliminación"
        onClose={() => setUserToDelete(null)}
        onConfirm={handleConfirmDeleteUser}
        confirmText={deletingUser ? 'Eliminando...' : 'Eliminar usuario'}
      >
        <p className="text-sm text-gray-700">
          ¿Seguro que deseas eliminar al usuario{' '}
          <span className="font-semibold">{userToDelete?.name || userToDelete?.email || 'sin nombre'}</span>? Esta acción
          no se puede deshacer.
        </p>
      </Modal>

      <Modal
        isOpen={showEditSchool && !!editingSchool}
        title="Editar colegio"
        onClose={() => {
          setShowEditSchool(false);
          setEditingSchool(null);
        }}
        onConfirm={async () => {
          if (!editingSchool) return;
          setSavingSchool(true);
          setError('');
          try {
            await apiClient.updateSchool(editingSchool.id, {
              name: editingSchool.name,
              currentYear: editingSchool.currentYear,
              logoUrl: editingSchool.logoUrl,
            });
            await loadSchools();
            setShowEditSchool(false);
            setEditingSchool(null);
          } catch (err: any) {
            const msg =
              err?.response?.data?.message ||
              err?.response?.data?.error ||
              err?.message ||
              'No se pudo actualizar el colegio';
            setError(msg);
          } finally {
            setSavingSchool(false);
          }
        }}
        confirmText={savingSchool ? 'Guardando...' : 'Guardar cambios'}
      >
        {editingSchool && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
              <input
                type="text"
                value={editingSchool.name}
                onChange={(e) => setEditingSchool({ ...editingSchool, name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Año actual</label>
              <input
                type="text"
                value={editingSchool.currentYear || ''}
                onChange={(e) => setEditingSchool({ ...editingSchool, currentYear: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Logo (URL)</label>
              <input
                type="text"
                value={editingSchool.logoUrl || ''}
                onChange={(e) => setEditingSchool({ ...editingSchool, logoUrl: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Logo (archivo)</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
                className="w-full text-sm"
              />
              {logoFile && <p className="text-xs text-gray-600 mt-1">{logoFile.name}</p>}
              <button
                type="button"
                onClick={handleUploadLogo}
                disabled={savingSchool || !logoFile}
                className="mt-2 px-3 py-1.5 bg-primary text-white rounded-lg text-sm disabled:opacity-60"
              >
                {savingSchool ? 'Subiendo...' : 'Subir logo'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </ProtectedLayout>
  );
}
