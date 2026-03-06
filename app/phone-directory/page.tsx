'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { FiPhone, FiPhoneCall, FiSearch } from 'react-icons/fi';
import { ProtectedLayout } from '@/components/layout/ProtectedLayout';
import { apiClient } from '@/lib/api-client';
import { useAuthStore, useYearStore } from '@/store';

type GuardianItem = {
  name?: string;
  email?: string;
  phone?: string;
};

type DirectoryItem = {
  studentId: string;
  schoolId: string;
  year?: string;
  course?: string;
  run?: string;
  studentName?: string;
  studentPhone?: string;
  guardians?: GuardianItem[];
};

export default function PhoneDirectoryPage() {
  const user = useAuthStore((state) => state.user);
  const role = (user?.role || '').toUpperCase();
  const { year } = useYearStore();
  const canSeeDirectory =
    role === 'SUPERADMIN' ||
    role === 'ADMIN' ||
    role === 'COORDINATOR' ||
    role === 'GESTION_ESCOLAR' ||
    role === 'DIRECTOR' ||
    role === 'TEACHER';
  const isGlobalAdmin = (user?.schoolId || '').toLowerCase() === 'global' || role === 'SUPERADMIN';

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [schoolFilter, setSchoolFilter] = useState('');
  const [yearFilter, setYearFilter] = useState<string>(year || '');
  const [items, setItems] = useState<DirectoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    setYearFilter(year || '');
    setPage(1);
  }, [year]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, schoolFilter, yearFilter]);

  const loadDirectory = useCallback(
    async (forcedPage?: number) => {
      if (!canSeeDirectory) return;
      const currentPage = forcedPage ?? page;
      setLoading(true);
      setError('');
      try {
        const res = await apiClient.getPhoneDirectory({
          page: currentPage,
          pageSize,
          q: debouncedQuery || undefined,
          year: yearFilter || undefined,
          schoolId: isGlobalAdmin ? schoolFilter.trim() || undefined : undefined,
        });
        const data = res?.data || {};
        setItems(data.items || []);
        setTotal(data.total ?? (data.items?.length || 0));
      } catch (err: any) {
        const msg =
          err?.response?.data?.message ||
          err?.response?.data?.error ||
          err?.message ||
          'No se pudo cargar el directorio telefónico';
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [canSeeDirectory, page, pageSize, debouncedQuery, yearFilter, isGlobalAdmin, schoolFilter]
  );

  useEffect(() => {
    loadDirectory();
  }, [loadDirectory]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const formatPhoneHref = (value: string) => value.replace(/\s+/g, '');
  const isStudentPhone = (label: string) => (label || '').trim().toLowerCase() === 'alumno';

  const rows = useMemo(
    () =>
      items.map((item) => {
        const guardians = item.guardians || [];
        const guardianPhones = guardians
          .map((g) => ({
            label: (g.name || 'Apoderado').trim() || 'Apoderado',
            phone: (g.phone || '').trim(),
          }))
          .filter((g) => g.phone);

        const phones = [...guardianPhones];
        const studentPhone = (item.studentPhone || '').trim();
        if (studentPhone) {
          phones.push({ label: 'Alumno', phone: studentPhone });
        }

        return {
          ...item,
          phones,
        };
      }),
    [items]
  );

  if (!canSeeDirectory) {
    return (
      <ProtectedLayout>
        <div className="glass-panel rounded-2xl p-6 soft-shadow">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Sin permisos</h1>
          <p className="text-gray-600">
            No tienes permisos para ver el directorio telefónico.
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
            <p className="text-sm text-gray-500">Comunicaciones</p>
            <h1 className="text-4xl font-bold text-gray-900">Directorio Telefónico</h1>
            <p className="text-gray-600 mt-1">Busca alumnos y obtén teléfonos de contacto de sus apoderados.</p>
          </div>
          <Link href="/dashboard" className="text-primary hover:text-green-800 transition-colors">
            ← Volver al dashboard
          </Link>
        </div>

        <div className="glass-panel rounded-2xl soft-shadow p-6 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Listado</h2>
              <p className="text-sm text-gray-600">Mostrando {rows.length} de {total} registros</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
              <div className="relative w-full sm:w-80">
                <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar por alumno, curso o teléfono..."
                  className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200"
                />
              </div>
              {isGlobalAdmin && (
                <input
                  type="text"
                  value={schoolFilter}
                  onChange={(e) => setSchoolFilter(e.target.value)}
                  placeholder="Filtrar por schoolId"
                  className="w-full sm:w-60 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200"
                />
              )}
            </div>
          </div>

          {loading && <p className="text-sm text-gray-500">Cargando directorio...</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="min-w-full">
              <thead className="bg-gray-50 text-left text-sm text-gray-600">
                <tr>
                  <th className="px-4 py-3">Alumno</th>
                  <th className="px-4 py-3">Curso</th>
                  <th className="px-4 py-3">Teléfonos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 text-sm">
                {rows.map((item) => (
                  <tr key={item.studentId} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900 font-medium">
                      {item.studentName || '—'}
                      {isGlobalAdmin && item.schoolId ? (
                        <p className="text-xs text-gray-500 mt-1">Colegio: {item.schoolId}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{item.course || '—'}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {item.phones.length ? (
                        <div className="space-y-2">
                          {item.phones.map((p, idx) => (
                            <div
                              key={`${item.studentId}-${p.phone}-${idx}`}
                              className="group flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm transition-all hover:border-primary/40 hover:shadow"
                            >
                              <div className="min-w-0">
                                <span
                                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                                    isStudentPhone(p.label)
                                      ? 'bg-primary/10 text-primary'
                                      : 'bg-amber-100 text-amber-700'
                                  }`}
                                >
                                  {p.label}
                                </span>
                                <div className="mt-1 flex items-center gap-2">
                                  <FiPhone className="text-gray-400 shrink-0" />
                                  <span className="font-semibold text-gray-800 tracking-wide">{p.phone}</span>
                                </div>
                              </div>
                              <a
                                href={`tel:${formatPhoneHref(p.phone)}`}
                                className="shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-white"
                                title={`Llamar a ${p.label}`}
                                aria-label={`Llamar a ${p.label}`}
                              >
                                <FiPhoneCall size={16} />
                              </a>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-500">Sin teléfonos</span>
                      )}
                    </td>
                  </tr>
                ))}
                {!rows.length && !loading && (
                  <tr>
                    <td className="px-4 py-3 text-gray-500" colSpan={3}>
                      No se encontraron resultados para este criterio.
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
    </ProtectedLayout>
  );
}
