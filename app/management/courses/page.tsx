'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store';
import { Layout } from '@/components/layout';
import { Card, Button } from '@/components/ui';
import { FiArrowLeft } from 'react-icons/fi';

export default function CoursesPage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    if (!user) {
      router.push('/login');
    }
  }, [user, router]);

  if (!user) {
    return null;
  }

  const courses = [
    { id: '1', name: 'Curso 1-A', level: 'Primaria', students: 30 },
    { id: '2', name: 'Curso 1-B', level: 'Primaria', students: 28 },
    { id: '3', name: 'Curso 6-A', level: 'Secundaria', students: 32 },
    { id: '4', name: 'Curso 6-B', level: 'Secundaria', students: 31 },
  ];

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            onClick={() => router.push('/dashboard')}
          >
            <FiArrowLeft size={18} />
          </Button>
          <div>
            <h1 className="text-4xl font-bold text-gray-900">Gestionar Cursos</h1>
            <p className="text-gray-600 mt-1">Administra los cursos de tu institución</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {courses.map((course) => (
            <Card key={course.id} className="p-6 cursor-pointer hover:shadow-lg transition-shadow">
              <h3 className="text-lg font-semibold text-gray-900">{course.name}</h3>
              <p className="text-sm text-gray-600 mt-1">{course.level}</p>
              <p className="text-sm text-gray-600 mt-2">
                {course.students} estudiantes
              </p>
              <Button
                variant="primary"
                size="sm"
                fullWidth
                onClick={() => console.log('Ver curso')}
              >
                Ver Detalles
              </Button>
            </Card>
          ))}
        </div>
      </div>
    </Layout>
  );
}
