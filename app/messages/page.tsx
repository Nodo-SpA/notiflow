'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ProtectedLayout } from '@/components/layout/ProtectedLayout';
import { Modal } from '@/components/ui';
import { apiClient } from '@/lib/api-client';
import { useAuthStore, useYearStore } from '@/store';

type MessageItem = {
  id: string;
  content: string;
  senderName: string;
  senderEmail?: string;
  recipients: string[];
  channels?: string[];
  emailStatus?: string;
  appStatus?: string;
  appReadBy?: string[];
  appStatuses?: Record<string, string>;
  status: string;
  createdAt: string;
  scheduledAt?: string;
  attachments?: { fileName: string; mimeType?: string; downloadUrl?: string; inline?: boolean }[];
  reason?: string;
  schoolLogo?: string;
  schoolLogoUrl?: string;
  schoolName?: string;
  school?: string;
};

const senderDisplayName = (name?: string, email?: string) => {
  const cleanName = (name || '').trim();
  const cleanEmail = (email || '').trim();
  const emailLocal = cleanEmail ? (cleanEmail.split('@')[0] || cleanEmail) : '';
  // Si el nombre es igual al correo, usamos el local-part formateado
  if (cleanName && cleanEmail && cleanName.toLowerCase() !== cleanEmail.toLowerCase()) {
    return cleanName;
  }
  if (cleanName && cleanEmail && cleanName.toLowerCase() === cleanEmail.toLowerCase()) {
    return formatLocalPart(emailLocal);
  }
  if (cleanName) return cleanName;
  if (emailLocal) return formatLocalPart(emailLocal);
  return '—';
};

const formatLocalPart = (local: string) => {
  if (!local) return '';
  const words = local.replace(/[\.\-_]+/g, ' ').split(' ').filter(Boolean);
  if (!words.length) return local;
  return words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
};

const renderRichText = (text?: string) => {
  if (!text) return null;
  const regex = /(\*\*[^*]+\*\*|https?:\/\/\S+)/gi;
  const parts = text.split(regex);
  return parts.map((part, idx) => {
    if (!part) return null;
    const isUrl = /^https?:\/\//i.test(part);
    const isBold = /^\*\*.+\*\*$/.test(part);
    if (isUrl) {
      return (
        <a
          key={`url-${idx}`}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline break-all"
        >
          {part}
        </a>
      );
    }
    if (isBold) {
      const cleaned = part.replace(/^\*\*/, '').replace(/\*\*$/, '');
      return (
        <strong key={`bold-${idx}`} className="font-semibold">
          {cleaned}
        </strong>
      );
    }
    return <span key={`text-${idx}`}>{part}</span>;
  });
};

const statusLabel = (status?: string) => {
  const s = (status || '').toLowerCase();
  switch (s) {
    case 'sent':
    case 'delivered':
      return 'Enviado';
    case 'failed':
      return 'Falló';
    case 'pending':
      return 'Pendiente';
    case 'read':
      return 'Leído';
    case 'scheduled':
      return 'Programado';
    case 'draft':
      return 'Borrador';
    default:
      return status || '—';
  }
};

const statusIcon = (status?: string) => {
  const s = (status || '').toLowerCase();
  if (s === 'sent' || s === 'delivered') {
    return '✔';
  }
  if (s === 'read') {
    return '✔✔';
  }
  return '';
};

