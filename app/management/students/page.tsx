'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { FiMail, FiPhone, FiMapPin, FiHome } from 'react-icons/fi';
import { ProtectedLayout } from '@/components/layout/ProtectedLayout';
import { apiClient } from '@/lib/api-client';
import { useAuthStore, useYearStore } from '@/store';
import { Modal } from '@/components/ui';

type StudentItem = {
  id: string;
  schoolId: string;
  year?: string;
  course?: string;
  run?: string;
  gender?: string;
  firstName?: string;
  lastNameFather?: string;
  lastNameMother?: string;
  address?: string;
  commune?: string;
  email?: string;
  phone?: string;
  guardianFirstName?: string;
  guardianLastName?: string;
};

export default function StudentsPage() {
  const user = useAuthStore((state) => state.user);
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const { year } = useYearStore();
  const canManageStudents =
    hasPermission('students.create') ||
    hasPermission('students.update') ||
    hasPermission('students.delete');
  const canCreateStudents = hasPermission('students.create');
  const canUpdateStudents = hasPermission('students.update');
  const isGlobalAdmin = (user?.schoolId || '').toLowerCase() === 'global';
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [yearFilter, setYearFilter] = useState<string>(year || '');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [studentForm, setStudentForm] = useState({
    firstName: '',
    lastNameFather: '',
    lastNameMother: '',
    course: '',
    year: year || '',
    run: '',
    gender: '',
    email: '',
    phone: '',
    commune: '',
    address: '',
    guardianFirstName: '',
    guardianLastName: '',
    schoolId: isGlobalAdmin ? '' : user?.schoolId || '',
  });

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, yearFilter]);

  useEffect(() => {
    setYearFilter(year || '');
    setPage(1);
  }, [year]);

  useEffect(() => {
    if (!canManageStudents) return;
    setStudentForm((prev) => ({
      ...prev,
      schoolId: isGlobalAdmin ? prev.schoolId : user?.schoolId || prev.schoolId,
    }));
  }, [canManageStudents, isGlobalAdmin, user]);

  const loadStudents = useCallback(
    async (forcedPage?: number) => {
      if (!canManageStudents) return;
      const currentPage = forcedPage ?? page;
      setLoading(true);
      setListError('');
      try {
        const res = await apiClient.getStudents({
          year: yearFilter || undefined,
          page: currentPage,
          pageSize,
          q: debouncedQuery || undefined,
        });
        const data = res.data || {};
        setStudents(data.items || []);
        setTotal(data.total ?? (data.items?.length || 0));
      } catch (err: any) {
        const msg =
          err?.response?.data?.message ||
          err?.response?.data?.error ||
          err?.message ||
          'No se pudieron cargar los estudiantes';
        setListError(msg);
      } finally {
        setLoading(false);
      }
    },
    [canManageStudents, debouncedQuery, page, pageSize, yearFilter]
  );

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const paginated = students;

  const resetForm = () => {
    setEditingId(null);
    setStudentForm({
      firstName: '',
      lastNameFather: '',
      lastNameMother: '',
      course: '',
      year: yearFilter || year || '',
      run: '',
      gender: '',
      email: '',
      phone: '',
      commune: '',
      address: '',
      guardianFirstName: '',
      guardianLastName: '',
      schoolId: isGlobalAdmin ? '' : user?.schoolId || '',
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreateStudents && !canUpdateStudents) return;
    setSaving(true);
    setFormError('');
    setSuccess('');
    try {
      const payload = {
        ...studentForm,
        year: studentForm.year || yearFilter || year || undefined,
        schoolId: isGlobalAdmin ? studentForm.schoolId || undefined : user?.schoolId,
      };
      if (editingId) {
        await apiClient.updateStudent(editingId, payload);
        setSuccess('Estudiante actualizado correctamente');
      } else {
        await apiClient.createStudent(payload);
        setSuccess('Estudiante creado correctamente');
        setPage(1);
      }
      resetForm();
      await loadStudents(editingId ? undefined : 1);
      setShowForm(false);
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        'No se pudo guardar el estudiante';
      setFormError(msg);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (s: StudentItem) => {
    setEditingId(s.id);
    setSuccess('');
    setFormError('');
    setShowForm(true);
    setStudentForm({
      firstName: s.firstName || '',
      lastNameFather: s.lastNameFather || '',
      lastNameMother: s.lastNameMother || '',
      course: s.course || '',
      year: s.year || yearFilter || year || '',
      run: s.run || '',
      gender: s.gender || '',
      email: s.email || '',
      phone: s.phone || '',
      commune: s.commune || '',
      address: s.address || '',
      guardianFirstName: s.guardianFirstName || '',
      guardianLastName: s.guardianLastName || '',
      schoolId: isGlobalAdmin ? s.schoolId || '' : user?.schoolId || '',
    });
  };

  if (!canManageStudents) {
    return (
      <ProtectedLayout>
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Sin permisos</h1>
          <p className="text-gray-600">
            No tienes permisos para gestionar estudiantes y apoderados.
          </p>
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
            <h1 className="text-4xl font-bold text-gray-900">Estudiantes</h1>
            <p className="text-gray-600 mt-1">Base de estudiantes activa del colegio</p>
          </div>
          <Link href="/dashboard" className="text-primary hover:text-green-800 transition-colors">
            ← Volver al dashboard
          </Link>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Listado</h2>
                <p className="text-sm text-gray-600">
                  Mostrando {paginated.length} de {total} estudiantes
                </p>
              </div>
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nombre, curso o email..."
                className="w-full sm:w-80 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200"
              />
              {canCreateStudents && (
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setShowForm(true);
                  }}
                  className="px-4 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary-dark transition-colors"
                >
                  + Nuevo estudiante
                </button>
              )}
            </div>
          </div>

          {loading && <p className="text-sm text-gray-500">Cargando estudiantes...</p>}
          {listError && <p className="text-sm text-red-600">{listError}</p>}

          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="min-w-full">
              <thead className="bg-gray-50 text-left text-sm text-gray-600">
                <tr>
                  <th className="px-4 py-3">Estudiante</th>
                  <th className="px-4 py-3">Curso</th>
                  <th className="px-4 py-3">Año</th>
                  <th className="px-4 py-3">RUN</th>
                  <th className="px-4 py-3">Apoderado</th>
                  <th className="px-4 py-3">Contacto</th>
                  {canUpdateStudents && <th className="px-4 py-3">Acciones</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 text-sm">
                {paginated.map((s: StudentItem) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900 font-medium">
                      {`${s.firstName || ''} ${s.lastNameFather || ''} ${s.lastNameMother || ''}`.trim() || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{s.course || '—'}</td>
                    <td className="px-4 py-3 text-gray-700">{s.year || '—'}</td>
                    <td className="px-4 py-3 text-gray-700">{s.run || '—'}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {`${s.guardianFirstName || ''} ${s.guardianLastName || ''}`.trim() || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <FiMail className="text-gray-400" />
                          <span className="truncate">{s.email || 'Sin correo'}</span>
                        </div>
                        {s.phone ? (
                          <div className="flex items-center gap-2 text-sm">
                            <FiPhone className="text-gray-400" />
                            <span>{s.phone}</span>
                          </div>
                        ) : null}
                        {s.commune ? (
                          <div className="flex items-center gap-2 text-sm">
                            <FiMapPin className="text-gray-400" />
                            <span>{s.commune}</span>
                          </div>
                        ) : null}
                        {s.address ? (
                          <div className="flex items-center gap-2 text-sm">
                            <FiHome className="text-gray-400" />
                            <span className="truncate">{s.address}</span>
                          </div>
                        ) : null}
                      </div>
                    </td>
                    {canUpdateStudents && (
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => startEdit(s)}
                          className="text-sm text-primary hover:text-green-800"
                        >
                          Editar
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {!paginated.length && (
                  <tr>
                    <td className="px-4 py-3 text-gray-500" colSpan={canUpdateStudents ? 7 : 6}>
                      No se encontraron estudiantes con ese criterio.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
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
        isOpen={showForm}
        onClose={() => {
          setShowForm(false);
          resetForm();
        }}
        title={editingId ? 'Editar estudiante' : 'Nuevo estudiante'}
        size="xl"
      >
        <form className="grid grid-cols-1 md:grid-cols-2 gap-3" onSubmit={handleSubmit}>
          {formError && (
            <div className="md:col-span-2 p-3 bg-red-100 border border-red-300 rounded text-red-700 text-sm">
              {formError}
            </div>
          )}
          {success && (
            <div className="md:col-span-2 p-3 bg-green-50 border border-green-200 rounded text-green-700 text-sm">
              {success}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombres</label>
            <input
              type="text"
              value={studentForm.firstName}
              onChange={(e) => setStudentForm((prev) => ({ ...prev, firstName: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Apellido paterno</label>
            <input
              type="text"
              value={studentForm.lastNameFather}
              onChange={(e) => setStudentForm((prev) => ({ ...prev, lastNameFather: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Apellido materno</label>
            <input
              type="text"
              value={studentForm.lastNameMother}
              onChange={(e) => setStudentForm((prev) => ({ ...prev, lastNameMother: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Curso</label>
            <input
              type="text"
              value={studentForm.course}
              onChange={(e) => setStudentForm((prev) => ({ ...prev, course: e.target.value }))}
              placeholder="Ej: 4B"
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Año</label>
            <input
              type="text"
              value={studentForm.year}
              onChange={(e) => setStudentForm((prev) => ({ ...prev, year: e.target.value }))}
              placeholder="Ej: 2025"
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">RUN</label>
            <input
              type="text"
              value={studentForm.run}
              onChange={(e) => setStudentForm((prev) => ({ ...prev, run: e.target.value }))}
              placeholder="11.111.111-1"
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Género</label>
            <input
              type="text"
              value={studentForm.gender}
              onChange={(e) => setStudentForm((prev) => ({ ...prev, gender: e.target.value }))}
              placeholder="Opcional"
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={studentForm.email}
              onChange={(e) => setStudentForm((prev) => ({ ...prev, email: e.target.value }))}
              placeholder="correo@colegio.cl"
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
            <input
              type="text"
              value={studentForm.phone}
              onChange={(e) => setStudentForm((prev) => ({ ...prev, phone: e.target.value }))}
              placeholder="+56 9 1234 5678"
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Comuna</label>
            <input
              type="text"
              value={studentForm.commune}
              onChange={(e) => setStudentForm((prev) => ({ ...prev, commune: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
            <input
              type="text"
              value={studentForm.address}
              onChange={(e) => setStudentForm((prev) => ({ ...prev, address: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Apoderado (nombre)</label>
            <input
              type="text"
              value={studentForm.guardianFirstName}
              onChange={(e) => setStudentForm((prev) => ({ ...prev, guardianFirstName: e.target.value }))}
              placeholder="Nombre apoderado"
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Apoderado (apellido)</label>
            <input
              type="text"
              value={studentForm.guardianLastName}
              onChange={(e) => setStudentForm((prev) => ({ ...prev, guardianLastName: e.target.value }))}
              placeholder="Apellido apoderado"
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200"
            />
          </div>
          {isGlobalAdmin && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Colegio (ID)</label>
              <input
                type="text"
                value={studentForm.schoolId}
                onChange={(e) => setStudentForm((prev) => ({ ...prev, schoolId: e.target.value }))}
                placeholder="ID de colegio"
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200"
              />
            </div>
          )}
          <div className="md:col-span-2 flex justify-end gap-3">
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                disabled={saving}
              >
                Cancelar edición
              </button>
            )}
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary-dark transition-colors disabled:opacity-60"
            >
              {saving ? 'Guardando...' : editingId ? 'Actualizar estudiante' : 'Crear estudiante'}
            </button>
          </div>
        </form>
      </Modal>
    </ProtectedLayout>
  );
}
