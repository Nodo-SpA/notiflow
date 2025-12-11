import Link from 'next/link';
import { Layout } from '@/components/layout';

export default function ReportsPage() {
  const kpis = [
    {
      title: 'Mensajes enviados (semana)',
      value: '482',
      delta: '+12% vs. anterior',
      tone: 'text-green-700 bg-green-50',
    },
    {
      title: 'Tasa de entrega',
      value: '98.7%',
      delta: '+0.4pp',
      tone: 'text-green-700 bg-green-50',
    },
    {
      title: 'Programados próximos 24h',
      value: '36',
      delta: 'Listos para salir',
      tone: 'text-blue-700 bg-blue-50',
    },
    {
      title: 'Alcance estimado',
      value: '3.2k',
      delta: 'Estudiantes/notificaciones',
      tone: 'text-gray-700 bg-gray-100',
    },
  ];

  const campaigns = [
    {
      name: 'Aviso de pagos',
      sent: 180,
      delivered: '98%',
      date: '12/01',
      status: 'Completado',
    },
    {
      name: 'Reunión de padres',
      sent: 220,
      delivered: '99%',
      date: '10/01',
      status: 'Completado',
    },
    {
      name: 'Recordatorio evaluaciones',
      sent: 140,
      delivered: '97%',
      date: '08/01',
      status: 'En curso',
    },
  ];

  const performance = [
    { label: 'Cursos (promedio entrega)', value: '99.1%' },
    { label: 'Niveles (entrega)', value: '98.5%' },
    { label: 'Jornadas (entrega)', value: '97.8%' },
  ];

  const weeklySends = [
    { label: 'Semana 1', value: 430 },
    { label: 'Semana 2', value: 515 },
    { label: 'Semana 3', value: 498 },
    { label: 'Semana 4', value: 562 },
  ];

  const maxWeeklySend = Math.max(...weeklySends.map((w) => w.value));

  return (
    <Layout>
      <div className="space-y-8">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-sm text-gray-500">Analítica</p>
            <h1 className="text-4xl font-bold text-gray-900">Reportes</h1>
            <p className="text-gray-600 mt-1">Visibilidad de envíos y entregas de mensajes informativos</p>
          </div>
          <Link
            href="/messages/new"
            className="inline-flex items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-white font-medium hover:bg-green-700 transition-colors"
          >
            + Crear campaña
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map((item) => (
            <div key={item.title} className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
              <p className="text-sm text-gray-600">{item.title}</p>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-bold text-gray-900">{item.value}</span>
                <span className={`text-xs font-medium px-2 py-1 rounded-full ${item.tone}`}>
                  {item.delta}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-5">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Mensajes enviados (últimas 4 semanas)</h2>
              <p className="text-sm text-gray-600">Tendencia semanal de envíos</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">Máximo semanal</p>
              <p className="text-xl font-bold text-gray-900">{maxWeeklySend}</p>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-4 items-end">
            {weeklySends.map((week) => (
              <div key={week.label} className="flex flex-col items-center gap-2">
                <div className="w-full h-36 bg-gray-100 rounded-lg flex items-end overflow-hidden">
                  <div
                    className="w-full bg-primary rounded-lg transition-all"
                    style={{ height: `${(week.value / maxWeeklySend) * 100}%` }}
                  />
                </div>
                <div className="text-center space-y-0.5">
                  <p className="text-sm font-semibold text-gray-900">{week.value}</p>
                  <p className="text-xs text-gray-500">{week.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white border border-gray-200 rounded-lg shadow-sm">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Campañas recientes</h2>
              <span className="text-sm text-gray-500">Últimos 7 días</span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50 text-left text-sm text-gray-600">
                  <tr>
                    <th className="px-4 py-3">Campaña</th>
                    <th className="px-4 py-3">Enviados</th>
                    <th className="px-4 py-3">Entregados</th>
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 text-sm">
                  {campaigns.map((c) => (
                    <tr key={c.name} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-900 font-medium">{c.name}</td>
                      <td className="px-4 py-3 text-gray-700">{c.sent}</td>
                      <td className="px-4 py-3 text-gray-700">{c.delivered}</td>
                      <td className="px-4 py-3 text-gray-500">{c.date}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${
                            c.status === 'En curso'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-green-100 text-green-700'
                          }`}
                        >
                          {c.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-5 space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Rendimiento por segmento</h2>
              <p className="text-sm text-gray-600">Entrega por grupo</p>
            </div>
            <div className="space-y-4">
              {performance.map((item) => (
                <div key={item.label} className="border border-gray-100 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-gray-700">{item.label}</p>
                    <span className="text-sm font-semibold text-gray-900">{item.value}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary"
                      style={{ width: item.value.replace('%', '') + '%' }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span className="w-3 h-3 rounded-full bg-primary" />
              Entrega promedio por segmento
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Exportar reportes</h3>
            <p className="text-sm text-gray-600">Descarga un CSV con entregas filtradas por rango.</p>
          </div>
          <div className="flex gap-3 flex-wrap">
            <button className="px-4 py-2 bg-primary text-white rounded-lg font-medium hover:bg-green-700 transition-colors">
              Exportar CSV
            </button>
            <Link
              href="/messages"
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
            >
              Ir a mensajes
            </Link>
          </div>
        </div>
      </div>
    </Layout>
  );
}
