'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ProtectedLayout } from '@/components/layout/ProtectedLayout';

const mockStudents = [
  { id: 's1', name: 'Ana Torres', course: '1-A', level: 'Primaria', email: 'ana.torres@colegio.com', phone: '+56911111111' },
  { id: 's2', name: 'Diego Pérez', course: '1-B', level: 'Primaria', email: 'diego.perez@colegio.com', phone: '+56922222222' },
  { id: 's3', name: 'Lucía Fuentes', course: '6-A', level: 'Secundaria', email: 'lucia.fuentes@colegio.com', phone: '+56933333333' },
  { id: 's4', name: 'Mateo Silva', course: '6-B', level: 'Secundaria', email: 'mateo.silva@colegio.com', phone: '+56944444444' },
  { id: 's5', name: 'Sofía Rojas', course: '4-A', level: 'Secundaria', email: 'sofia.rojas@colegio.com', phone: '+56955555555' },
  { id: 's6', name: 'Camila Díaz', course: '4-A', level: 'Secundaria', email: 'camila.diaz@colegio.com', phone: '+56966666666' },
  { id: 's7', name: 'Javier Muñoz', course: '2-A', level: 'Primaria', email: 'javier.munoz@colegio.com', phone: '+56977777777' },
  { id: 's8', name: 'Valentina Reyes', course: '3-B', level: 'Primaria', email: 'valentina.reyes@colegio.com', phone: '+56988888888' },
];

export default function LevelsPage() {
  const levels = useMemo(
    () => Array.from(new Set(mockStudents.map((s) => s.level))),
    []
  );
  const [selectedLevel, setSelectedLevel] = useState<string>('all');

  const filtered = useMemo(() => {
    if (selectedLevel === 'all') return mockStudents;
    return mockStudents.filter((s) => s.level === selectedLevel);
  }, [selectedLevel]);

  return (
    <ProtectedLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Gestión escolar</p>
            <h1 className="text-4xl font-bold text-gray-900">Niveles</h1>
            <p className="text-gray-600 mt-1">Lista mock de estudiantes por nivel</p>
          </div>
          <Link href="/dashboard" className="text-primary hover:text-green-800 transition-colors">
            ← Volver al dashboard
          </Link>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Estudiantes por nivel</h2>
              <p className="text-sm text-gray-600">Mostrando {filtered.length} estudiantes</p>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Nivel:</label>
              <select
                value={selectedLevel}
                onChange={(e) => setSelectedLevel(e.target.value)}
                className="px-3 py-2 border rounded-lg text-sm bg-white"
              >
                <option value="all">Todos</option>
                {levels.map((lvl) => (
                  <option key={lvl} value={lvl}>
                    {lvl}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="min-w-full">
              <thead className="bg-gray-50 text-left text-sm text-gray-600">
                <tr>
                  <th className="px-4 py-3">Estudiante</th>
                  <th className="px-4 py-3">Curso</th>
                  <th className="px-4 py-3">Nivel</th>
                  <th className="px-4 py-3">Contacto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 text-sm">
                {filtered.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900 font-medium">{s.name}</td>
                    <td className="px-4 py-3 text-gray-700">Curso {s.course}</td>
                    <td className="px-4 py-3 text-gray-700">{s.level}</td>
                    <td className="px-4 py-3 text-gray-500">
                      <div className="flex flex-col">
                        <span>{s.email}</span>
                        <span>{s.phone}</span>
                      </div>
                    </td>
                  </tr>
                ))}
                {!filtered.length && (
                  <tr>
                    <td className="px-4 py-3 text-gray-500" colSpan={4}>
                      No hay estudiantes en este nivel.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </ProtectedLayout>
  );
}
