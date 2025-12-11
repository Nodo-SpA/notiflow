import Link from 'next/link';
import { Layout } from '@/components/layout';

export default function MessagesPage() {
  const mockMessages = [
    {
      id: '1',
      content: 'Recordatorio: Reunión de padres el próximo viernes a las 3 PM',
      senderName: 'Usuario Demo',
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toLocaleDateString(),
      status: 'sent',
      recipients: 'Curso 6-A (30 estudiantes)',
    },
    {
      id: '2',
      content: 'No hay clases mañana - feriado nacional',
      senderName: 'Usuario Demo',
      createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toLocaleDateString(),
      status: 'sent',
      recipients: 'Todo el Colegio',
    },
    {
      id: '3',
      content: 'Evaluación de matemáticas reprogramada para el martes',
      senderName: 'Usuario Demo',
      createdAt: new Date().toLocaleDateString(),
      status: 'scheduled',
      recipients: 'Nivel Secundario (120 estudiantes)',
    },
  ];

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-sm text-gray-500">Historial</p>
            <h1 className="text-4xl font-bold text-gray-900">Mis Mensajes</h1>
            <p className="text-gray-600 mt-1">
              Historial de mensajes enviados y programados
            </p>
          </div>
          <Link
            href="/messages/new"
            className="inline-flex px-6 py-2.5 bg-primary text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
          >
            + Nuevo Mensaje
          </Link>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Mensaje</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Destinatarios</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Estado</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {mockMessages.map((message) => (
                <tr key={message.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-sm text-gray-900">
                    <p className="line-clamp-2">{message.content}</p>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {message.recipients}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                      message.status === 'sent' ? 'bg-green-100 text-green-700' :
                      message.status === 'scheduled' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {message.status === 'sent' ? 'Enviado' :
                       message.status === 'scheduled' ? 'Programado' : 'Borrador'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {message.createdAt}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
