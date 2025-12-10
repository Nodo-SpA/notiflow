'use client';

import React, { useState } from 'react';
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
} from 'react-icons/fi';

const menuItems = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: FiHome,
  },
  {
    label: 'Enviar Mensaje',
    href: '/messages/new',
    icon: FiMessageCircle,
  },
  {
    label: 'Mensajes',
    href: '/messages',
    icon: FiMessageCircle,
  },
  {
    label: 'Gestión',
    icon: FiUsers,
    submenu: [
      { label: 'Estudiantes', href: '/management/students' },
      { label: 'Cursos', href: '/management/courses' },
      { label: 'Niveles', href: '/management/levels' },
    ],
  },
  {
    label: 'Reportes',
    href: '/reports',
    icon: FiBarChart2,
  },
  {
    label: 'Configuración',
    href: '/settings',
    icon: FiSettings,
  },
];

export const Sidebar: React.FC = () => {
  const pathname = usePathname();
  const [expandedMenu, setExpandedMenu] = useState<string | null>(null);

  return (
    <aside className="hidden sm:flex sm:flex-col w-64 bg-secondary text-white">
      <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
        {menuItems.map((item) => {
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
                    'hover:bg-green-800'
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
                            ? 'bg-green-700 font-semibold'
                            : 'hover:bg-green-800'
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
                'flex items-center gap-3 px-4 py-2.5 rounded-lg font-medium transition-colors',
                isActive
                  ? 'bg-green-700 text-white'
                  : 'hover:bg-green-800 text-green-50'
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
