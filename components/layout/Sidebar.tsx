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
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const role = (user?.role || '').toUpperCase();
  const isTeacherOrViewer = role === 'TEACHER' || role === 'GUARDIAN' || role === 'STUDENT';

  const canCreateMessage = hasPermission('messages.create');
  const canListMessages = hasPermission('messages.list');
  const canManageStudents =
    hasPermission('students.create') ||
    hasPermission('students.update') ||
    hasPermission('students.delete');
  // Solo mostramos gestión si puede crear/editar/borrar grupos (no solo listarlos)
  const canManageGroups =
    hasPermission('groups.create') ||
    hasPermission('groups.update') ||
    hasPermission('groups.delete');
  const canSeeManagement = !isTeacherOrViewer && (canManageStudents || canManageGroups);
  const canManageTeacherPerms = !isTeacherOrViewer && (hasPermission('users.create') || hasPermission('users.update'));
  const canSeeReports = hasPermission('reports.view');
  const canSeeSettings =
    !isTeacherOrViewer &&
    (hasPermission('users.create') ||
      hasPermission('users.delete') ||
      hasPermission('schools.manage'));
  const canCreateEvents =
    role === 'SUPERADMIN' ||
    role === 'ADMIN' ||
    role === 'TEACHER' ||
    hasPermission('events.create');

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
    <aside className="hidden sm:flex sm:flex-col w-64 bg-secondary text-white">
      <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
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
                    'w-full flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg transition-colors',
                    'hover:bg-primary/20'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Icon size={20} />
                    <span className="font-medium">{item.label}</span>
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
                          'block px-4 py-2 rounded-lg text-sm transition-colors',
                          pathname === subitem.href
                            ? 'bg-primary/20 font-semibold text-secondary'
                            : 'hover:bg-primary/15'
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
                'flex items-center gap-3 px-4 py-2.5 rounded-lg font-medium transition-colors text-white',
                isActive
                  ? 'bg-primary/25 text-white'
                  : 'hover:bg-primary/20'
              )}
            >
              <Icon size={20} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
};