export default function MessagesPage() {
  const { year } = useYearStore();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const currentUser = useAuthStore((state) => state.user);
  const canList = hasPermission('messages.list');
  const canCreate = hasPermission('messages.create');
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showDetails, setShowDetails] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<MessageItem | null>(null);
  const [showAttachmentsModal, setShowAttachmentsModal] = useState(false);
  const [attachmentsToShow, setAttachmentsToShow] = useState<
    { fileName: string; mimeType?: string; downloadUrl?: string; inline?: boolean }[]
  >([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MessageItem | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteExtra, setDeleteExtra] = useState('');
  const [recipientFilter, setRecipientFilter] = useState('');
  const detailRef = useRef<HTMLDivElement>(null);
  const pageSize = 20;

  const printRecipient = (
    recipient: string,
    emailState: string,
    appState: string,
    appRead: boolean
  ) => {
    if (!selectedMessage) return;
    const title = selectedMessage.reason || 'Detalle de mensaje';
    const created =
      selectedMessage.createdAt ? new Date(selectedMessage.createdAt).toLocaleString() : '';
    const content =
      typeof selectedMessage.content === 'string'
        ? selectedMessage.content
        : JSON.stringify(selectedMessage.content);
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const notiflowLogo = `${origin}/NotiflowH_01.png`;
    const schoolLogo =
      selectedMessage.schoolLogo ||
      selectedMessage.schoolLogoUrl ||
      `${origin}/Naranjo_Degradado.png`;
    const schoolName =
      selectedMessage.schoolName ||
      selectedMessage.school ||
      currentUser?.schoolName ||
      'Colegio';
    const html = `
      <html>
        <head>
          <title>Registro de envío</title>
          <style>
            body { font-family: 'Inter', Arial, sans-serif; color: #0f172a; padding: 24px; background: #f8fafc; }
            .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
            .brand { display: flex; align-items: center; gap: 12px; }
            .brand img { height: 42px; }
            .school img { height: 46px; border-radius: 10px; }
            h1 { font-size: 22px; margin: 0 0 8px; }
            h2 { font-size: 16px; margin: 12px 0 6px; color: #0f172a; }
            .card { border: 1px solid #e5e7eb; border-radius: 14px; padding: 14px; margin-bottom: 14px; background: #ffffff; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06); }
            table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
            th, td { border: 1px solid #e5e7eb; padding: 8px; text-align: left; }
            .meta { color: #475569; font-size: 12px; margin: 4px 0; }
            .section-title { text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; font-size: 11px; margin: 0 0 6px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="brand">
              <img src="${notiflowLogo}" alt="Notiflow" />
              <div>
                <div style="font-weight:700; color:#0f172a;">Notiflow</div>
                <div style="font-size:12px; color:#475569;">Registro de envío</div>
              </div>
            </div>
            ${schoolLogo ? `<div class="school"><img src="${schoolLogo}" alt="${schoolName}" /></div>` : ''}
          </div>
          <h1>Detalle por destinatario</h1>
          <div class="card">
            <div class="section-title">Mensaje</div>
            <div class="meta"><strong>Motivo:</strong> ${title}</div>
            <div class="meta"><strong>Fecha:</strong> ${created || '—'}</div>
            <div class="meta"><strong>Colegio:</strong> ${schoolName}</div>
            <div style="margin-top:10px; white-space:pre-wrap; line-height:1.5;">${content}</div>
          </div>
          <div class="card">
            <div class="section-title">Destinatario</div>
            <div class="meta"><strong>Email:</strong> ${recipient}</div>
            <div class="meta"><strong>Canales:</strong> ${Array.isArray(selectedMessage.channels) ? selectedMessage.channels.join(', ') : '—'}</div>
            <table>
              <tr><th>Correo enviado</th><td>${emailState}</td></tr>
              <tr><th>App enviada</th><td>${appState}</td></tr>
              <tr><th>App leída</th><td>${appRead ? 'Sí' : 'No'}</td></tr>
            </table>
          </div>
        </body>
      </html>
    `;

    // Imprimir sin abrir pestaña: usar iframe oculto
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();

    iframe.onload = () => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => document.body.removeChild(iframe), 500);
    };
  };

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(handle);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, year]);

  useEffect(() => {
    if (!canList) return;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await apiClient.getMessages({
          year,
          page,
          pageSize,
          q: debouncedSearch || undefined,
        });
        const data = res.data || {};
        const items = data.items ?? data ?? [];
        setMessages(items);
        setTotal(data.total ?? items.length ?? 0);
      } catch (err: any) {
        const msg =
          err?.response?.data?.message ||
          err?.response?.data?.error ||
          err?.message ||
          'No se pudieron cargar los mensajes';
        setError(msg);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [canList, year, page, pageSize, debouncedSearch]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const paginated = useMemo(
    () =>
      (messages || []).map((m) => ({
        ...m,
        recipientsText: Array.isArray(m.recipients) ? m.recipients.join(', ') : '',
        channelsText: Array.isArray(m.channels) ? m.channels.join(', ') : '',
        createdText:
          m.status?.toLowerCase() === 'scheduled' && m.scheduledAt
            ? `Programado: ${new Date(m.scheduledAt).toLocaleString()}`
            : m.createdAt
              ? new Date(m.createdAt).toLocaleString()
              : '',
        canDelete: (m as any).canDelete ?? false,
      })),
    [messages]
  );

  if (!canList) {
    return (
      <ProtectedLayout>
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Sin permisos</h1>
          <p className="text-gray-600">
            No tienes permisos para ver el historial de mensajes.
          </p>
        </div>
      </ProtectedLayout>
    );
  }

  return (
    <ProtectedLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-sm text-gray-500">Historial</p>
            <h1 className="text-4xl font-bold text-gray-900">Mis Mensajes</h1>
            <p className="text-gray-600 mt-1">
              Historial de mensajes enviados y programados (año {year})
            </p>
          </div>
          {canCreate && (
            <Link
              href="/messages/new"
              className="inline-flex px-6 py-2.5 bg-primary text-white rounded-lg font-medium hover:bg-primary-dark transition-colors"
            >
              + Nuevo Mensaje
            </Link>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Buscar por contenido, remitente o destinatario"
            className="w-full sm:w-96 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200"
          />
          <div className="text-sm text-gray-600">
            Mostrando {paginated.length} de {total} mensajes
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          {loading && (
            <p className="p-4 text-sm text-gray-600">Cargando mensajes...</p>
          )}
          {error && (
            <p className="p-4 text-sm text-red-600">{error}</p>
          )}
          {!loading && !error && (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Mensaje</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Enviado por</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Destinatarios</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Estado canales</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Fecha</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {paginated.map((message) => (
                  <tr key={message.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-5 text-base text-gray-900">
                      {message.reason && (
                        <p className="text-xs font-semibold text-primary mb-1 line-clamp-1">
                          {message.reason}
                        </p>
                      )}
                      <div className="line-clamp-3 text-gray-800 break-words">
                        {renderRichText(message.content)}
                      </div>
                      {Array.isArray(message.attachments) && message.attachments.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setAttachmentsToShow(message.attachments || []);
                            setShowAttachmentsModal(true);
                          }}
                          className="mt-2 inline-flex items-center gap-2 text-xs text-primary bg-primary/5 px-2 py-1 rounded-md hover:bg-primary/10"
                        >
                          <span>📎</span>
                          <span>{message.attachments.length} adjunto{message.attachments.length > 1 ? 's' : ''}</span>
                        </button>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      <div className="flex flex-col">
                        <span className="text-[11px] uppercase tracking-wide text-gray-500">Nombre de quien envía</span>
                        <span className="font-medium text-gray-900">{senderDisplayName(message.senderName, message.senderEmail)}</span>
                        <span className="text-[11px] uppercase tracking-wide text-gray-500 mt-1">Correo</span>
                        <span className="text-xs text-gray-600">{message.senderEmail || '—'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {message.recipients ? `${message.recipients.length} destinatario${message.recipients.length === 1 ? '' : 's'}` : '—'}
                    </td>
                  <td className="px-6 py-4 text-sm">
                    <div className="space-y-1">
                      {Array.isArray(message.channels) && message.channels.includes('email') && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 flex items-center gap-1">
                            <span role="img" aria-label="Email">📧</span>
                            <span className="sr-only">Email</span>
                          </span>
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${
                              (message.emailStatus || message.status || '').toLowerCase() === 'sent'
                                ? 'bg-green-100 text-green-700'
                                : (message.emailStatus || message.status || '').toLowerCase() === 'pending'
                                  ? 'bg-yellow-100 text-yellow-700'
                                  : (message.emailStatus || message.status || '').toLowerCase() === 'failed'
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            <span className="mr-1">{statusIcon(message.emailStatus || message.status)}</span>
                            {statusLabel(message.emailStatus || message.status)}
                          </span>
                        </div>
                      )}
                      {Array.isArray(message.channels) && message.channels.includes('app') && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 flex items-center gap-1">
                            <span role="img" aria-label="App">📲</span>
                            <span className="sr-only">App</span>
                          </span>
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${
                              (message.appStatus || 'pending').toLowerCase() === 'read'
                                ? 'bg-blue-100 text-blue-700'
                                : (message.appStatus || 'pending').toLowerCase() === 'sent'
                                  ? 'bg-green-100 text-green-700'
                                  : (message.appStatus || 'pending').toLowerCase() === 'pending'
                                    ? 'bg-yellow-100 text-yellow-700'
                                  : (message.appStatus || 'pending').toLowerCase() === 'failed'
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            <span className="mr-1">{statusIcon(message.appStatus || 'pending')}</span>
                            {statusLabel(message.appStatus || 'pending')}
                          </span>
                        </div>
                      )}
                      <p className="text-xs text-gray-500">Canales: {message.channelsText || '—'}</p>
                    </div>
                  </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {message.createdText || '—'}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-500">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          className="inline-flex items-center px-3 py-1.5 rounded-md bg-primary text-white text-xs font-semibold hover:bg-primary-dark transition-colors"
                          onClick={() => {
                            setSelectedMessage(message);
                            setShowDetails(true);
                          }}
                        >
                          Ver más detalles
                        </button>
                        {message.canDelete && (
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteTarget(message);
                              setDeleteReason('');
                              setDeleteExtra('');
                              setShowDeleteModal(true);
                            }}
                            className="inline-flex items-center px-3 py-1.5 rounded-md bg-red-50 text-red-700 text-xs font-semibold hover:bg-red-100 border border-red-200 transition-colors"
                            title="Eliminar mensaje"
                          >
                            <span className="mr-1">🗑</span>
                            <span>Eliminar</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!paginated.length && !loading && (
                  <tr>
                    <td className="px-6 py-4 text-sm text-gray-500" colSpan={6}>
                      No hay mensajes todavía.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm disabled:opacity-50"
          >
            Anterior
          </button>
          <span className="text-sm text-gray-600">
            Página {page} de {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm disabled:opacity-50"
          >
            Siguiente
          </button>
        </div>

        <Modal
          isOpen={showAttachmentsModal}
          title="Adjuntos"
          onClose={() => {
            setShowAttachmentsModal(false);
            setAttachmentsToShow([]);
          }}
        >
          <div className="space-y-2">
            {attachmentsToShow.length === 0 && (
              <p className="text-sm text-gray-600">No hay adjuntos disponibles.</p>
            )}
            {attachmentsToShow.map((att) => (
              <div key={att.fileName} className="text-sm flex flex-col gap-1">
                <span className="font-medium text-gray-900">📎 {att.fileName}</span>
                <div className="text-xs text-gray-600 flex flex-wrap gap-2">
                  {att.mimeType && <span>{att.mimeType}</span>}
                  {att.downloadUrl ? (
                    <a
                      href={att.downloadUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline break-all"
                    >
                      Descargar
                    </a>
                  ) : (
                    <span className="text-gray-400">Sin enlace de descarga</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Modal>

        <Modal
          isOpen={showDeleteModal}
          title="Eliminar mensaje"
          onClose={() => {
            setShowDeleteModal(false);
            setDeleteTarget(null);
          }}
          onConfirm={async () => {
            if (!deleteTarget) return;
            const reasonText = deleteReason || deleteExtra;
            if (!reasonText || reasonText.trim().length < 3) {
              alert('Indica un motivo breve para eliminar este mensaje.');
              return;
            }
            try {
              await apiClient.deleteMessage(deleteTarget.id);
              setMessages((prev) => prev.filter((m) => m.id !== deleteTarget.id));
              // Futuro: enviar reasonText a auditoría cuando el backend lo soporte
              setShowDeleteModal(false);
              setDeleteTarget(null);
            } catch (err: any) {
              alert(err?.response?.data?.message || 'No se pudo eliminar');
            }
          }}
          confirmText="Eliminar definitivamente"
        >
          <div className="space-y-4 text-sm text-gray-700">
            <p className="text-red-700 font-semibold">
              Esta acción es permanente. Describe el motivo para eliminar este mensaje.
            </p>
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-gray-600">Motivo</label>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
              >
                <option value="">Selecciona un motivo</option>
                <option value="contenido_erroneo">Contenido erróneo</option>
                <option value="destinatarios_equivocados">Destinatarios equivocados</option>
                <option value="duplicado">Mensaje duplicado</option>
                <option value="inapropiado">Contenido inapropiado</option>
                <option value="otro">Otro</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-gray-600">Detalle (opcional)</label>
              <textarea
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                rows={3}
                placeholder="Agrega un detalle breve para la auditoría (opcional)"
                value={deleteExtra}
                onChange={(e) => setDeleteExtra(e.target.value)}
              />
            </div>
          </div>
        </Modal>

        <Modal
          isOpen={showDetails}
          title="Detalle de envío"
          size="xl"
          onClose={() => {
            setShowDetails(false);
            setSelectedMessage(null);
          }}
          onConfirm={() => {
            setShowDetails(false);
            setSelectedMessage(null);
          }}
          confirmText="Cerrar"
        >
          {selectedMessage ? (
            <div className="space-y-5 text-sm text-gray-700 max-h-[88vh] overflow-auto w-full max-w-6xl mx-auto">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    if (!detailRef.current) return;
                    const html = `
                      <html>
                        <head>
                          <title>Detalle de envío</title>
                          <style>
                            body { font-family: Arial, sans-serif; color: #111827; padding: 16px; }
                            h1 { font-size: 20px; margin-bottom: 8px; }
                            h2 { font-size: 16px; margin: 12px 0 6px; }
                            .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px; margin-bottom: 12px; }
                            table { width: 100%; border-collapse: collapse; font-size: 12px; }
                            th, td { border: 1px solid #e5e7eb; padding: 6px; text-align: left; }
                            .chips span { display: inline-block; padding: 4px 8px; background: #f3f4f6; border-radius: 9999px; margin-right: 6px; }
                          </style>
                        </head>
                        <body>
                          <h1>Detalle de envío</h1>
                          ${detailRef.current.innerHTML}
                        </body>
                      </html>`;
                    const printWin = window.open('', '_blank');
                    if (!printWin) return;
                    printWin.document.open();
                    printWin.document.write(html);
                    printWin.document.close();
                    printWin.focus();
                    printWin.print();
                    printWin.close();
                  }}
                  className="inline-flex items-center px-3 py-2 text-xs font-semibold bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
                >
                  Exportar PDF
                </button>
              </div>
              <div ref={detailRef} className="space-y-5">
              <div className="bg-gradient-to-r from-gray-50 to-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Motivo</p>
                    <p className="font-semibold text-gray-900 text-base">
                      {selectedMessage.reason || 'Sin motivo'}
                    </p>
                    {selectedMessage.status?.toLowerCase() === 'scheduled' && selectedMessage.scheduledAt && (
                      <p className="text-xs text-gray-600 mt-1">
                        Programado para {new Date(selectedMessage.scheduledAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div className="text-right text-xs text-gray-500">
                    <p className="uppercase tracking-wide">Enviado por</p>
                    <p className="text-[11px] uppercase tracking-wide text-gray-500 mt-1">Nombre de quien envía</p>
                    <p className="font-semibold text-gray-800 text-sm">
                      {senderDisplayName(selectedMessage.senderName, selectedMessage.senderEmail)}
                    </p>
                    <p className="text-[11px] uppercase tracking-wide text-gray-500 mt-1">Correo</p>
                    <p className="text-gray-600">{selectedMessage.senderEmail || '—'}</p>
                  </div>
                </div>
                <div className="mt-3">
                  <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Mensaje</p>
                    <div className="bg-white border border-gray-200 rounded-lg p-4 text-gray-800 whitespace-pre-line shadow-inner space-y-3">
                    <div className="break-words leading-relaxed">{renderRichText(selectedMessage.content)}</div>
                    {Array.isArray(selectedMessage.attachments) &&
                      selectedMessage.attachments
                        .filter(
                          (att) =>
                            att.inline &&
                            att.downloadUrl &&
                            (att.mimeType?.startsWith('image/') ||
                              att.fileName?.match(/\.(png|jpe?g|gif|webp|svg)$/i))
                        )
                        .map((att) => (
                          <div key={att.fileName} className="flex flex-col gap-2">
                            <p className="text-xs text-gray-500">Imagen inline: {att.fileName}</p>
                            <img
                              src={att.downloadUrl}
                              alt={att.fileName}
                              className="max-h-40 w-auto rounded-md border border-gray-200 object-contain shadow-sm"
                            />
                          </div>
                        ))}
                  </div>
                </div>
              </div>
              {Array.isArray(selectedMessage.attachments) && selectedMessage.attachments.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-500">Adjuntos</p>
                      <p className="text-sm font-semibold text-gray-800">
                        {selectedMessage.attachments.length} archivo{selectedMessage.attachments.length === 1 ? '' : 's'}
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 max-h-64 overflow-auto">
                    {selectedMessage.attachments.map((att) => (
                      <div
                        key={att.fileName}
                        className="flex items-center justify-between gap-2 border border-gray-100 rounded-lg px-3 py-2 bg-gray-50"
                      >
                        <div className="flex flex-col overflow-hidden">
                          <span className="font-medium text-gray-900 text-sm truncate">📎 {att.fileName}</span>
                          <span className="text-xs text-gray-500 truncate">
                            {att.mimeType || 'Archivo'} {att.inline ? '(inline)' : ''}
                          </span>
                        </div>
                        {att.downloadUrl ? (
                          <a
                            href={att.downloadUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary hover:underline text-xs whitespace-nowrap"
                          >
                            Descargar
                          </a>
                        ) : (
                          <span className="text-xs text-gray-400 whitespace-nowrap">Sin enlace</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-500">Destinatarios</p>
                    <p className="text-sm font-semibold text-gray-800">
                      {selectedMessage.recipients?.length || 0} personas
                    </p>
                  </div>
                  <div className="w-full sm:w-72">
                    <input
                      type="search"
                      value={recipientFilter}
                      onChange={(e) => setRecipientFilter(e.target.value)}
                      placeholder="Buscar destinatario..."
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200"
                    />
                  </div>
                </div>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="max-h-96 overflow-auto">
                    <table className="w-full text-xs sm:text-sm min-w-[760px]">
                      <thead className="bg-gray-100 text-gray-700 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left w-2/5">Destinatario</th>
                          <th className="px-3 py-2 text-left">Correo enviado</th>
                          <th className="px-3 py-2 text-left">Correo recibido</th>
                          <th className="px-3 py-2 text-left">App enviada</th>
                          <th className="px-3 py-2 text-left">App leída</th>
                          <th className="px-3 py-2 text-left">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {(selectedMessage.recipients || [])
                          .filter((r) =>
                            recipientFilter
                              ? r.toLowerCase().includes(recipientFilter.toLowerCase())
                              : true
                          )
                          .map((r) => {
                          const hasEmail = Array.isArray(selectedMessage.channels) && selectedMessage.channels.includes('email');
                          const hasApp = Array.isArray(selectedMessage.channels) && selectedMessage.channels.includes('app');
                          const emailSent = hasEmail ? ((selectedMessage.emailStatus || selectedMessage.status || '').toLowerCase() !== 'failed') : false;
                          const perRecipientAppStatus =
                            selectedMessage.appStatuses?.[r] ||
                            (Array.isArray(selectedMessage.appReadBy) && selectedMessage.appReadBy.includes(r) ? 'read' : (selectedMessage.appStatus || 'pending'));
                          const appSent = hasApp ? (perRecipientAppStatus.toLowerCase() !== 'failed') : false;
                          const appRead = hasApp ? (perRecipientAppStatus.toLowerCase() === 'read') : false;
                          const emailStateLabel = emailSent ? 'Enviado' : 'No enviado';
                          const appStateLabel = appSent ? 'Enviado' : 'No enviado';
                          const icon = (state?: string, positive?: boolean) => {
                            const val = (state ?? '').toString().toLowerCase();
                            if (val === 'read' || (positive != null && positive)) return '✔✔';
                            if (val === 'sent' || val === 'delivered') return '✔';
                            if (val === 'pending') return '⌛';
                            return '✖';
                          };
                          return (
                            <tr key={r} className="hover:bg-gray-50">
                              <td className="px-3 py-2 text-gray-800 break-all">{r}</td>
                              <td className="px-3 py-2">{hasEmail ? icon(selectedMessage.emailStatus, emailSent) : '—'}</td>
                              <td className="px-3 py-2">{hasEmail ? (emailSent ? '✔' : '—') : '—'}</td>
                              <td className="px-3 py-2">{hasApp ? icon(perRecipientAppStatus, appSent) : '—'}</td>
                              <td className="px-3 py-2">{hasApp ? (appRead ? '✔✔' : '⌛') : '—'}</td>
                              <td className="px-3 py-2">
                                <button
                                  type="button"
                                  onClick={() => printRecipient(r, emailStateLabel, appStateLabel, appRead)}
                                  className="text-primary text-xs font-semibold hover:underline"
                                >
                                  Exportar PDF
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 shadow-sm">
                <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Estado por canal</p>
                <div className="space-y-2">
                  {Array.isArray(selectedMessage.channels) && selectedMessage.channels.includes('email') && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-[11px] text-gray-500 flex items-center gap-1">
                        <span role="img" aria-label="Email">📧</span>
                        <span className="sr-only">Email</span>
                      </span>
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${
                          (selectedMessage.emailStatus || selectedMessage.status || '').toLowerCase() === 'sent'
                            ? 'bg-green-100 text-green-700'
                            : (selectedMessage.emailStatus || selectedMessage.status || '').toLowerCase() === 'pending'
                              ? 'bg-yellow-100 text-yellow-700'
                              : (selectedMessage.emailStatus || selectedMessage.status || '').toLowerCase() === 'failed'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        <span className="mr-1">{statusIcon(selectedMessage.emailStatus || selectedMessage.status)}</span>
                        {statusLabel(selectedMessage.emailStatus || selectedMessage.status)}
                      </span>
                    </div>
                  )}
                  {Array.isArray(selectedMessage.channels) && selectedMessage.channels.includes('app') && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-[11px] text-gray-500 flex items-center gap-1">
                        <span role="img" aria-label="App">📲</span>
                        <span className="sr-only">App</span>
                      </span>
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${
                          (selectedMessage.appStatus || 'pending').toLowerCase() === 'read'
                            ? 'bg-blue-100 text-blue-700'
                            : (selectedMessage.appStatus || 'pending').toLowerCase() === 'sent'
                              ? 'bg-green-100 text-green-700'
                              : (selectedMessage.appStatus || 'pending').toLowerCase() === 'pending'
                                ? 'bg-yellow-100 text-yellow-700'
                                : (selectedMessage.appStatus || 'pending').toLowerCase() === 'failed'
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        <span className="mr-1">{statusIcon(selectedMessage.appStatus || 'pending')}</span>
                        {statusLabel(selectedMessage.appStatus || 'pending')}
                      </span>
                    </div>
                  )}
                  <p className="text-xs text-gray-500">Canales: {Array.isArray(selectedMessage.channels) ? selectedMessage.channels.join(', ') : '—'}</p>
                </div>
              </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-600">Selecciona un mensaje para ver el detalle.</p>
          )}
        </Modal>


      </div>
    </ProtectedLayout>
  );
}
const renderRecipientStatus = (
  recipient: string,
  emailStatus?: string,
  appStatus?: string,
  status?: string
) => {
  const email = (recipient || '').toLowerCase();
  const emailState = statusLabel(emailStatus || status);
  const appState = statusLabel(appStatus || 'pending');
  const iconMail = statusIcon(emailStatus || status);
  const iconApp = statusIcon(appStatus || 'pending');
  return (
    <div key={email} className="border border-gray-200 rounded-lg p-3 space-y-1">
      <p className="text-sm font-semibold text-gray-900 break-all">{recipient}</p>
      <div className="flex items-center justify-between text-xs text-gray-700">
        <span className="flex items-center gap-1">📧 Correo</span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
          <span>{iconMail || '•'}</span>
          <span>{emailState}</span>
        </span>
      </div>
      <div className="flex items-center justify-between text-xs text-gray-700">
        <span className="flex items-center gap-1">📲 App</span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
          <span>{iconApp || '•'}</span>
          <span>{appState}</span>
        </span>
      </div>
    </div>
  );
};
