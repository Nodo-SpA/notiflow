'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ProtectedLayout } from '@/components/layout/ProtectedLayout';
import { Card, Button, Input, TextArea, Select, Modal } from '@/components/ui';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/store';
import { EventItem } from '@/types';
import {
  FiCalendar,
  FiClock,
  FiUsers,
  FiLayers,
  FiPlus,
  FiX,
  FiSearch,
  FiChevronLeft,
  FiChevronRight,
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

  // Form
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDateTime, setStartDateTime] = useState('');
  const [endDateTime, setEndDateTime] = useState('');
  const [eventType, setEventType] = useState<'colegio' | 'evaluacion' | 'reunion'>('colegio');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);

  // Recipients data
  const [users, setUsers] = useState<{ id: string; name: string; email?: string }[]>([]);
  const [groups, setGroups] = useState<{ id: string; name: string; memberIds?: string[] }[]>([]);
  const [loadingRecipients, setLoadingRecipients] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [showUpcomingOnly, setShowUpcomingOnly] = useState(true);

  const loadEvents = async () => {
    setLoadingEvents(true);
    setEventsError('');
    try {
      const res = await apiClient.getEvents();
      const data = (res.data || []) as EventItem[];
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
          type: 'general',
          createdByName: 'Coordinación',
        },
        {
          id: 'sample-2',
          title: 'Horario de Matemáticas 4°B',
          description: 'Clases semanales de matemáticas (horario escolar).',
          startDateTime: new Date().toISOString(),
          type: 'schedule',
          createdByName: 'Prof. Gómez',
        },
      ];
      setEvents(sample);
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
      const [usersRes, groupsRes] = await Promise.allSettled([
        apiClient.getUsers(),
        apiClient.getGroups(),
      ]);
      if (usersRes.status === 'fulfilled') setUsers(usersRes.value.data || []);
      if (groupsRes.status === 'fulfilled') {
        const data = groupsRes.value.data || [];
        setGroups((data as any).items ?? data ?? []);
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
    return events
      .filter((ev) => {
        const matchesTerm =
          !term ||
          ev.title?.toLowerCase().includes(term) ||
          ev.description?.toLowerCase().includes(term);
        const rawType = ev.type || '';
        const normalizedType =
          rawType === 'general' ? 'colegio' : rawType === 'schedule' ? 'evaluacion' : rawType;
        const matchesType = filterType === 'all' || normalizedType === filterType;
        return matchesTerm && matchesType;
      })
      .sort((a, b) => {
        const da = new Date(a.startDateTime || a.createdAt || '').getTime();
        const db = new Date(b.startDateTime || b.createdAt || '').getTime();
        return da - db;
      });
  }, [events, search, filterType]);

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
    const total = events.length;
    const upcoming = filteredEvents.filter((ev) => {
      const start = new Date(ev.startDateTime || ev.createdAt || '').getTime();
      return start >= today.getTime() - 24 * 60 * 60 * 1000;
    }).length;
    const todayCount = events.filter((ev) => {
      const start = new Date(ev.startDateTime || ev.createdAt || '');
      const sameDay =
        start.getFullYear() === today.getFullYear() &&
        start.getMonth() === today.getMonth() &&
        start.getDate() === today.getDate();
      return sameDay;
    }).length;
    return { total, upcoming, today: todayCount };
  }, [events, filteredEvents, today]);

  const toggleSelection = (id: string, list: string[], setter: (val: string[]) => void) => {
    if (list.includes(id)) {
      setter(list.filter((v) => v !== id));
    } else {
      setter([...list, id]);
    }
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setStartDateTime('');
    setEndDateTime('');
    setEventType('general');
    setSelectedGroupIds([]);
    setSelectedUserIds([]);
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

      const payload = {
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
      const res = await apiClient.createEvent(payload);
      const created = (res.data || payload) as EventItem;
      setEvents((prev) => [created, ...prev]);
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
    setEventType((ev.type as any) || 'colegio');
    setSelectedGroupIds(ev.audience?.groupIds || []);
    setSelectedUserIds(ev.audience?.userIds || []);
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
    events.forEach((ev) => {
      const key = (ev.startDateTime || ev.createdAt || '').slice(0, 10);
      if (!map[key]) map[key] = [];
      map[key].push(ev);
    });
    return map;
  }, [events]);

  const selectedDayKey = selectedDay ? selectedDay.toISOString().slice(0, 10) : null;
  const eventsSelectedDay = selectedDayKey ? eventsByDay[selectedDayKey] || [] : [];

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

        <Card className="p-4 flex flex-col gap-3 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="flex items-center gap-2 border rounded-lg px-3 py-2 bg-white w-full sm:w-96">
              <FiSearch className="text-gray-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por título o detalle"
                className="w-full outline-none text-sm"
              />
            </div>
            <Select
              label="Tipo"
              value={filterType}
              onChange={(val) => setFilterType(val as string)}
              options={[
                { value: 'all', label: 'Todos' },
                { value: 'colegio', label: 'Evento del colegio' },
                { value: 'evaluacion', label: 'Evaluación' },
                { value: 'reunion', label: 'Reunión de apoderados' },
              ]}
            />
            <div className="text-sm text-gray-600 flex items-center">
              {loadingEvents ? 'Cargando eventos...' : `${filteredEvents.length} resultado(s)`}
            </div>
          </div>
          {eventsError && <p className="text-sm text-red-600">{eventsError}</p>}
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
                      {ev.audience?.userIds?.length || 0} personas • {ev.audience?.groupIds?.length || 0} grupos
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-2 text-xs text-gray-600">
                    {ev.audience?.groupIds?.slice(0, 3).map((g) => (
                      <span key={g} className="px-2 py-1 bg-gray-100 rounded-full">{g}</span>
                    ))}
                    {(ev.audience?.groupIds?.length || 0) > 3 && (
                      <span className="px-2 py-1 bg-gray-50 rounded-full">
                        +{(ev.audience?.groupIds?.length || 0) - 3} grupos
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
                          setEventType((ev.type as 'general' | 'schedule') || 'general');
                          setSelectedGroupIds(ev.audience?.groupIds || []);
                          setSelectedUserIds(ev.audience?.userIds || []);
                          setShowModal(true);
                        }}
                      >
                        Editar borrador
                      </Button>
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

        <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Crear evento">
          <form className="space-y-4" onSubmit={handleCreateEvent}>
            <Input
              label="Título del evento"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="Ej: Reunión de apoderados"
            />
            <TextArea
              label="Descripción"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Agrega detalles útiles (sala, material, recordatorios...)"
              rows={3}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input
                label="Inicio"
                type="datetime-local"
                value={startDateTime}
                onChange={(e) => setStartDateTime(e.target.value)}
                required
              />
              <Input
                label="Fin (opcional)"
                type="datetime-local"
                value={endDateTime}
                onChange={(e) => setEndDateTime(e.target.value)}
              />
            </div>
            <Select
              label="Tipo"
              value={eventType}
              onChange={(val) => setEventType(val as 'colegio' | 'evaluacion' | 'reunion')}
              options={[
                { value: 'colegio', label: 'Evento del colegio' },
                { value: 'evaluacion', label: 'Evaluación' },
                { value: 'reunion', label: 'Reunión de apoderados' },
              ]}
            />

            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2 text-gray-800 font-semibold">
                <FiUsers />
                Destinatarios (opcional)
              </div>
              <p className="text-sm text-gray-600">
                Selecciona personas individuales o grupos. Los apoderados solo verán los eventos a los que fueron
                invitados.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="border rounded-lg p-3 bg-white">
                  <div className="flex items-center justify-between mb-2 text-sm font-semibold text-gray-700">
                    <span>Personas</span>
                    <span className="text-xs text-gray-500">{users.length} disponibles</span>
                  </div>
                  <div className="max-h-40 overflow-y-auto space-y-2 pr-1">
                    {loadingRecipients && <p className="text-sm text-gray-500">Cargando...</p>}
                    {!loadingRecipients &&
                      users.map((u) => (
                        <label key={u.id} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedUserIds.includes(u.id)}
                            onChange={() => toggleSelection(u.id, selectedUserIds, setSelectedUserIds)}
                          />
                          <span>{u.name || u.email}</span>
                        </label>
                      ))}
                  </div>
                  {selectedUserIds.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {selectedUserIds.map((id) => {
                        const u = users.find((x) => x.id === id);
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
                <div className="border rounded-lg p-3 bg-white">
                  <div className="flex items-center justify-between mb-2 text-sm font-semibold text-gray-700">
                    <span>Grupos</span>
                    <span className="text-xs text-gray-500">{groups.length} disponibles</span>
                  </div>
                  <div className="max-h-40 overflow-y-auto space-y-2 pr-1">
                    {loadingRecipients && <p className="text-sm text-gray-500">Cargando...</p>}
                    {!loadingRecipients &&
                      groups.map((g) => (
                        <label key={g.id} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedGroupIds.includes(g.id)}
                            onChange={() => toggleSelection(g.id, selectedGroupIds, setSelectedGroupIds)}
                          />
                          <span>{g.name}</span>
                        </label>
                      ))}
                  </div>
                  {selectedGroupIds.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
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
              <Button variant="primary" type="submit" disabled={saving || !title.trim() || !startDateTime}>
                {saving ? 'Guardando...' : 'Guardar evento'}
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    </ProtectedLayout>
  );
}
