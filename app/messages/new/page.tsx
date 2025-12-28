'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ProtectedLayout } from '@/components/layout/ProtectedLayout';
import { Modal } from '@/components/ui';
import { apiClient } from '@/lib/api-client';
import { useAuthStore, useYearStore } from '@/store';

const renderRich = (text?: string) => {
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

type Template = {
  id: string;
  name: string;
  content: string;
};

type StudentRecipient = {
  id: string;
  firstName?: string;
  lastNameFather?: string;
  lastNameMother?: string;
  email?: string;
  course?: string;
  year?: string;
};

export default function NewMessagePage() {
  const { year } = useYearStore();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const currentUser = useAuthStore((state) => state.user);
  const canCreate = hasPermission('messages.create');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [recentTemplates, setRecentTemplates] = useState<Template[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [messageContent, setMessageContent] = useState('');
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateContent, setNewTemplateContent] = useState('');
  const [showTemplatesModal, setShowTemplatesModal] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editContent, setEditContent] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [extraFiles, setExtraFiles] = useState<File[]>([]);
  const [sendMode, setSendMode] = useState<'now' | 'schedule'>('now');
  const [scheduleAt, setScheduleAt] = useState('');
  const [reason, setReason] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [moderationInfo, setModerationInfo] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [debouncedStudentSearch, setDebouncedStudentSearch] = useState('');
  const [groupSearch, setGroupSearch] = useState('');
  const [channels, setChannels] = useState<string[]>(['email', 'app']);
  const [users, setUsers] = useState<{ id: string; name: string; email: string }[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [usersError, setUsersError] = useState('');
  const [students, setStudents] = useState<StudentRecipient[]>([]);
  const [studentsTotal, setStudentsTotal] = useState(0);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [studentsError, setStudentsError] = useState('');
  const [studentCache, setStudentCache] = useState<Record<string, StudentRecipient>>({});
  const [groups, setGroups] = useState<{ id: string; name: string; memberIds: string[] }[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [groupsError, setGroupsError] = useState('');
  const [sendLoading, setSendLoading] = useState(false);
  const [sendError, setSendError] = useState('');
  const [sendSuccess, setSendSuccess] = useState('');
  const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
  const [step, setStep] = useState(1);
  const [userPage, setUserPage] = useState(1);
  const userPageSize = 12;
  const [studentPage, setStudentPage] = useState(1);
  const studentPageSize = 10;

  useEffect(() => {
    if (!canCreate) return;
    const loadUsers = async () => {
      setLoadingUsers(true);
      setUsersError('');
      try {
        const res = await apiClient.getUsers();
        setUsers(res.data || []);
      } catch (err: any) {
        const msg =
          err?.response?.data?.message ||
          err?.response?.data?.error ||
          err?.message ||
          'No se pudieron cargar los usuarios';
        setUsersError(msg);
      } finally {
        setLoadingUsers(false);
      }
    };
    loadUsers();
    const loadTemplates = async () => {
      setLoadingTemplates(true);
      try {
        const res = await apiClient.getTemplates();
        const data = (res.data || []) as Template[];
        setTemplates(data);
        setRecentTemplates(data.slice(0, 6));
      } catch {
        // no-op
      } finally {
        setLoadingTemplates(false);
      }
    };
    loadTemplates();
    const loadGroups = async () => {
      setLoadingGroups(true);
      setGroupsError('');
      try {
        const res = await apiClient.getGroups(undefined, year);
        const data = res.data || [];
        setGroups((data as any).items ?? data ?? []);
      } catch (err: any) {
        const msg =
          err?.response?.data?.message ||
          err?.response?.data?.error ||
          err?.message ||
          'No se pudieron cargar los grupos';
        setGroupsError(msg);
      } finally {
        setLoadingGroups(false);
      }
    };
    loadGroups();
  }, [canCreate, year]);

  useEffect(() => {
    if (!canCreate) return;
    const loadStudents = async () => {
      setLoadingStudents(true);
      setStudentsError('');
      try {
        const res = await apiClient.getStudents({
          year: year || undefined,
          page: studentPage,
          pageSize: studentPageSize,
          q: debouncedStudentSearch || undefined,
        });
        const data = res.data || {};
        const items = data.items || [];
        setStudents(items);
        setStudentsTotal(data.total ?? (data.items?.length || 0));
        setStudentCache((prev) => {
          const next = { ...prev };
          items.forEach((s: StudentRecipient) => {
            next[s.id] = s;
          });
          return next;
        });
      } catch (err: any) {
        const msg =
          err?.response?.data?.message ||
          err?.response?.data?.error ||
          err?.message ||
          'No se pudieron cargar los estudiantes';
        setStudentsError(msg);
      } finally {
        setLoadingStudents(false);
      }
    };
    loadStudents();
  }, [canCreate, year, studentPage, debouncedStudentSearch, studentPageSize]);

  const fileToBase64 = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const res = reader.result as string;
        resolve(res.includes(',') ? res.split(',')[1] : res);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreate) return;
    if (!reason.trim()) {
      setSendError('Agrega el motivo del mensaje.');
      return;
    }
    if (!messageContent.trim()) {
      setSendError('Escribe el contenido del mensaje.');
      return;
    }
    const userEmails = users
      .filter((u) => selectedUserIds.includes(u.id))
      .map((u) => u.email)
      .filter((e): e is string => Boolean(e));
    const studentEmails = selectedStudentIds
      .map((id) => studentCache[id]?.email)
      .filter((e): e is string => Boolean(e));
    const emails: string[] = Array.from(new Set<string>([...userEmails, ...studentEmails]));
    if (!emails.length) {
      setSendError('Selecciona al menos un usuario con correo.');
      return;
    }
    if (!channels.length) {
      setSendError('Selecciona al menos un canal de envío.');
      return;
    }
    if (sendMode === 'schedule' && !scheduleAt) {
      setSendError('Selecciona fecha y hora para programar.');
      return;
    }

    const attachments: {
      fileName: string;
      mimeType: string;
      base64: string;
      inline?: boolean;
      cid?: string;
    }[] = [];

    try {
      if (attachedFile) {
        if (attachedFile.size > MAX_ATTACHMENT_BYTES) {
          setSendError('La imagen supera los 10MB permitidos.');
          return;
        }
        const base64 = await fileToBase64(attachedFile);
        attachments.push({
          fileName: attachedFile.name,
          mimeType: attachedFile.type || 'image/*',
          base64,
          inline: true,
          cid: 'inline-image-1',
        });
      }
      for (const file of extraFiles) {
        if (file.size > MAX_ATTACHMENT_BYTES) {
          setSendError(`El archivo ${file.name} supera los 10MB permitidos.`);
          return;
        }
        const base64 = await fileToBase64(file);
        attachments.push({
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          base64,
          inline: false,
        });
      }
    } catch (err) {
      setSendError('No se pudieron procesar los adjuntos.');
      return;
    }

    // Reemplazo básico de placeholders
    const primaryRecipient =
      selectedUserIds.length === 1
        ? users.find((u) => u.id === selectedUserIds[0])
        : null;
    const now = new Date().toLocaleDateString();
    const replaceTokens = (text: string) => {
      const base = text ?? '';
      return base
        .split('{{nombre}}').join(primaryRecipient?.name ?? '')
        .split('{{curso}}').join('')
        .split('{{fecha}}').join(now)
        .split('{{remitente}}').join(currentUser?.name ?? '');
    };
    const finalContent = replaceTokens(messageContent);
    const finalReason = replaceTokens(reason);

    setSendLoading(true);
    setSendError('');
    setSendSuccess('');
    const scheduleIso =
      sendMode === 'schedule' && scheduleAt
        ? new Date(scheduleAt).toISOString()
        : undefined;

    apiClient
      .sendMessage({
        content: finalContent,
        recipients: emails,
        channels,
        scheduleAt: scheduleIso,
        year,
        reason: finalReason,
        attachments,
      })
      .then((res) => {
        const status = res?.data?.status || res?.data?.messageStatus || '';
        if (status && status.toLowerCase() === 'failed') {
          setSendError('El backend no pudo entregar el mensaje (estado FAILED). Revisa logs o configuración de correo.');
          return;
        }
        setSendSuccess(sendMode === 'now' ? 'Mensaje enviado.' : 'Mensaje programado.');
        setSelectedUserIds([]);
        setSelectedGroups([]);
        setMessageContent('');
        setScheduleAt('');
        setAttachedFile(null);
        setExtraFiles([]);
        setReason('');
      })
      .catch((err: any) => {
        const msg =
          err?.response?.data?.message ||
          err?.response?.data?.error ||
          err?.message ||
          'No se pudo enviar el mensaje';
        setSendError(msg);
      })
      .finally(() => setSendLoading(false));
  };

  const nextStep = () => {
    if (step === 1) {
      setStep(2);
      return;
    }
    if (step === 2) {
      if (!reason.trim() || !messageContent.trim()) {
        setSendError('Completa motivo y contenido antes de continuar.');
        return;
      }
      setSendError('');
      setStep(3);
      return;
    }
    if (step === 3) {
      const hasRecipients =
        selectedUserIds.length > 0 ||
        selectedStudentIds.length > 0 ||
        selectedGroups.length > 0;
      if (!hasRecipients) {
        setSendError('Selecciona al menos un destinatario.');
        return;
      }
      setSendError('');
      setStep(4);
      return;
    }
    if (step === 4) {
      if (!channels.length) {
        setSendError('Selecciona al menos un canal de envío.');
        return;
      }
      if (sendMode === 'schedule' && !scheduleAt) {
        setSendError('Selecciona fecha y hora para programar.');
        return;
      }
      setSendError('');
      setStep(5);
      return;
    }
  };

  const prevStep = () => {
    setSendError('');
    setStep((s) => Math.max(1, s - 1));
  };

  const handleApplyTemplate = (templateId: string) => {
    const found = templates.find((t) => t.id === templateId);
    if (found) {
      setSelectedTemplate(templateId);
      setMessageContent(found.content);
      setReason(found.name);
      if (found.content.includes('{{fecha}}')) {
        const today = new Date().toLocaleDateString();
        setMessageContent(found.content.split('{{fecha}}').join(today));
      }
      setStep(2);
      setShowTemplatesModal(false);
    }
  };

  const handleAddTemplate = () => {
    if (!newTemplateName.trim() || !newTemplateContent.trim()) return;
    apiClient
      .createTemplate({
        name: newTemplateName.trim(),
        content: newTemplateContent.trim(),
      })
      .then((res) => {
        const created = res.data as Template;
        setTemplates((prev) => [created, ...prev]);
        setNewTemplateName('');
        setNewTemplateContent('');
        setSelectedTemplate(created.id);
        setMessageContent(created.content);
      })
      .catch(() => {});
  };

  const handleStartEdit = (tpl: Template) => {
    setEditingTemplateId(tpl.id);
    setEditName(tpl.name);
    setEditContent(tpl.content);
    setShowEditModal(true);
  };

  const handleSaveEdit = () => {
    if (!editingTemplateId || !editName.trim() || !editContent.trim()) return;
    apiClient
      .updateTemplate(editingTemplateId, { name: editName.trim(), content: editContent.trim() })
      .then((res) => {
        const updated = res.data as Template;
        setTemplates((prev) =>
          prev.map((tpl) => (tpl.id === updated.id ? updated : tpl))
        );
        if (selectedTemplate === updated.id) {
          setMessageContent(updated.content);
          setReason(updated.name);
        }
        handleCancelEdit();
      })
      .catch(() => {});
  };

  const handleCancelEdit = () => {
    setEditingTemplateId(null);
    setEditName('');
    setEditContent('');
    setShowEditModal(false);
  };

  const handleDeleteTemplate = (id: string) => {
    setDeleteTarget(templates.find((tpl) => tpl.id === id) || null);
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    apiClient
      .deleteTemplate(deleteTarget.id)
      .then(() => {
        setTemplates((prev) => prev.filter((tpl) => tpl.id !== deleteTarget.id));
        if (selectedTemplate === deleteTarget.id) {
          setSelectedTemplate(null);
        }
        if (editingTemplateId === deleteTarget.id) {
          handleCancelEdit();
        }
        setDeleteTarget(null);
      })
      .catch(() => {});
  };

  const handleCancelDelete = () => {
    setDeleteTarget(null);
  };

  const toggleGroup = (id: string) => {
    const group = groups.find((g) => g.id === id);
    if (!group) {
      setSelectedGroups((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));
      return;
    }
    const memberIds = group.memberIds || [];
    const allSelected = memberIds.length > 0 && memberIds.every((m) => selectedUserIds.includes(m));
    if (allSelected) {
      setSelectedUserIds((prev) => prev.filter((id) => !memberIds.includes(id)));
      setSelectedGroups((prev) => prev.filter((r) => r !== id));
    } else {
      setSelectedUserIds((prev) => Array.from(new Set([...prev, ...memberIds])));
      setSelectedGroups((prev) => (prev.includes(id) ? prev : [...prev, id]));
    }
  };

  const toggleUser = (id: string) => {
    setSelectedUserIds((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));
  };

  const toggleStudent = (id: string) => {
    setSelectedStudentIds((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));
  };

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return users;
    const term = search.toLowerCase();
    return users.filter(
      (u) =>
        u.name?.toLowerCase().includes(term) ||
        u.email?.toLowerCase().includes(term)
    );
  }, [search, users]);

  const filteredGroups = useMemo(() => {
    if (!groupSearch.trim()) return groups;
    const term = groupSearch.toLowerCase();
    return groups.filter((g) => g.name?.toLowerCase().includes(term));
  }, [groupSearch, groups]);

  useEffect(() => {
    setUserPage(1);
  }, [search]);

  useEffect(() => {
    setStudentPage(1);
  }, [studentSearch]);

  useEffect(() => {
    setStudentPage(1);
  }, [year]);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedStudentSearch(studentSearch.trim()), 250);
    return () => clearTimeout(handle);
  }, [studentSearch]);

  const userTotalPages = Math.max(1, Math.ceil(filteredUsers.length / userPageSize));
  const paginatedUsers = useMemo(() => {
    const start = (userPage - 1) * userPageSize;
    return filteredUsers.slice(start, start + userPageSize);
  }, [filteredUsers, userPage, userPageSize]);

  const selectedRecipients = useMemo(
    () => users.filter((u) => selectedUserIds.includes(u.id)),
    [users, selectedUserIds]
  );

  const studentTotalPages = Math.max(1, Math.ceil(studentsTotal / studentPageSize));
  const paginatedStudents = students;
  const selectedGroupRecipients = useMemo(
    () => groups.filter((g) => selectedGroups.includes(g.id)),
    [groups, selectedGroups]
  );
  const selectedStudentRecipients = useMemo(
    () => selectedStudentIds.map((id) => studentCache[id]).filter(Boolean),
    [selectedStudentIds, studentCache]
  );

  const allSelectedRecipients = useMemo(
    () => [
      ...selectedRecipients.map((u) => ({ id: `user-${u.id}`, label: u.name || u.email, email: u.email, type: 'Usuario' })),
      ...selectedStudentRecipients.map((s) => ({
        id: `student-${s.id}`,
        label: `${s.firstName || ''} ${s.lastNameFather || ''} ${s.lastNameMother || ''}`.trim() || s.email || 'Estudiante',
        email: s.email,
        type: 'Estudiante',
      })),
    ],
    [selectedRecipients, selectedStudentRecipients]
  );

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const applyFormat = (prefix: string, suffix?: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart || 0;
    const end = el.selectionEnd || 0;
    const before = messageContent.slice(0, start);
    const selected = messageContent.slice(start, end);
    const after = messageContent.slice(end);
    const sfx = suffix ?? prefix;
    const next = `${before}${prefix}${selected}${sfx}${after}`;
    setMessageContent(next);
    const cursor = start + prefix.length + selected.length + sfx.length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(cursor, cursor);
    });
  };

  const handleAiRewriteModerate = async () => {
    if (!messageContent.trim()) {
      setSendError('Escribe un mensaje para mejorarlo con IA.');
      return;
    }
    setAiLoading(true);
    setSendError('');
    setModerationInfo('');
    try {
      const res = await apiClient.aiRewriteModerate(
        messageContent,
        reason,
        'profesional y cercano'
      );
      const suggestion = res?.data?.suggestion?.trim() || messageContent;
      const subjectSuggestion = res?.data?.subjectSuggestion?.trim() || reason;
      setMessageContent(suggestion);
      setReason(subjectSuggestion);
      const allowed = res?.data?.allowed ?? true;
      const reasons = res?.data?.reasons || [];
      if (allowed) {
        setModerationInfo('✅ Sin hallazgos de contenido sensible.');
        setSendSuccess('Texto mejorado y aprobado por IA.');
      } else {
        setModerationInfo(`⚠️ Revisa el texto: ${reasons.join(', ') || 'posible contenido sensible'}`);
        setSendError('La IA detectó contenido sensible, revisa antes de enviar.');
      }
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        'No pudimos revisar el contenido con IA.';
      setSendError(msg);
    } finally {
      setAiLoading(false);
    }
  };

  const toggleSelectFiltered = () => {
    const ids = paginatedUsers.map((u) => u.id);
    const allSelected = ids.every((id) => selectedUserIds.includes(id));
    if (allSelected) {
      setSelectedUserIds((prev) => prev.filter((id) => !ids.includes(id)));
    } else {
      setSelectedUserIds((prev) => Array.from(new Set([...prev, ...ids])));
    }
  };

  const toggleSelectStudents = () => {
    const ids = paginatedStudents.map((s) => s.id);
    const allSelected = ids.every((id) => selectedStudentIds.includes(id));
    if (allSelected) {
      setSelectedStudentIds((prev) => prev.filter((id) => !ids.includes(id)));
    } else {
      setSelectedStudentIds((prev) => Array.from(new Set([...prev, ...ids])));
    }
  };

  if (!canCreate) {
    return (
      <ProtectedLayout>
        <div className="max-w-3xl mx-auto bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Sin permisos</h1>
          <p className="text-gray-600">
            No tienes permisos para crear mensajes. Si crees que es un error, contacta al
            administrador.
          </p>
          <div className="mt-4 flex gap-3">
            <Link
              href="/messages"
              className="inline-flex px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-dark transition-colors"
            >
              Ver historial
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Ir al dashboard
            </Link>
          </div>
        </div>
      </ProtectedLayout>
    );
  }

  return (
    <ProtectedLayout>
      <div className="relative max-w-4xl mx-auto space-y-6 px-4 sm:px-6">
        {aiLoading && (
          <div className="absolute inset-0 z-30 bg-white/75 backdrop-blur-sm flex flex-col items-center justify-center">
            <div className="bg-white/90 border border-gray-200 shadow-xl rounded-2xl px-6 py-5 flex flex-col items-center gap-3 max-w-sm text-center">
              <div className="relative h-14 w-14">
                <div className="absolute inset-0 rounded-full border-4 border-primary/20 animate-ping" />
                <div className="absolute inset-1 rounded-full border-4 border-primary/30 animate-spin" />
                <div className="relative h-full w-full rounded-full bg-primary flex items-center justify-center text-white font-bold">
                  IA
                </div>
              </div>
              <p className="text-sm font-semibold text-gray-800">
                Procesando con IA…
              </p>
              <p className="text-xs text-gray-600 leading-relaxed">
                Mejorando redacción, asunto y revisando seguridad. Esto puede tardar unos segundos.
              </p>
            </div>
          </div>
        )}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-sm text-gray-500">Redactar</p>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              Nuevo Mensaje
            </h1>
            <p className="text-gray-600 mt-1">Envía un mensaje inmediato o prográmalo</p>
          </div>
          <Link
            href="/messages"
            className="text-primary hover:text-green-800 transition-colors text-sm sm:text-base"
          >
            ← Volver
          </Link>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 sm:p-8 space-y-6">
          {/* Stepper */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs sm:text-sm font-medium text-gray-600">
              <span className={step >= 1 ? 'text-primary' : ''}>1. Plantilla</span>
              <span className={step >= 2 ? 'text-primary' : ''}>2. Mensaje</span>
              <span className={step >= 3 ? 'text-primary' : ''}>3. Destinatarios</span>
              <span className={step >= 4 ? 'text-primary' : ''}>4. Canales/Programación</span>
              <span className={step >= 5 ? 'text-primary' : ''}>5. Resumen</span>
            </div>
            <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${(step / 5) * 100}%` }}
              />
            </div>
          </div>

          {(sendError || sendSuccess) && (
            <div className="mb-4 space-y-2">
              {sendError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                  {sendError}
                </div>
              )}
              {sendSuccess && (
                <div className="p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">
                  {sendSuccess}
                </div>
              )}
            </div>
          )}
          <form className="space-y-6" onSubmit={handleSubmit}>
            {/* 1. Plantillas */}
            {step === 1 && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">1. Plantillas</h2>
                    <p className="text-sm text-gray-600">Aplica o crea mensajes frecuentes.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowTemplatesModal(true)}
                    className="px-4 py-2 border border-primary text-primary rounded-lg font-medium hover:bg-primary/10 transition-colors"
                  >
                    Crear o actualizar plantillas
                  </button>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-semibold text-gray-900">Tus plantillas rápidas</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {templates.length > 0 ? (
                      templates.slice(0, 6).map((tpl) => (
                        <button
                          key={tpl.id}
                          type="button"
                          onClick={() => handleApplyTemplate(tpl.id)}
                          className={`text-left border rounded-lg p-3 hover:border-primary transition-colors ${
                            selectedTemplate === tpl.id ? 'border-primary bg-green-50' : 'border-gray-200'
                          }`}
                        >
                          <p className="font-semibold text-gray-900 mb-1">{tpl.name}</p>
                          <p className="text-sm text-gray-600 line-clamp-2">{tpl.content}</p>
                        </button>
                      ))
                    ) : (
                      <p className="text-sm text-gray-500">No tienes plantillas guardadas todavía.</p>
                    )}
                  </div>
                  {templates.length > 6 && (
                    <p className="text-xs text-gray-500">Ver todas y administrarlas en “Crear o actualizar plantillas”.</p>
                  )}
                </div>
              </div>
            )}

            {/* 2. Mensaje */}
            {step === 2 && (
            <div className="space-y-4 border border-gray-200 rounded-lg p-4 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-gray-900">2. Mensaje</h2>
                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
                  <div className="flex items-center gap-2">
                    <span>Formato rápido:</span>
                    <button
                      type="button"
                      onClick={() => applyFormat('**')}
                      className="px-2 py-1 border border-gray-300 rounded hover:border-primary"
                    >
                      <span className="font-semibold">B</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => applyFormat('_')}
                      className="px-2 py-1 border border-gray-300 rounded hover:border-primary italic"
                    >
                      I
                    </button>
                  </div>
                  <div className="h-4 w-px bg-gray-200" />
                  <button
                    type="button"
                    onClick={handleAiRewriteModerate}
                    disabled={aiLoading}
                    className="px-3 py-1 rounded-full border border-primary text-primary font-semibold hover:bg-primary/10 disabled:opacity-50 flex items-center gap-2"
                  >
                    {aiLoading ? (
                      <span className="flex items-center gap-1">
                        <span className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                        Trabajando...
                      </span>
                    ) : (
                      <>✨ Mejorar y revisar con IA</>
                    )}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Motivo del mensaje
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ej: Aviso de reunión, Comunicado general"
                  className="w-full px-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200 bg-white hover:border-gray-300"
                  required
                />
              </div>
              <textarea
                placeholder="Escribe tu mensaje aquí..."
                className="w-full px-4 py-2.5 border rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200 bg-white hover:border-gray-300 h-32 resize-none"
                value={messageContent}
                onChange={(e) => setMessageContent(e.target.value)}
                maxLength={1000}
                required
                ref={textareaRef}
              />
              <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                <p className="text-xs text-gray-500 mb-1">Vista previa (así se verá en el correo/app):</p>
                <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                  {renderRich(messageContent) || <span className="text-gray-400">Escribe tu mensaje...</span>}
                </div>
              </div>
              {moderationInfo && (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  {moderationInfo}
                </div>
              )}
              {/* Adjuntos compactos, justo bajo el contenido */}
              <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm">📎</div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Adjuntar</p>
                    <p className="text-xs text-gray-600">Imágenes o documentos (máx 10MB c/u). Hasta 5 archivos.</p>
                  </div>
                </div>
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label className="text-xs text-gray-700 flex flex-col gap-1">
                    Imagen inline
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setAttachedFile(e.target.files?.[0] || null)}
                      className="text-xs border border-gray-300 rounded-lg px-2 py-1"
                    />
                    {attachedFile && (
                      <span className="text-[11px] text-gray-600">
                        {attachedFile.name} ({Math.round(attachedFile.size / 1024)} KB)
                      </span>
                    )}
                  </label>
                  <label className="text-xs text-gray-700 flex flex-col gap-1">
                    Documentos (hasta 5)
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,image/*"
                      multiple
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        setExtraFiles((prev) => {
                          const merged = [...prev, ...files].slice(0, 5);
                          return merged;
                        });
                      }}
                      className="text-xs border border-gray-300 rounded-lg px-2 py-1"
                    />
                    {extraFiles.length > 0 && (
                      <div className="space-y-1 mt-1 max-h-20 overflow-auto">
                        {extraFiles.map((file, idx) => (
                          <div key={`${file.name}-${idx}`} className="flex items-center justify-between text-[11px] text-gray-600 border border-gray-200 rounded px-2 py-1 bg-white">
                            <span className="truncate">{file.name} ({Math.round(file.size / 1024)} KB)</span>
                            <button
                              type="button"
                              onClick={() =>
                                setExtraFiles((prev) => prev.filter((_, i) => i !== idx))
                              }
                              className="text-red-500 text-xs ml-2 hover:text-red-700"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </label>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-gray-600">
                <span className="text-gray-500">{messageContent.length} / 1000 caracteres</span>
              </div>
            </div>
            )}

            {/* 3. Destinatarios */}
            {step === 3 && (
            <div className="space-y-3 border border-gray-200 rounded-lg p-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-gray-900">3. Destinatarios</h2>
                {(selectedUserIds.length > 0 || selectedStudentIds.length > 0 || selectedGroups.length > 0) && (
                  <span className="text-xs text-gray-600">
                    {selectedUserIds.length + selectedStudentIds.length} persona(s) • {selectedGroups.length} grupo(s)
                  </span>
                )}
              </div>

              <div className="space-y-4">
                <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-500">Grupos</p>
                      <p className="text-sm font-semibold text-gray-900">Selecciona grupos</p>
                    </div>
                    <span className="text-xs text-gray-500">{filteredGroups.length} encontrados</span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <input
                      type="search"
                      value={groupSearch}
                      onChange={(e) => setGroupSearch(e.target.value)}
                      placeholder="Buscar grupo"
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200"
                    />
                    <span className="text-xs text-gray-500">
                      Seleccionados: {selectedGroups.length}
                    </span>
                  </div>
                  {loadingGroups && <p className="text-sm text-gray-500">Cargando grupos...</p>}
                  {groupsError && <p className="text-sm text-red-600">{groupsError}</p>}
                  {!loadingGroups && !groupsError && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {filteredGroups.map((grp) => (
                        <label
                          key={grp.id}
                          className={`flex items-center gap-2 text-sm text-gray-700 border rounded-lg px-3 py-2 cursor-pointer transition ${
                            selectedGroups.includes(grp.id)
                              ? 'border-primary bg-primary/10'
                              : 'border-gray-200 hover:border-primary'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="text-primary"
                            checked={selectedGroups.includes(grp.id)}
                            onChange={() => toggleGroup(grp.id)}
                          />
                          <div className="flex-1">
                            <p className="font-medium text-gray-900">{grp.name}</p>
                            <p className="text-xs text-gray-500">{grp.memberIds?.length || 0} miembro(s)</p>
                          </div>
                        </label>
                      ))}
                      {!groups.length && (
                        <p className="text-sm text-gray-500 col-span-2">No hay grupos disponibles.</p>
                      )}
                      {groups.length > 0 && !filteredGroups.length && (
                        <p className="text-sm text-gray-500 col-span-2">Sin coincidencias para la búsqueda.</p>
                      )}
                    </div>
                  )}
                </div>

                <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm space-y-3">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div className="w-full">
                      <p className="text-xs uppercase tracking-wide text-gray-500">Estudiantes</p>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <input
                          type="search"
                          value={studentSearch}
                          onChange={(e) => setStudentSearch(e.target.value)}
                          placeholder="Buscar por nombre, curso o email"
                          className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200"
                        />
                        <button
                          type="button"
                          onClick={toggleSelectStudents}
                          className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-800 font-semibold hover:border-primary hover:text-primary transition-colors shadow-sm"
                        >
                          {paginatedStudents.length &&
                          paginatedStudents.every((u) => selectedStudentIds.includes(u.id))
                            ? 'Deseleccionar visibles'
                            : 'Seleccionar visibles'}
                        </button>
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 flex flex-col items-start sm:items-end">
                      <span>{studentsTotal} total</span>
                      <span>Mostrando página {studentPage} de {studentTotalPages}</span>
                    </div>
                  </div>

                  {loadingStudents && <p className="text-sm text-gray-500">Cargando estudiantes...</p>}
                  {studentsError && <p className="text-sm text-red-600">{studentsError}</p>}
                  {!loadingStudents && !studentsError && (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-auto pr-1">
                        {paginatedStudents.map((s) => (
                          <label
                            key={s.id}
                            className={`flex items-center gap-2 text-sm text-gray-700 border rounded-lg px-3 py-2 cursor-pointer transition ${
                              selectedStudentIds.includes(s.id)
                                ? 'border-primary bg-primary/10'
                                : 'border-gray-200 hover:border-primary'
                            }`}
                          >
                            <input
                              type="checkbox"
                              className="text-primary"
                              checked={selectedStudentIds.includes(s.id)}
                              onChange={() => toggleStudent(s.id)}
                            />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-gray-900 truncate">
                                {`${s.firstName || ''} ${s.lastNameFather || ''} ${s.lastNameMother || ''}`.trim() || 'Sin nombre'}
                              </p>
                              <p className="text-xs text-gray-500 truncate">
                                {s.email || 'Sin correo'} {s.course ? `• ${s.course}` : ''} {s.year ? `• ${s.year}` : ''}
                              </p>
                            </div>
                          </label>
                        ))}
                        {!students.length && (
                          <p className="text-sm text-gray-500 col-span-2">No hay estudiantes disponibles.</p>
                        )}
                        {studentsTotal > 0 && !paginatedStudents.length && (
                          <p className="text-sm text-gray-500 col-span-2">Sin coincidencias para la búsqueda.</p>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-3 text-sm text-gray-600">
                        <button
                          type="button"
                          disabled={studentPage <= 1}
                          onClick={() => setStudentPage((p) => Math.max(1, p - 1))}
                          className="px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-50"
                        >
                          Anterior
                        </button>
                        <span>Página {studentPage} de {studentTotalPages}</span>
                        <button
                          type="button"
                          disabled={studentPage >= studentTotalPages}
                          onClick={() => setStudentPage((p) => Math.min(studentTotalPages, p + 1))}
                          className="px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-50"
                        >
                          Siguiente
                        </button>
                      </div>
                    </>
                  )}
                </div>

                <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm space-y-3">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div className="w-full">
                      <p className="text-xs uppercase tracking-wide text-gray-500">Usuarios</p>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <input
                          type="search"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder="Buscar por nombre o email"
                          className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200"
                        />
                        <button
                          type="button"
                          onClick={toggleSelectFiltered}
                          className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-800 font-semibold hover:border-primary hover:text-primary transition-colors shadow-sm"
                        >
                          {paginatedUsers.length &&
                          paginatedUsers.every((u) => selectedUserIds.includes(u.id))
                            ? 'Deseleccionar visibles'
                            : 'Seleccionar visibles'}
                        </button>
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 flex flex-col items-start sm:items-end">
                      <span>{filteredUsers.length} resultado(s)</span>
                      <span>Mostrando página {userPage} de {userTotalPages}</span>
                    </div>
                  </div>

                  {loadingUsers && <p className="text-sm text-gray-500">Cargando usuarios...</p>}
                  {usersError && <p className="text-sm text-red-600">{usersError}</p>}
                  {!loadingUsers && !usersError && (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-auto pr-1">
                        {paginatedUsers.map((u) => (
                          <label
                            key={u.id}
                            className={`flex items-center gap-2 text-sm text-gray-700 border rounded-lg px-3 py-2 cursor-pointer transition ${
                              selectedUserIds.includes(u.id)
                                ? 'border-primary bg-primary/10'
                                : 'border-gray-200 hover:border-primary'
                            }`}
                          >
                            <input
                              type="checkbox"
                              className="text-primary"
                              checked={selectedUserIds.includes(u.id)}
                              onChange={() => toggleUser(u.id)}
                            />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-gray-900 truncate">{u.name}</p>
                              <p className="text-xs text-gray-500 truncate">{u.email}</p>
                            </div>
                          </label>
                        ))}
                        {!users.length && (
                          <p className="text-sm text-gray-500 col-span-2">No hay usuarios disponibles.</p>
                        )}
                        {users.length > 0 && !filteredUsers.length && (
                          <p className="text-sm text-gray-500 col-span-2">Sin coincidencias para la búsqueda.</p>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-3 text-sm text-gray-600">
                        <button
                          type="button"
                          disabled={userPage <= 1}
                          onClick={() => setUserPage((p) => Math.max(1, p - 1))}
                          className="px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-50"
                        >
                          Anterior
                        </button>
                        <span>Página {userPage} de {userTotalPages}</span>
                        <button
                          type="button"
                          disabled={userPage >= userTotalPages}
                          onClick={() => setUserPage((p) => Math.min(userTotalPages, p + 1))}
                          className="px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-50"
                        >
                          Siguiente
                        </button>
                      </div>
                    </>
                  )}
                </div>

                <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-gray-900 text-sm">
                      Destinatarios seleccionados ({allSelectedRecipients.length + selectedGroups.length})
                    </p>
                    {!!(allSelectedRecipients.length + selectedGroups.length) && (
                      <button
                        type="button"
                        className="text-xs text-red-600 hover:text-red-700"
                        onClick={() => {
                          setSelectedUserIds([]);
                          setSelectedStudentIds([]);
                          setSelectedGroups([]);
                        }}
                      >
                        Limpiar selección
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {selectedGroupRecipients.map((g) => (
                      <span
                        key={`group-${g.id}`}
                        className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs border border-primary/30"
                      >
                        <span className="font-semibold truncate">{g.name}</span>
                        <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded">Grupo</span>
                        <button
                          type="button"
                          className="text-primary hover:text-primary-dark"
                          onClick={() => toggleGroup(g.id)}
                          aria-label="Eliminar grupo"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                    {allSelectedRecipients.map((rec) => (
                      <span
                        key={rec.id}
                        className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs border border-blue-100"
                      >
                        <span className="font-semibold truncate">{rec.label}</span>
                        {rec.email && <span className="text-blue-500 truncate">{rec.email}</span>}
                        <span className="text-[10px] text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded">{rec.type}</span>
                        <button
                          type="button"
                          className="text-blue-500 hover:text-blue-700"
                          onClick={() => {
                            if (rec.id.startsWith('user-')) {
                              const id = rec.id.replace('user-', '');
                              toggleUser(id);
                            } else {
                              const id = rec.id.replace('student-', '');
                              toggleStudent(id);
                            }
                          }}
                          aria-label="Eliminar destinatario"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                    {!allSelectedRecipients.length && !selectedGroupRecipients.length && (
                      <span className="text-xs text-gray-500">Aún no seleccionas destinatarios.</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
            )}

            {/* 4. Canales y programación */}
            {step === 4 && (
            <div className="space-y-4 border border-gray-200 rounded-lg p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900">4. Canales y programación</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className={`flex items-center gap-2 border rounded-lg px-3 py-2 cursor-pointer transition ${channels.includes('email') ? 'border-primary bg-green-50' : 'border-gray-200 hover:border-primary'}`}>
                  <input
                    type="checkbox"
                    name="channel-email"
                    value="email"
                    checked={channels.includes('email')}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setChannels((prev) => {
                        const next = new Set(prev);
                        if (checked) next.add('email');
                        else next.delete('email');
                        return Array.from(next);
                      });
                    }}
                    className="text-primary"
                  />
                  <span className="flex items-center gap-1">
                    <span className="text-lg">📧</span>
                    <span>Email</span>
                  </span>
                </label>
                <label className={`flex items-center gap-2 border rounded-lg px-3 py-2 cursor-pointer transition ${channels.includes('app') ? 'border-primary bg-green-50' : 'border-gray-200 hover:border-primary'}`}>
                  <input
                    type="checkbox"
                    name="channel-app"
                    value="app"
                    checked={channels.includes('app')}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setChannels((prev) => {
                        const next = new Set(prev);
                        if (checked) next.add('app');
                        else next.delete('app');
                        return Array.from(next);
                      });
                    }}
                    className="text-primary"
                  />
                  <span className="flex items-center gap-1">
                    <span className="text-lg">📲</span>
                    <span>Notiflow App</span>
                  </span>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="flex items-start gap-3 border rounded-lg p-3 cursor-pointer hover:border-primary transition">
                  <input
                    type="radio"
                    name="schedule"
                    value="now"
                    checked={sendMode === 'now'}
                    onChange={() => setSendMode('now')}
                    className="w-4 h-4 text-primary mt-1"
                  />
                  <div>
                    <p className="font-medium text-gray-900">Enviar ahora</p>
                    <p className="text-sm text-gray-600">Salida inmediata a los canales seleccionados.</p>
                  </div>
                </label>
                <label className="flex items-start gap-3 border rounded-lg p-3 cursor-pointer hover:border-primary transition">
                  <input
                    type="radio"
                    name="schedule"
                    value="schedule"
                    checked={sendMode === 'schedule'}
                    onChange={() => setSendMode('schedule')}
                    className="w-4 h-4 text-primary mt-1"
                  />
                  <div className="w-full">
                    <p className="font-medium text-gray-900">Programar</p>
                    <p className="text-sm text-gray-600 mb-2">Define fecha y hora para enviar.</p>
                    {sendMode === 'schedule' && (
                      <input
                        type="datetime-local"
                        value={scheduleAt}
                        onChange={(e) => setScheduleAt(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200"
                        required
                      />
                    )}
                  </div>
                </label>
              </div>
            </div>
            )}

            {/* 5. Resumen */}
            {step === 5 && (
              <div className="space-y-3 border border-gray-200 rounded-lg p-4 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900">5. Resumen</h2>
                <div className="space-y-2 text-sm text-gray-700">
                  <div>
                    <p className="font-semibold text-gray-900">Motivo</p>
                    <p className="text-gray-700">{reason || '—'}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">Contenido</p>
                    <div className="text-gray-700 whitespace-pre-wrap leading-relaxed">
                      {renderRich(messageContent) || '—'}
                    </div>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">
                      Destinatarios ({allSelectedRecipients.length + selectedGroupRecipients.length})
                    </p>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {selectedGroupRecipients.map((g) => (
                        <span key={`summary-group-${g.id}`} className="px-2 py-1 rounded-full bg-primary/10 text-primary text-xs">
                          {g.name || g.id} (grupo)
                        </span>
                      ))}
                      {allSelectedRecipients.map((rec) => (
                        <span key={rec.id} className="px-2 py-1 rounded-full bg-blue-50 text-blue-700 text-xs">
                          {rec.email || rec.label}
                        </span>
                      ))}
                      {!allSelectedRecipients.length && !selectedGroupRecipients.length && (
                        <span className="text-gray-500 text-xs">—</span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="text-xs font-semibold text-gray-900">Canales:</span>
                    {channels.map((c) => (
                      <span key={c} className="px-2 py-1 rounded-full bg-blue-50 text-blue-700 text-xs">
                        {c === 'email' ? 'Email' : 'Notiflow App'}
                      </span>
                    ))}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">Programación</p>
                    <p className="text-gray-700">
                      {sendMode === 'now' ? 'Enviar ahora' : scheduleAt ? `Programado para ${scheduleAt}` : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">Adjuntos</p>
                    <ul className="list-disc list-inside text-gray-700 space-y-1">
                      {attachedFile ? (
                        <li>Imagen inline: {attachedFile.name} ({Math.round(attachedFile.size / 1024)} KB)</li>
                      ) : (
                        <li>Sin imagen inline</li>
                      )}
                      {extraFiles.length > 0 ? (
                        extraFiles.map((f, idx) => (
                          <li key={`${f.name}-${idx}`}>Archivo: {f.name} ({Math.round(f.size / 1024)} KB)</li>
                        ))
                      ) : (
                        <li>Sin otros archivos</li>
                      )}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* Controles de navegación */}
            <div className="flex flex-col sm:flex-row gap-3 pt-1">
              {step > 1 && (
                <button
                  type="button"
                  onClick={prevStep}
                  className="w-full sm:flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
                >
                  ← Anterior
                </button>
              )}
              {step < 5 && (
                <button
                  type="button"
                  onClick={nextStep}
                    className="w-full sm:flex-1 px-6 py-3 bg-primary text-white rounded-lg font-semibold hover:bg-primary-dark transition-colors"
                >
                  Siguiente →
                </button>
              )}
              {step === 5 && (
                <>
                  <button
                    type="submit"
                    disabled={sendLoading}
                    className={`w-full sm:flex-1 px-6 py-3 bg-primary text-white rounded-lg font-semibold transition-colors ${
                      sendLoading ? 'opacity-70 cursor-not-allowed' : 'hover:bg-primary-dark'
                    }`}
                  >
                    {sendLoading
                      ? 'Enviando...'
                      : sendMode === 'now'
                        ? 'Enviar Mensaje'
                        : 'Programar Mensaje'}
                  </button>
                  <Link
                    href="/messages"
                    className="w-full sm:flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-colors text-center"
                  >
                    Cancelar
                  </Link>
                </>
              )}
            </div>
          </form>
        </div>
      </div>

      <Modal
        isOpen={showTemplatesModal}
        title="Seleccionar plantilla"
        size="xl"
        onClose={() => setShowTemplatesModal(false)}
        onConfirm={() => setShowTemplatesModal(false)}
        confirmText="Cerrar"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Elige una plantilla para rellenar el mensaje o crea una nueva.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-72 overflow-auto pr-1">
            {templates.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => {
                  handleApplyTemplate(tpl.id);
                  setShowTemplatesModal(false);
                }}
                className={`text-left border rounded-lg p-3 hover:border-primary transition-colors ${
                  selectedTemplate === tpl.id ? 'border-primary bg-green-50' : 'border-gray-200'
                }`}
              >
                <p className="font-semibold text-gray-900 mb-1">{tpl.name}</p>
                <p className="text-sm text-gray-600 line-clamp-3">{tpl.content}</p>
                <div className="flex items-center gap-2 mt-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartEdit(tpl);
                    }}
                    className="text-xs text-primary hover:underline"
                  >
                    Editar
                  </button>
                  <span className="text-gray-300">•</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteTemplate(tpl.id);
                    }}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Borrar
                  </button>
                </div>
              </button>
            ))}
            {!templates.length && (
              <p className="text-sm text-gray-500 col-span-2">No hay plantillas aún.</p>
            )}
          </div>
          <div className="border border-dashed border-gray-300 rounded-xl p-4 sm:p-5 bg-gray-50/70 shadow-sm grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
            <div className="sm:col-span-2 space-y-3">
              <p className="font-semibold text-gray-900 text-sm">Atajos rápidos (rellenan el texto):</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                <button
                  type="button"
                  onClick={() => setNewTemplateContent((v) => v + '{{nombre}}')}
                  className="flex items-center justify-between px-3 py-2 border border-gray-200 rounded-lg hover:border-primary transition"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">👤</span>
                    <div className="text-left">
                      <p className="font-semibold text-gray-900 text-sm">Nombre de destinatario</p>
                      <p className="text-xs text-gray-500">Inserta el nombre</p>
                    </div>
                  </div>
                  <span className="text-xs text-gray-500">{'{{nombre}}'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setNewTemplateContent((v) => v + '{{curso}}')}
                  className="flex items-center justify-between px-3 py-2 border border-gray-200 rounded-lg hover:border-primary transition"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">🏫</span>
                    <div className="text-left">
                      <p className="font-semibold text-gray-900 text-sm">Curso / nivel</p>
                      <p className="text-xs text-gray-500">Curso del alumno</p>
                    </div>
                  </div>
                  <span className="text-xs text-gray-500">{'{{curso}}'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setNewTemplateContent((v) => v + '{{fecha}}')}
                  className="flex items-center justify-between px-3 py-2 border border-gray-200 rounded-lg hover:border-primary transition"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">📅</span>
                    <div className="text-left">
                      <p className="font-semibold text-gray-900 text-sm">Fecha actual</p>
                      <p className="text-xs text-gray-500">Fecha de envío</p>
                    </div>
                  </div>
                  <span className="text-xs text-gray-500">{'{{fecha}}'}</span>
                </button>
              </div>
            </div>
            <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre de plantilla
                </label>
                <input
                  type="text"
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  placeholder="Ej: Comunicado general, Aviso feriado"
                  className="w-full px-4 py-3 border rounded-lg text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contenido (usa placeholders: {'{{nombre}}'}, {'{{curso}}'}, {'{{fecha}}'})
                </label>
                <textarea
                  value={newTemplateContent}
                  onChange={(e) => setNewTemplateContent(e.target.value)}
                  placeholder="Redacta tu plantilla. Ej: Hola {{nombre}}, te informamos que..."
                  className="w-full px-4 py-3 border rounded-lg text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200 resize-none h-32 sm:h-36"
                />
              </div>
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <button
                type="button"
                onClick={handleAddTemplate}
                className="px-5 py-2.5 bg-primary text-white rounded-lg font-semibold hover:bg-primary-dark transition-colors"
              >
                Agregar plantilla
              </button>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showEditModal}
        title="Editar plantilla"
        onClose={handleCancelEdit}
        onConfirm={handleSaveEdit}
        confirmText="Guardar cambios"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contenido</label>
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200 resize-none h-28"
            />
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!deleteTarget}
        title="Eliminar plantilla"
        onClose={handleCancelDelete}
        onConfirm={handleConfirmDelete}
        confirmText="Eliminar"
      >
        <p className="text-sm text-gray-700">
          ¿Deseas eliminar la plantilla{' '}
          <span className="font-semibold">{deleteTarget?.name}</span>? Esta acción no se puede deshacer.
        </p>
      </Modal>
    </ProtectedLayout>
  );
}
