'use client';

import React, { useMemo, useState } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store';
import { useYearStore } from '@/store';
import { apiClient } from '@/lib/api-client';
import Link from 'next/link';
import {
  FiLogOut,
  FiMenu,
  FiX,
  FiHome,
  FiMessageCircle,
  FiUsers,
  FiBarChart2,
  FiSettings,
  FiPhone,
} from 'react-icons/fi';
import squareLogo from '@/logos/Naranjo_Degradado.png';

export const Header: React.FC = () => {
  const router = useRouter();
  const { user, logout, hasPermission } = useAuthStore();
  const { year } = useYearStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [schoolLogo, setSchoolLogo] = React.useState<string | null>(null);
  const role = (user?.role || '').toUpperCase();
  const isTeacherOrViewer = role === 'TEACHER' || role === 'GUARDIAN' || role === 'STUDENT';
  const roleLabel = (r?: string) => {
    const key = (r || '').toLowerCase();
    const map: Record<string, string> = {
      superadmin: 'Superadmin',
      global_admin: 'Superadmin',
      admin: 'Administrador',
      teacher: 'Profesor',
      coordinator: 'Coordinador',
      gestion_escolar: 'Gestión Escolar',
      guardian: 'Apoderado',
      student: 'Estudiante',
    };
    return map[key] || (key ? key.charAt(0).toUpperCase() + key.slice(1) : '');
  };

  const canCreateMessage = hasPermission('messages.create');
  const canListMessages = hasPermission('messages.list');
  const canManageStudents =
    hasPermission('students.create') ||
    hasPermission('students.update') ||
    hasPermission('students.delete');
  // Solo mostramos gestión de grupos si puede crearlos/editar/borrar (no solo listar)
  const canManageGroups =
    hasPermission('groups.create') ||
    hasPermission('groups.update') ||
    hasPermission('groups.delete');
  const canSeeManagement = !isTeacherOrViewer && (canManageStudents || canManageGroups);
  const canSeeReports = hasPermission('reports.view');
  const canSeeSettings =
    !isTeacherOrViewer &&
    (hasPermission('users.create') ||
      hasPermission('users.delete') ||
      hasPermission('schools.manage'));
  const canSeePhoneDirectory =
    role === 'SUPERADMIN' ||
    role === 'ADMIN' ||
    role === 'COORDINATOR' ||
    role === 'GESTION_ESCOLAR' ||
    role === 'DIRECTOR' ||
    role === 'TEACHER';

  const mobileMenuItems = useMemo(
    () => [
      { label: 'Dashboard', href: '/dashboard', icon: FiHome },
      ...(canCreateMessage ? [{ label: 'Enviar Mensaje', href: '/messages/new', icon: FiMessageCircle }] : []),
      ...(canListMessages ? [{ label: 'Historial de Mensajes', href: '/messages', icon: FiMessageCircle }] : []),
      ...(canSeePhoneDirectory ? [{ label: 'Directorio Telefónico', href: '/phone-directory', icon: FiPhone }] : []),
      ...(canSeeManagement
        ? [
            { label: 'Estudiantes y Apoderados', href: '/management/students', icon: FiUsers },
            ...(canManageGroups
              ? [{ label: 'Grupos', href: '/management/groups', icon: FiUsers }]
              : []),
          ]
        : []),
      ...(canSeeReports ? [{ label: 'Reportes', href: '/reports', icon: FiBarChart2 }] : []),
      ...(canSeeSettings ? [{ label: 'Configuración', href: '/settings', icon: FiSettings }] : []),
    ],
    [
      canCreateMessage,
      canListMessages,
      canSeeManagement,
      canManageGroups,
      canSeeReports,
      canSeeSettings,
      canSeePhoneDirectory,
    ]
  );

  React.useEffect(() => {
    const loadSchool = async () => {
      if (!user?.schoolId) {
        setSchoolLogo(null);
        return;
      }
      try {
        const res = await apiClient.getSchoolById(user.schoolId);
        const logo = res?.data?.logoUrl;
        setSchoolLogo(logo || null);
      } catch {
        setSchoolLogo(null);
      }
    };
    loadSchool();
  }, [user?.schoolId]);

  const handleLogout = async () => {
    try {
      await apiClient.logout();
    } catch {
      // Aunque falle la revocación remota, limpiamos la sesión local.
    } finally {
      logout();
      router.push('/login');
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-transparent">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16 glass-panel rounded-2xl mt-3 px-3 sm:px-4 shadow-sm">
          {/* Logo */}
          <div className="flex items-center gap-3">
            {schoolLogo ? (
              <div className="w-11 h-11 rounded-xl overflow-hidden border border-white/60 shadow">
                <img src={schoolLogo} alt="Logo colegio" className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="w-11 h-11 rounded-xl overflow-hidden border border-primary/30 bg-white shadow">
                <Image src={squareLogo} alt="Notiflow" className="w-full h-full object-cover" priority />
              </div>
            )}
            <div className="hidden sm:block">
              <h1 className="text-xl font-bold text-secondary">Notiflow</h1>
              <p className="text-xs text-gray-500">Mensajería Escolar</p>
            </div>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden sm:flex items-center gap-4">
            {user && (
              <>
                <div className="text-right">
                  <p className="text-sm font-semibold text-secondary">{user.name}</p>
                  <p className="text-xs text-gray-500 capitalize">{roleLabel(user.role)}</p>
                  <p className="text-xs text-gray-500">
                    {user.schoolName || `Colegio ${user.schoolId}`}
                  </p>
                </div>
                <button
                  onClick={handleLogout}
                  className="p-2 text-gray-600 hover:text-red-600 transition-colors"
                  title="Cerrar sesión"
                >
                  <FiLogOut size={20} />
                </button>
              </>
            )}
          </div>

          {/* Mobile Menu Toggle */}
          <button
            className="sm:hidden text-secondary"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? (
              <FiX size={24} className="text-gray-600" />
            ) : (
              <FiMenu size={24} className="text-gray-600" />
            )}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="sm:hidden pb-4 border-t border-gray-200 pt-4 space-y-4 glass-panel rounded-xl mt-2">
            {user && (
              <>
                <div className="mb-4 text-sm">
                  <p className="font-medium text-gray-900">{user.name}</p>
                  <p className="text-xs text-gray-500 capitalize">{roleLabel(user.role)}</p>
                  <p className="text-xs text-gray-500">
                    {user.schoolName || `Colegio ${user.schoolId}`}
                  </p>
                </div>
                <nav className="space-y-2">
                  {mobileMenuItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 hover:border-primary hover:bg-primary/10 text-sm font-medium text-gray-700"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        <Icon size={16} className="text-primary" />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </nav>
                <Button
                  variant="danger"
                  size="sm"
                  fullWidth
                  onClick={handleLogout}
                >
                  Cerrar sesión
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  );
};
