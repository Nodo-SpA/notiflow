'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import {
  FiHome,
  FiMessageCircle,
  FiUsers,
  FiBarChart2,
  FiSettings,
  FiChevronDown,
  FiCalendar,
} from 'react-icons/fi';
import { useAuthStore } from '@/store';

export const Sidebar: React.FC = () => {
  const pathname = usePathname();
  const [expandedMenu, setExpandedMenu] = useState<string | null>(null);
  const user = useAuthStore((state) => state.user);
  const canCreateMessage = useAuthStore((state) => state.hasPermission('messages.create'));
  const canListMessages = useAuthStore((state) => state.hasPermission('messages.list'));
  const canCreateStudents = useAuthStore((state) => state.hasPermission('students.create'));
  const canUpdateStudents = useAuthStore((state) => state.hasPermission('students.update'));
  const canDeleteStudents = useAuthStore((state) => state.hasPermission('students.delete'));
  const canCreateGroups = useAuthStore((state) => state.hasPermission('groups.create'));
  const canUpdateGroups = useAuthStore((state) => state.hasPermission('groups.update'));
  const canDeleteGroups = useAuthStore((state) => state.hasPermission('groups.delete'));
  const canCreateUsers = useAuthStore((state) => state.hasPermission('users.create'));
  const canUpdateUsers = useAuthStore((state) => state.hasPermission('users.update'));
  const canDeleteUsers = useAuthStore((state) => state.hasPermission('users.delete'));
  const canManageSchools = useAuthStore((state) => state.hasPermission('schools.manage'));
  const canSeeReports = useAuthStore((state) => state.hasPermission('reports.view'));
  const canCreateEventsPermission = useAuthStore((state) => state.hasPermission('events.create'));
  const role = (user?.role || '').toUpperCase();
  const isTeacherOrViewer = role === 'TEACHER' || role === 'GUARDIAN' || role === 'STUDENT';

  const canManageStudents =
    canCreateStudents || canUpdateStudents || canDeleteStudents;
  // Solo mostramos gestión si puede crear/editar/borrar grupos (no solo listarlos)
  const canManageGroups =
    canCreateGroups || canUpdateGroups || canDeleteGroups;
  const canSeeManagement = !isTeacherOrViewer && (canManageStudents || canManageGroups);
  const canManageTeacherPerms = !isTeacherOrViewer && (canCreateUsers || canUpdateUsers);
  const canSeeSettings =
    !isTeacherOrViewer &&
    (canCreateUsers || canDeleteUsers || canManageSchools);
  const canCreateEvents =
    role === 'SUPERADMIN' ||
    role === 'ADMIN' ||
    role === 'TEACHER' ||
    canCreateEventsPermission;

  const menuItems = useMemo(
    () => [
      {
        label: 'Dashboard',
        href: '/dashboard',
        icon: FiHome,
      },
      {
        label: 'Enviar Mensaje',
        href: '/messages/new',
        icon: FiMessageCircle,
        hidden: !canCreateMessage,
      },
      {
        label: 'Historial de Mensajes',
        href: '/messages',
        icon: FiMessageCircle,
        hidden: !canListMessages,
      },
      {
        label: 'Eventos',
        href: '/events',
        icon: FiCalendar,
        hidden: false, // visible para ver agenda; creación se controla en la página
        badge: canCreateEvents ? 'Nuevo' : undefined,
      },
      {
        label: 'Gestión',
        icon: FiUsers,
        hidden: !canSeeManagement,
        submenu: [
          ...(canManageStudents ? [{ label: 'Estudiantes y Apoderados', href: '/management/students' }] : []),
          ...(canManageGroups ? [{ label: 'Grupos', href: '/management/groups' }] : []),
          ...(canManageTeacherPerms ? [{ label: 'Permisos profesores', href: '/management/teacher-permissions' }] : []),
        ],
      },
      {
        label: 'Reportes',
        href: '/reports',
        icon: FiBarChart2,
        hidden: !canSeeReports,
      },
      {
        label: 'Configuración',
        href: '/settings',
        icon: FiSettings,
        hidden: !canSeeSettings,
      },
    ],
    [
      canCreateMessage,
      canListMessages,
      canManageStudents,
      canManageGroups,
      canSeeManagement,
      canSeeReports,
      canSeeSettings,
      canCreateEvents,
    ]
  );

  return (
    <aside className="hidden sm:flex sm:flex-col w-64 bg-gradient-to-b from-secondary to-secondary/95 text-white shadow-xl">
      <div className="px-4 pt-6 pb-3">
        <p className="text-xs uppercase tracking-[0.12em] text-white/60 mb-3">Navegación</p>
      </div>
      <nav className="flex-1 px-4 pb-6 space-y-2 overflow-y-auto">
        {menuItems
          .filter((item) => !item.hidden)
          .map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          const hasSubmenu = 'submenu' in item;

          if (hasSubmenu) {
            return (
              <div key={item.label}>
                <button
                  onClick={() =>
                    setExpandedMenu(
                      expandedMenu === item.label ? null : item.label
                    )
                  }
                  className={clsx(
                    'w-full flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl transition-all',
                    'hover:bg-white/10 border border-transparent hover:border-white/15',
                    'backdrop-blur-sm'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Icon size={20} />
                    <span className="font-semibold">{item.label}</span>
                  </div>
                  <FiChevronDown
                    size={16}
                    className={clsx(
                      'transition-transform',
                      expandedMenu === item.label && 'rotate-180'
                    )}
                  />
                </button>
                {expandedMenu === item.label && hasSubmenu && (
                  <div className="ml-4 mt-1 space-y-1">
                    {item.submenu && item.submenu.map((subitem) => (
                      <Link
                        key={subitem.href}
                        href={subitem.href}
                        className={clsx(
                          'block px-4 py-2 rounded-lg text-sm transition-colors backdrop-blur-sm',
                          pathname === subitem.href
                            ? 'bg-white text-secondary font-semibold shadow-sm'
                            : 'hover:bg-white/10'
                        )}
                      >
                        {subitem.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href || '#'}
              className={clsx(
                'flex items-center gap-3 px-4 py-2.5 rounded-xl font-semibold transition-all text-white backdrop-blur-sm border border-transparent',
                isActive
                  ? 'bg-white text-secondary shadow-lg'
                  : 'hover:bg-white/10 hover:border-white/20'
              )}
            >
              <Icon size={20} />
              <span>{item.label}</span>
              {item.badge && (
                <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-primary text-secondary font-bold uppercase tracking-wide">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
};
