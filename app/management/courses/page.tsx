'use client';

import Link from 'next/link';
import { Layout } from '@/components/layout';

export default function CoursesPage() {
  const courses = [
    { id: '1', name: 'Curso 1-A', level: 'Primaria', students: 30 },
    { id: '2', name: 'Curso 1-B', level: 'Primaria', students: 28 },
    { id: '3', name: 'Curso 6-A', level: 'Secundaria', students: 32 },
    { id: '4', name: 'Curso 6-B', level: 'Secundaria', students: 31 },
  ];

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Gestión escolar</p>
            <h1 className="text-4xl font-bold text-gray-900">Gestionar Cursos</h1>
            <p className="text-gray-600 mt-1">Administra los cursos de tu institución</p>
          </div>
          <Link
            href="/dashboard"
            className="text-primary hover:text-green-800 transition-colors"
          >
            ← Volver al dashboard
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {courses.map((course) => (
            <div key={course.id} className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
              <h3 className="text-lg font-semibold text-gray-900">{course.name}</h3>
              <p className="text-sm text-gray-600 mt-1">{course.level}</p>
              <p className="text-sm text-gray-600 mt-2">
                {course.students} estudiantes
              </p>
              <button
                onClick={() => alert('Detalles del curso: ' + course.name)}
                className="mt-4 w-full px-4 py-2 bg-primary text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
              >
                Ver Detalles
              </button>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
