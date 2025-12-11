'use client';

import React from 'react';
import { Button } from '@/components/ui';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store';
import { FiLogOut, FiMenu, FiX } from 'react-icons/fi';
import { useState } from 'react';

export const Header: React.FC = () => {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return (
    <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">N</span>
            </div>
            <div className="hidden sm:block">
              <h1 className="text-xl font-bold text-gray-900">Notiflow</h1>
              <p className="text-xs text-gray-500">Mensajería Escolar</p>
            </div>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden sm:flex items-center gap-4">
            {user && (
              <>
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900">{user.name}</p>
                  <p className="text-xs text-gray-500 capitalize">{user.role}</p>
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
            className="sm:hidden"
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
          <div className="sm:hidden pb-4 border-t border-gray-200 pt-4">
            {user && (
              <>
                <div className="mb-4 text-sm">
                  <p className="font-medium text-gray-900">{user.name}</p>
                  <p className="text-xs text-gray-500 capitalize">{user.role}</p>
                  <p className="text-xs text-gray-500">
                    {user.schoolName || `Colegio ${user.schoolId}`}
                  </p>
                </div>
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
