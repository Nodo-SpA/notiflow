import Link from 'next/link';
import { Layout } from '@/components/layout';

export default function DashboardPage() {
  const stats = [
    {
      label: 'Mensajes Enviados',
      value: '342',
    },
    {
      label: 'Usuarios Activos',
      value: '1,245',
    },
    {
      label: 'Tasa de Entrega',
      value: '98.5%',
    },
  ];

  const quickActions = [
    {
      title: 'Enviar Nuevo Mensaje',
      description: 'Crea y envía un mensaje a estudiantes, cursos o niveles',
      href: '/messages/new',
      color: 'bg-primary',
    },
    {
      title: 'Mis Mensajes',
      description: 'Revisa el historial de mensajes enviados',
      href: '/messages',
      color: 'bg-blue-600',
    },
    {
      title: 'Gestionar Cursos',
      description: 'Administra cursos y estudiantes',
      href: '/management/courses',
      color: 'bg-purple-600',
    },
  ];

  return (
    <Layout>
      <div className="space-y-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-gray-500">Panel general</p>
            <h1 className="text-4xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-gray-600 mt-1">
              Gestiona tu comunicación escolar por WhatsApp
            </p>
          </div>
          <Link
            href="/messages/new"
            className="inline-flex items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-white font-medium hover:bg-green-700 transition-colors"
          >
            + Enviar mensaje
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {stats.map((stat, idx) => (
            <div key={idx} className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
              <p className="text-gray-600 text-sm font-medium">{stat.label}</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{stat.value}</p>
            </div>
          ))}
        </div>

        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-900">Acciones Rápidas</h2>
            <Link
              href="/messages"
              className="text-primary hover:text-green-800 transition-colors text-sm"
            >
              Ver historial
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {quickActions.map((action, idx) => (
              <Link
                key={idx}
                href={action.href}
                className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className={`${action.color} p-3 rounded-lg`}>
                    <div className="w-6 h-6 text-white">→</div>
                  </div>
                  <div className="text-gray-400 group-hover:text-primary transition-colors">→</div>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {action.title}
                </h3>
                <p className="text-gray-600 text-sm">{action.description}</p>
              </Link>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-900">Mensajes Recientes</h2>
            <Link
              href="/messages/new"
              className="px-4 py-2 text-primary border border-primary rounded-lg hover:bg-blue-50 transition-colors"
            >
              Enviar mensaje
            </Link>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-6 text-center py-12 shadow-sm">
            <p className="text-gray-500">
              No hay mensajes aún. ¡Envía tu primer mensaje!
            </p>
            <div className="mt-4">
              <Link
                href="/messages/new"
                className="inline-block px-6 py-2.5 bg-primary text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
              >
                Redactar mensaje
              </Link>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
