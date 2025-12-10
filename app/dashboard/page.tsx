'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store';
import { Layout } from '@/components/layout';
import { Card, Button } from '@/components/ui';
import {
  FiMessageCircle,
  FiUsers,
  FiBarChart2,
  FiArrowRight,
} from 'react-icons/fi';

export default function DashboardPage() {
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

  const stats = [
    {
      label: 'Mensajes Enviados',
      value: '342',
      icon: FiMessageCircle,
      color: 'text-primary',
    },
    {
      label: 'Usuarios Activos',
      value: '1,245',
      icon: FiUsers,
      color: 'text-blue-600',
    },
    {
      label: 'Tasa de Entrega',
      value: '98.5%',
      icon: FiBarChart2,
      color: 'text-green-600',
    },
  ];

  const quickActions = [
    {
      title: 'Enviar Nuevo Mensaje',
      description: 'Crea y envía un mensaje a estudiantes, cursos o niveles',
      icon: FiMessageCircle,
      href: '/messages/new',
      color: 'bg-primary',
    },
    {
      title: 'Mis Mensajes',
      description: 'Revisa el historial de mensajes enviados',
      icon: FiBarChart2,
      href: '/messages',
      color: 'bg-blue-600',
    },
    {
      title: 'Gestionar Cursos',
      description: 'Administra cursos y estudiantes',
      icon: FiUsers,
      href: '/management/courses',
      color: 'bg-purple-600',
    },
  ];

  return (
    <Layout>
      <div className="space-y-8">
        {/* Welcome Header */}
        <div>
          <h1 className="text-4xl font-bold text-gray-900">
            ¡Bienvenido, {user.name}!
          </h1>
          <p className="text-gray-600 mt-2">
            Gestiona tu comunicación escolar por WhatsApp
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {stats.map((stat, idx) => {
            const Icon = stat.icon;
            return (
              <Card key={idx} className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-600 text-sm font-medium">
                      {stat.label}
                    </p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">
                      {stat.value}
                    </p>
                  </div>
                  <div className={`${stat.color} p-3 rounded-lg`}>
                    <Icon size={24} className="text-white" />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Quick Actions */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Acciones Rápidas
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {quickActions.map((action, idx) => {
              const Icon = action.icon;
              return (
                <Card
                  key={idx}
                  onClick={() => router.push(action.href)}
                  className="p-6 cursor-pointer group"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className={`${action.color} p-3 rounded-lg group-hover:scale-110 transition-transform`}>
                      <Icon size={24} className="text-white" />
                    </div>
                    <FiArrowRight className="text-gray-400 group-hover:text-primary transition-colors" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    {action.title}
                  </h3>
                  <p className="text-gray-600 text-sm">{action.description}</p>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Recent Messages */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-900">
              Mensajes Recientes
            </h2>
            <Button
              variant="outline"
              onClick={() => router.push('/messages')}
            >
              Ver Todos
            </Button>
          </div>
          <Card className="p-6 text-center py-12">
            <p className="text-gray-500">
              No hay mensajes aún. ¡Envía tu primer mensaje!
            </p>
            <div className="mt-4">
              <Button
                variant="primary"
                onClick={() => router.push('/messages/new')}
              >
                Enviar Mensaje
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
