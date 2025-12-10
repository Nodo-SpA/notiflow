'use client';

import React from 'react';
import clsx from 'clsx';
import { ButtonProps } from '@/types/components';

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  disabled = false,
  onClick,
  type = 'button',
}) => {
  const baseStyles =
    'font-medium rounded-lg transition-all duration-200 flex items-center justify-center gap-2';

  const variantStyles = {
    primary: 'bg-primary text-white hover:bg-green-700 disabled:bg-gray-400',
    secondary: 'bg-secondary text-white hover:bg-green-800 disabled:bg-gray-400',
    outline: 'border-2 border-primary text-primary hover:bg-green-50 disabled:border-gray-400',
    danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-gray-400',
  };

  const sizeStyles = {
    sm: 'px-3 py-2 text-sm',
    md: 'px-4 py-2.5 text-base',
    lg: 'px-6 py-3 text-lg',
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={clsx(
        baseStyles,
        variantStyles[variant],
        sizeStyles[size],
        fullWidth && 'w-full',
        (disabled || loading) && 'cursor-not-allowed opacity-60'
      )}
    >
      {loading && <span className="animate-spin">⏳</span>}
      {children}
    </button>
  );
};
