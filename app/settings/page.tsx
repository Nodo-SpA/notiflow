import Link from 'next/link';
import { Layout } from '@/components/layout';

export default function SettingsPage() {
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
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Preferencias</p>
            <h1 className="text-4xl font-bold text-gray-900">Configuración</h1>
            <p className="text-gray-600 mt-1">Gestiona la configuración de tu institución</p>
          </div>
          <Link
            href="/dashboard"
            className="text-primary hover:text-green-800 transition-colors"
          >
            ← Volver al dashboard
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {settingsSections.map((section, idx) => (
            <div key={idx} className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="text-4xl mb-3">{section.icon}</div>
              <h3 className="text-lg font-semibold text-gray-900">
                {section.title}
              </h3>
              <p className="text-sm text-gray-600 mt-2">{section.description}</p>
              <button
                disabled
                className="mt-4 w-full px-4 py-2 bg-gray-300 text-gray-500 rounded-lg font-medium cursor-not-allowed"
              >
                En desarrollo
              </button>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
