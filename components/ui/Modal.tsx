'use client';

import React from 'react';
import { ModalProps } from '@/types/components';
import { Button } from './Button';
import clsx from 'clsx';

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  title,
  children,
  onClose,
  onConfirm,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  size = 'md',
}) => {
  if (!isOpen) return null;

  const sizeStyles = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'w-full max-w-5xl',
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 overflow-y-auto px-4 py-4 sm:py-8">
      <div className="min-h-full flex items-start sm:items-center justify-center">
        <div
          className={clsx(
            'bg-white rounded-lg shadow-xl w-full flex flex-col overflow-hidden max-h-[calc(100dvh-2rem)]',
            sizeStyles[size]
          )}
        >
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-900">{title}</h2>
          </div>
          <div className="p-6 overflow-y-auto">{children}</div>
          <div className="p-6 border-t border-gray-200 flex gap-3 justify-end">
            <Button variant="outline" onClick={onClose}>
              {cancelText}
            </Button>
            {onConfirm && (
              <Button variant="primary" onClick={onConfirm}>
                {confirmText}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
