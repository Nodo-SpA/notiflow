'use client';

import Link from 'next/link';
import { ProtectedLayout } from '@/components/layout/ProtectedLayout';
import { useMemo, useState } from 'react';

export default function CoursesPage() {
  const students = [
    { id: 's1', name: 'Ana Torres', course: '1-A', level: 'Primaria', email: 'ana.torres@colegio.com', phone: '+56911111111' },
    { id: 's2', name: 'Diego Pérez', course: '1-B', level: 'Primaria', email: 'diego.perez@colegio.com', phone: '+56922222222' },
    { id: 's3', name: 'Lucía Fuentes', course: '6-A', level: 'Secundaria', email: 'lucia.fuentes@colegio.com', phone: '+56933333333' },
    { id: 's4', name: 'Mateo Silva', course: '6-B', level: 'Secundaria', email: 'mateo.silva@colegio.com', phone: '+56944444444' },
    { id: 's5', name: 'Sofía Rojas', course: '4-A', level: 'Secundaria', email: 'sofia.rojas@colegio.com', phone: '+56955555555' },
    { id: 's6', name: 'Camila Díaz', course: '4-A', level: 'Secundaria', email: 'camila.diaz@colegio.com', phone: '+56966666666' },
  ];

  const courses = useMemo(
    () =>
      Array.from(new Set(students.map((s) => s.course))).map((c) => ({
        id: c,
        name: `Curso ${c}`,
        students: students.filter((s) => s.course === c).length,
      })),
    [students]
  );

  const [selectedCourse, setSelectedCourse] = useState<string>('all');

  const filteredStudents = useMemo(() => {
    if (selectedCourse === 'all') return students;
    return students.filter((s) => s.course === selectedCourse);
  }, [students, selectedCourse]);

  return (
    <ProtectedLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Gestión escolar</p>
            <h1 className="text-4xl font-bold text-gray-900">Gestionar Cursos</h1>
            <p className="text-gray-600 mt-1">Administra cursos y visualiza sus estudiantes</p>
          </div>
          <Link
            href="/dashboard"
            className="text-primary hover:text-green-800 transition-colors"
          >
            ← Volver al dashboard
          </Link>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Cursos</h2>
              <p className="text-sm text-gray-600">Lista de estudiantes por curso (mock)</p>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Filtrar:</label>
              <select
                value={selectedCourse}
                onChange={(e) => setSelectedCourse(e.target.value)}
                className="px-3 py-2 border rounded-lg text-sm bg-white"
              >
                <option value="all">Todos los cursos</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.students})
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
                {filteredStudents.map((s) => (
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
                {!filteredStudents.length && (
                  <tr>
                    <td className="px-4 py-3 text-gray-500" colSpan={4}>
                      No hay estudiantes en este curso.
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
