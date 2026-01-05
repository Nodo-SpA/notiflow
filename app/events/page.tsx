'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ProtectedLayout } from '@/components/layout/ProtectedLayout';
import { Card, Button, Input, TextArea, Select, Modal } from '@/components/ui';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/store';
import { EventItem, EventType } from '@/types';
import {
  FiCalendar,
  FiClock,
  FiUsers,
  FiLayers,
  FiPlus,
  FiX,
  FiChevronLeft,
  FiChevronRight,
  FiAlertTriangle,
} from 'react-icons/fi';
import clsx from 'clsx';

const formatDate = (value?: string) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
};

export default function EventsPage() {
  const user = useAuthStore((state) => state.user);
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const role = (user?.role || '').toUpperCase();
  const canCreate =
    role === 'SUPERADMIN' || role === 'ADMIN' || role === 'TEACHER' || hasPermission('events.create');
  const today = useMemo(() => new Date(), []);
  const currentYear = today.getFullYear();

  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState<Date | null>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  });

  const [events, setEvents] = useState<EventItem[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [eventsError, setEventsError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<EventItem | null>(null);

  // Form
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDateTime, setStartDateTime] = useState('');
  const [endDateTime, setEndDateTime] = useState('');
  const [eventType, setEventType] = useState<EventType>('colegio');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);

  // Recipients data
  const [users, setUsers] = useState<{ id: string; name: string; email?: string; badge?: string }[]>([]);
  const [groups, setGroups] = useState<{ id: string; name: string; memberIds?: string[] }[]>([]);
  const [students, setStudents] = useState<{ id: string; name: string; email?: string }[]>([]);
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  const [recipientSearch, setRecipientSearch] = useState('');
  const [groupSearch, setGroupSearch] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [showUpcomingOnly, setShowUpcomingOnly] = useState(true);
  const normalizeEventType = (rawType?: string): EventType =>
    rawType === 'general'
      ? 'colegio'
      : rawType === 'schedule'
      ? 'evaluacion'
      : (rawType as EventType) || 'colegio';

  const normalizeEvent = (ev: any): EventItem => {
    const audienceUserIds = ev.audienceUserIds || ev.audience?.userIds || [];
    const audienceGroupIds = ev.audienceGroupIds || ev.audience?.groupIds || [];
    return {
      ...ev,
      audience: { userIds: audienceUserIds, groupIds: audienceGroupIds },
      audienceUserIds,
      audienceGroupIds,
    };
  };

  const loadEvents = async () => {
    setLoadingEvents(true);
    setEventsError('');
    try {
      const res = await apiClient.getEvents();
      const data = ((res.data || []) as EventItem[]).map(normalizeEvent);
      setEvents(data);
    } catch (err: any) {
      // fallback local data para no bloquear la UI
      const sample: EventItem[] = [
        {
          id: 'sample-1',
          title: 'Reunión de apoderados',
          description: 'Revisión de avances y notas del trimestre.',
          startDateTime: new Date().toISOString(),
          endDateTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          type: 'reunion',
          createdByName: 'Coordinación',
        },
        {
          id: 'sample-2',
          title: 'Horario de Matemáticas 4°B',
          description: 'Clases semanales de matemáticas (horario escolar).',
          startDateTime: new Date().toISOString(),
          type: 'evaluacion',
          createdByName: 'Prof. Gómez',
        },
      ];
      setEvents(sample.map(normalizeEvent));
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        'No pudimos cargar los eventos';
      setEventsError(msg);
    } finally {
      setLoadingEvents(false);
    }
  };

  const loadRecipients = async () => {
    setLoadingRecipients(true);
    try {
      const [usersRes, groupsRes, studentsRes] = await Promise.allSettled([
        apiClient.getUsers(),
        apiClient.getGroups(),
        apiClient.getStudents({ page: 1, pageSize: 500, schoolId: user?.schoolId || undefined }),
      ]);
      if (usersRes.status === 'fulfilled') {
        const u = usersRes.value.data || [];
        setUsers(u.map((x: any) => ({ ...x, badge: 'Usuario' })));
      }
      if (groupsRes.status === 'fulfilled') {
        const data = groupsRes.value.data || [];
        setGroups((data as any).items ?? data ?? []);
      }
      if (studentsRes && studentsRes.status === 'fulfilled') {
        const data = (studentsRes.value as any)?.data || {};
        const items = data.items || [];
        setStudents(
          items.map((s: any) => ({
            id: s.id,
            name: `${s.firstName || ''} ${s.lastNameFather || ''} ${s.lastNameMother || ''}`.trim(),
            email: s.email,
          }))
        );
      }
    } finally {
      setLoadingRecipients(false);
    }
  };

  useEffect(() => {
    loadEvents();
    loadRecipients();
  }, []);

  const filteredEvents = useMemo(() => {
    const term = search.toLowerCase();
    const eventsThisYear = events.filter((ev) => {
      const d = new Date(ev.startDateTime || ev.createdAt || '');
      if (Number.isNaN(d.getTime())) return false;
      return d.getFullYear() === currentYear;
    });
    return eventsThisYear
      .filter((ev) => {
        const matchesTerm =
          !term ||
          ev.title?.toLowerCase().includes(term) ||
          ev.description?.toLowerCase().includes(term);
        const rawType = ev.type || '';
        const normalizedType = normalizeEventType(rawType);
        const matchesType = filterType === 'all' || normalizedType === filterType;
        return matchesTerm && matchesType;
      })
      .sort((a, b) => {
        const da = new Date(a.startDateTime || a.createdAt || '').getTime();
        const db = new Date(b.startDateTime || b.createdAt || '').getTime();
        return da - db;
      });
  }, [events, search, filterType, currentYear]);

  const filteredByMode = useMemo(() => {
    if (!showUpcomingOnly) return filteredEvents;
    const now = new Date();
    const in14Days = new Date();
    in14Days.setDate(now.getDate() + 14);
    return filteredEvents.filter((ev) => {
      const start = new Date(ev.startDateTime || ev.createdAt || '').getTime();
      return start >= now.getTime() - 24 * 60 * 60 * 1000 && start <= in14Days.getTime();
    });
  }, [filteredEvents, showUpcomingOnly]);

  const stats = useMemo(() => {
    const total = filteredEvents.length;
    const upcoming = filteredEvents.filter((ev) => {
      const start = new Date(ev.startDateTime || ev.createdAt || '').getTime();
      return start >= today.getTime() - 24 * 60 * 60 * 1000;
    }).length;
    const todayCount = filteredEvents.filter((ev) => {
      const start = new Date(ev.startDateTime || ev.createdAt || '');
      const sameDay =
        start.getFullYear() === today.getFullYear() &&
        start.getMonth() === today.getMonth() &&
        start.getDate() === today.getDate();
      return sameDay;
    }).length;
    return { total, upcoming, today: todayCount };
  }, [filteredEvents, today]);

  const toggleSelection = (id: string, list: string[], setter: (val: string[]) => void) => {
    if (list.includes(id)) {
      setter(list.filter((v) => v !== id));
    } else {
      setter([...list, id]);
    }
  };

  const combinedRecipients = useMemo(() => {
    const base = [
      ...students.map((s) => ({
        id: s.email || s.id,
        name: s.name,
        email: s.email,
        badge: 'Alumno',
      })),
      ...users.map((u) => ({
        id: u.email || u.id,
        name: u.name || u.email,
        email: u.email,
        badge: u.badge || 'Usuario',
      })),
    ].filter((r) => r.id);
    if (!recipientSearch.trim()) return base;
    const term = recipientSearch.toLowerCase();
    return base.filter(
      (r) =>
        (r.name || '').toLowerCase().includes(term) ||
        (r.email || '').toLowerCase().includes(term) ||
        (r.badge || '').toLowerCase().includes(term)
    );
  }, [users, students, recipientSearch]);

  const filteredGroups = useMemo(() => {
    if (!groupSearch.trim()) return groups;
    const term = groupSearch.toLowerCase();
    return groups.filter((g) => g.name.toLowerCase().includes(term));
  }, [groups, groupSearch]);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setStartDateTime('');
    setEndDateTime('');
    setEventType('colegio');
    setSelectedGroupIds([]);
    setSelectedUserIds([]);
    setEditingId(null);
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !startDateTime) return;
      setSaving(true);
    try {
      const toIso = (val: string) => {
        if (!val) return '';
        const d = new Date(val);
        return isNaN(d.getTime()) ? val : d.toISOString();
      };

      const payload: any = {
        title: title.trim(),
        description: description.trim(),
        startDateTime: toIso(startDateTime),
        endDateTime: endDateTime ? toIso(endDateTime) : undefined,
        type: eventType,
        audience: {
          userIds: selectedUserIds,
          groupIds: selectedGroupIds,
        },
      };
      if (editingId) payload.id = editingId;
      const res = await apiClient.createEvent(payload);
      const created = normalizeEvent((res.data || payload) as EventItem);
      setEvents((prev) => {
        const idx = prev.findIndex((p) => p.id === created.id);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = created;
          return copy;
        }
        return [created, ...prev];
      });
      setShowModal(false);
      resetForm();
    } catch (err) {
      // no-op: se deja la data en el formulario y se muestra alerta simple
      const anyErr = err as any;
      alert(
        anyErr?.response?.data?.message ||
          anyErr?.response?.data?.error ||
          anyErr?.message ||
          'No pudimos crear el evento. Intenta nuevamente.'
      );
    } finally {
      setSaving(false);
    }
  };

  const startDuplicate = (ev: EventItem) => {
    setTitle(ev.title || '');
    setDescription(ev.description || '');
    const start = ev.startDateTime ? new Date(ev.startDateTime) : new Date();
    start.setDate(start.getDate() + 7);
    const end = ev.endDateTime ? new Date(ev.endDateTime) : null;
    if (end) end.setDate(end.getDate() + 7);
    setStartDateTime(start.toISOString().slice(0, 16));
    setEndDateTime(end ? end.toISOString().slice(0, 16) : '');
    setEventType(normalizeEventType(ev.type));
    setSelectedGroupIds(ev.audienceGroupIds || ev.audience?.groupIds || []);
    setSelectedUserIds(ev.audienceUserIds || ev.audience?.userIds || []);
    setEditingId(null);
    setShowModal(true);
  };

  const typePill = (type?: string) => {
    if (type === 'evaluacion' || type === 'schedule') return { label: 'Evaluación', color: 'bg-purple-100 text-purple-800' };
    if (type === 'reunion') return { label: 'Reunión apoderados', color: 'bg-amber-100 text-amber-800' };
    return { label: 'Evento colegio', color: 'bg-blue-100 text-blue-800' };
  };

  const monthName = new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric' }).format(monthCursor);
  const daysMatrix = useMemo(() => {
    const start = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
    const startWeekday = start.getDay() === 0 ? 7 : start.getDay(); // 1-7
    const daysInMonth = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0).getDate();
    const cells = [];
    for (let i = 1; i < startWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(new Date(monthCursor.getFullYear(), monthCursor.getMonth(), d));
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [monthCursor]);

  const eventsByDay = useMemo(() => {
    const map: Record<string, EventItem[]> = {};
    filteredEvents.forEach((ev) => {
      const key = (ev.startDateTime || ev.createdAt || '').slice(0, 10);
      if (!map[key]) map[key] = [];
      map[key].push(ev);
    });
    return map;
  }, [filteredEvents]);

  const selectedDayKey = selectedDay ? selectedDay.toISOString().slice(0, 10) : null;
  const eventsSelectedDay = selectedDayKey ? eventsByDay[selectedDayKey] || [] : [];
  const upcomingWeek = useMemo(() => {
    const now = new Date();
    const in7 = new Date();
    in7.setDate(now.getDate() + 7);
    return filteredEvents
      .filter((ev) => {
        const start = new Date(ev.startDateTime || ev.createdAt || '').getTime();
        return start >= now.getTime() - 24 * 60 * 60 * 1000 && start <= in7.getTime();
      })
      .sort((a, b) => new Date(a.startDateTime || a.createdAt || '').getTime() - new Date(b.startDateTime || b.createdAt || '').getTime());
  }, [filteredEvents]);

  const canDeleteEvent = (ev: EventItem) => {
    const email = (user?.email || '').toLowerCase();
    const schoolId = (user?.schoolId || '').toLowerCase();
    const eventSchool = (ev.schoolId || '').toLowerCase();
    const creator = (ev.createdBy || ev.createdByEmail || '').toLowerCase();
    if (role === 'SUPERADMIN') return creator && creator === email;
    if (role === 'ADMIN') return eventSchool && schoolId && eventSchool === schoolId;
    if (role === 'TEACHER') return creator === email && eventSchool === schoolId;
    return false;
  };

  const handleDelete = async (id: string) => {
    if (deletingId) return;
    setDeletingId(id);
    setEventsError('');
    try {
      await apiClient.deleteEvent(id);
      setEvents((prev) => prev.filter((ev) => ev.id !== id));
      setPendingDelete(null);
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        'No se pudo eliminar el evento';
      setEventsError(msg);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <ProtectedLayout>
      <div className="flex flex-col gap-6">
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-sm text-gray-500">Agenda escolar</p>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
              <FiCalendar />
              Eventos y horarios
            </h1>
            <p className="text-gray-600">
              Planifica reuniones, clases especiales y actividades del colegio.
            </p>
          </div>
          {canCreate && (
            <Button onClick={() => setShowModal(true)}>
              <FiPlus />
              Nuevo evento
            </Button>
          )}
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card className="p-4 shadow-sm">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Eventos del año</p>
            <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
          </Card>
          <Card className="p-4 shadow-sm">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Próximos 14 días</p>
            <p className="text-2xl font-bold text-gray-900">{stats.upcoming}</p>
          </Card>
          <Card className="p-4 shadow-sm">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Hoy</p>
            <p className="text-2xl font-bold text-gray-900">{stats.today}</p>
          </Card>
        </div>

        {/* Calendario compacto */}
        <Card className="p-4 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
            <button
              type="button"
              className="p-2 rounded-lg hover:bg-gray-100"
              onClick={() =>
                setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))
              }
            >
              <FiChevronLeft />
            </button>
            <h3 className="text-lg font-semibold text-gray-900 capitalize">{monthName}</h3>
            <button
              type="button"
              className="p-2 rounded-lg hover:bg-gray-100"
              onClick={() =>
                setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))
              }
            >
              <FiChevronRight />
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:border-primary"
                onClick={() => {
                  const now = new Date();
                  setMonthCursor(new Date(now.getFullYear(), now.getMonth(), 1));
                  setSelectedDay(now);
                }}
              >
                Ir a hoy
              </button>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={showUpcomingOnly}
                  onChange={() => setShowUpcomingOnly((v) => !v)}
                />
                Solo próximos 14 días
              </label>
            </div>
          </div>
          <div className="grid grid-cols-7 text-center text-xs font-semibold text-gray-500 mb-2">
            {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {daysMatrix.map((d, idx) => {
              if (!d) return <div key={`empty-${idx}`} />;
              const key = d.toISOString().slice(0, 10);
              const dayEvents = eventsByDay[key] || [];
              const isSelected = selectedDayKey === key;
              return (
                <button
                  key={key}
                  onClick={() => setSelectedDay(d)}
                  onDoubleClick={() => {
                    setSelectedDay(d);
                    const iso = new Date(
                      d.getFullYear(),
                      d.getMonth(),
                      d.getDate(),
                      8,
                      0
                    )
                      .toISOString()
                      .slice(0, 16);
                    setStartDateTime(iso);
                    setShowModal(true);
                  }}
                  className={clsx(
                    'h-16 rounded-lg border text-sm flex flex-col items-center justify-center gap-1 transition-colors',
                    isSelected ? 'border-primary bg-primary/10' : 'border-gray-200 hover:bg-gray-50'
                  )}
                >
                  <span className="font-semibold text-gray-800">{d.getDate()}</span>
                  {dayEvents.length > 0 && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                      {dayEvents.length} evento(s)
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {selectedDay && (
            <div className="mt-4 flex items-center justify-between">
              <div className="text-sm text-gray-700">
                Eventos del {selectedDay.toLocaleDateString()}
                {eventsSelectedDay.length ? ` (${eventsSelectedDay.length})` : ''}
              </div>
            </div>
          )}
        </Card>

        <Card className="p-5 flex flex-col gap-4 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-sm text-gray-500">Agenda rápida</p>
              <h2 className="text-xl font-semibold text-gray-900">Próximos eventos (7 días)</h2>
              <p className="text-sm text-gray-600">Vista resumida de lo que viene esta semana.</p>
            </div>
            <div className="text-sm text-gray-600">
              {loadingEvents ? 'Cargando...' : `${upcomingWeek.length} evento(s) próximos`}
            </div>
          </div>
          {eventsError && <p className="text-sm text-red-600">{eventsError}</p>}
          <div className="space-y-3">
            {upcomingWeek.length === 0 && (
              <div className="p-3 rounded-lg bg-gray-50 text-sm text-gray-600">
                No hay eventos programados para los próximos 7 días.
              </div>
            )}
            {upcomingWeek.map((ev) => {
              const pill = typePill(ev.type);
              return (
                <div
                  key={ev.id}
                  className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border border-gray-200 rounded-lg p-3 hover:border-primary/50 transition-colors"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-gray-500">{formatDate(ev.startDateTime)}</span>
                      <span className={clsx('px-2 py-0.5 rounded-full text-xs font-semibold', pill.color)}>
                        {pill.label}
                      </span>
                    </div>
                    <p className="text-base font-semibold text-gray-900">{ev.title || 'Sin título'}</p>
                    <p className="text-sm text-gray-600 line-clamp-2">{ev.description || 'Sin descripción'}</p>
                  </div>
                  {canDeleteEvent(ev) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (confirm('¿Eliminar este evento?')) handleDelete(ev.id);
                      }}
                      disabled={deletingId === ev.id}
                    >
                      {deletingId === ev.id ? 'Eliminando...' : 'Eliminar'}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {(selectedDayKey ? eventsSelectedDay : filteredByMode).map((ev) => {
            const pill = typePill(ev.type);
            return (
              <Card key={ev.id} className="p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{ev.title}</h3>
                    {ev.createdByName && (
                      <p className="text-sm text-gray-600">Creado por {ev.createdByName}</p>
                    )}
                  </div>
                  <span className={clsx('px-3 py-1 rounded-full text-xs font-semibold', pill.color)}>
                    {pill.label}
                  </span>
                </div>
                <p className="text-gray-700">{ev.description || 'Sin descripción'}</p>
                <div className="flex flex-wrap gap-4 text-sm text-gray-700">
                  <div className="flex items-center gap-2">
                    <FiClock className="text-primary" />
                    <div>
                      <div className="font-semibold">{formatDate(ev.startDateTime)}</div>
                      {ev.endDateTime && <div className="text-gray-500">Hasta {formatDate(ev.endDateTime)}</div>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <FiUsers className="text-primary" />
                    <span>
                      {(ev.audienceUserIds || ev.audience?.userIds || []).length} personas • {(ev.audienceGroupIds || ev.audience?.groupIds || []).length} grupos
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-2 text-xs text-gray-600">
                    {(ev.audienceGroupIds || ev.audience?.groupIds || []).slice(0, 3).map((g) => (
                      <span key={g} className="px-2 py-1 bg-gray-100 rounded-full">{g}</span>
                    ))}
                    {(ev.audienceGroupIds || ev.audience?.groupIds || []).length > 3 && (
                      <span className="px-2 py-1 bg-gray-50 rounded-full">
                        +{(ev.audienceGroupIds || ev.audience?.groupIds || []).length - 3} grupos
                      </span>
                    )}
                  </div>
                  {canCreate && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => startDuplicate(ev)}
                      >
                        Duplicar
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setTitle(ev.title || '');
                          setDescription(ev.description || '');
                          setStartDateTime(ev.startDateTime?.slice(0, 16) || '');
                          setEndDateTime(ev.endDateTime?.slice(0, 16) || '');
                          setEventType(normalizeEventType(ev.type));
                          setSelectedGroupIds(ev.audienceGroupIds || ev.audience?.groupIds || []);
                          setSelectedUserIds(ev.audienceUserIds || ev.audience?.userIds || []);
                          setEditingId(ev.id || null);
                          setShowModal(true);
                        }}
                      >
                        Editar borrador
                      </Button>
                      {canDeleteEvent(ev) && (
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => setPendingDelete(ev)}
                          disabled={deletingId === ev.id}
                        >
                          {deletingId === ev.id ? 'Eliminando...' : 'Eliminar'}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
          {!loadingEvents && !filteredEvents.length && (
            <Card className="p-6 text-center text-gray-600">
              No hay eventos en la agenda todavía.
            </Card>
          )}
        </div>

        <Modal
          isOpen={!!pendingDelete}
          onClose={() => {
            if (!deletingId) setPendingDelete(null);
          }}
          title="Eliminar evento"
          size="sm"
        >
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-600">
                <FiAlertTriangle />
              </span>
              <div>
                <p className="text-gray-900 font-semibold">¿Eliminar evento?</p>
                <p className="text-sm text-gray-600">Esta acción no se puede deshacer.</p>
              </div>
            </div>
            <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
              <span className="font-semibold">{pendingDelete?.title || 'Evento sin título'}</span>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setPendingDelete(null)} disabled={!!deletingId}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                onClick={() => pendingDelete && handleDelete(pendingDelete.id)}
                disabled={!!deletingId}
              >
                {deletingId ? 'Eliminando...' : 'Eliminar'}
              </Button>
            </div>
          </div>
        </Modal>

        <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Crear evento" size="xl">
          <form className="space-y-6" onSubmit={handleCreateEvent}>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-500">Nuevo evento</p>
                    <h3 className="text-xl font-bold text-gray-900">Detalles</h3>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span className="px-2 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
                      {eventType === 'colegio'
                        ? 'Evento del colegio'
                        : eventType === 'evaluacion'
                        ? 'Evaluación'
                        : 'Reunión de apoderados'}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Input
                    label="Título del evento"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    placeholder="Ej: Reunión de apoderados"
                  />
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: 'colegio', label: 'Evento del colegio' },
                      { value: 'evaluacion', label: 'Evaluación' },
                      { value: 'reunion', label: 'Reunión de apoderados' },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setEventType(opt.value as EventType)}
                        className={`px-3 py-1.5 rounded-full border text-sm ${
                          eventType === opt.value
                            ? 'bg-primary text-white border-primary'
                            : 'border-gray-200 text-gray-700 hover:border-primary'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-gray-700">Inicio</label>
                    <input
                      type="datetime-local"
                      value={startDateTime}
                      onChange={(e) => setStartDateTime(e.target.value)}
                      required
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-gray-700">Fin (opcional)</label>
                    <input
                      type="datetime-local"
                      value={endDateTime}
                      onChange={(e) => setEndDateTime(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200"
                    />
                  </div>
                </div>

                <TextArea
                  label="Descripción"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Agrega detalles útiles (sala, material, recordatorios...)"
                  rows={3}
                />
              </div>

              <div className="lg:col-span-5 space-y-4">
                <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-gray-900 font-semibold">
                      <FiUsers />
                      Destinatarios (opcional)
                    </div>
                    <span className="text-xs text-gray-500">
                      {selectedUserIds.length + selectedGroupIds.length} seleccionados
                    </span>
                  </div>
                  <input
                    type="search"
                    value={recipientSearch}
                    onChange={(e) => setRecipientSearch(e.target.value)}
                    placeholder="Buscar por nombre o correo"
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200"
                  />
                  <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                    {loadingRecipients && <p className="text-sm text-gray-500">Cargando...</p>}
                    {!loadingRecipients &&
                      combinedRecipients.map((u) => (
                        <label
                          key={u.id}
                          className="flex items-center gap-3 text-sm cursor-pointer bg-white border border-gray-200 rounded-lg px-3 py-2 hover:border-primary transition"
                        >
                          <input
                            type="checkbox"
                            checked={selectedUserIds.includes(u.id)}
                            onChange={() => toggleSelection(u.id, selectedUserIds, setSelectedUserIds)}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-gray-800 truncate">{u.name || u.email}</p>
                            <p className="text-xs text-gray-500 truncate">{u.email}</p>
                          </div>
                          <span className="text-[11px] px-2 py-1 rounded-full border border-gray-200 bg-gray-50 text-gray-600">
                            {u.badge}
                          </span>
                        </label>
                      ))}
                  </div>
                  {selectedUserIds.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {selectedUserIds.map((id) => {
                        const u = combinedRecipients.find((x) => x.id === id);
                        return (
                          <span
                            key={id}
                            className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs"
                          >
                            {u?.name || u?.email || id}
                            <button type="button" onClick={() => toggleSelection(id, selectedUserIds, setSelectedUserIds)}>
                              <FiX size={12} />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between text-sm font-semibold text-gray-900">
                    <span>Grupos</span>
                    <span className="text-xs text-gray-500">{filteredGroups.length} disponibles</span>
                  </div>
                  <input
                    type="search"
                    value={groupSearch}
                    onChange={(e) => setGroupSearch(e.target.value)}
                    placeholder="Buscar grupo"
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200"
                  />
                  <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                    {loadingRecipients && <p className="text-sm text-gray-500">Cargando...</p>}
                    {!loadingRecipients &&
                      filteredGroups.map((g) => (
                        <label
                          key={g.id}
                          className="flex items-center gap-3 text-sm cursor-pointer bg-white border border-gray-200 rounded-lg px-3 py-2 hover:border-primary transition"
                        >
                          <input
                            type="checkbox"
                            checked={selectedGroupIds.includes(g.id)}
                            onChange={() => toggleSelection(g.id, selectedGroupIds, setSelectedGroupIds)}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-gray-800 truncate">{g.name}</p>
                            <p className="text-xs text-gray-500 truncate">{g.memberIds?.length || 0} miembros</p>
                          </div>
                        </label>
                      ))}
                  </div>
                  {selectedGroupIds.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {selectedGroupIds.map((id) => {
                        const g = groups.find((x) => x.id === id);
                        return (
                          <span
                            key={id}
                            className="inline-flex items-center gap-1 bg-primary/15 text-primary px-3 py-1 rounded-full text-xs"
                          >
                            {g?.name || id}
                            <button type="button" onClick={() => toggleSelection(id, selectedGroupIds, setSelectedGroupIds)}>
                              <FiX size={12} />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="primary" type="submit" disabled={saving || !title.trim() || !startDateTime} className="min-w-[160px]">
                {saving ? 'Guardando...' : 'Guardar evento'}
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    </ProtectedLayout>
  );
}
