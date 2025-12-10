'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store';
import { Layout } from '@/components/layout';
import { Card, Button } from '@/components/ui';
import { FiArrowLeft, FiSettings } from 'react-icons/fi';

export default function SettingsPage() {
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

  const settingsSections = [
    {
      title: 'Configuración de Escuela',
      description: 'Datos de tu institución y configuración general',
      icon: '🏫',
    },
    {
      title: 'API WhatsApp',
      description: 'Configurar integración con WhatsApp Business API',
      icon: '💬',
    },
    {
      title: 'Usuarios y Roles',
      description: 'Gestiona usuarios y permisos en el sistema',
      icon: '👥',
    },
    {
      title: 'Plantillas de Mensajes',
      description: 'Crea plantillas reutilizables para tus mensajes',
      icon: '📝',
    },
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
            <h1 className="text-4xl font-bold text-gray-900">Configuración</h1>
            <p className="text-gray-600 mt-1">Gestiona la configuración de tu institución</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {settingsSections.map((section, idx) => (
            <Card key={idx} className="p-6 cursor-pointer hover:shadow-lg transition-shadow">
              <div className="text-4xl mb-3">{section.icon}</div>
              <h3 className="text-lg font-semibold text-gray-900">
                {section.title}
              </h3>
              <p className="text-sm text-gray-600 mt-2">{section.description}</p>
              <Button
                variant="primary"
                size="sm"
                fullWidth
                onClick={() => console.log('Abrir configuración')}
              >
                <FiSettings size={16} />
                Configurar
              </Button>
            </Card>
          ))}
        </div>
      </div>
    </Layout>
  );
}
