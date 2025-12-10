'use client';

import React from 'react';
import clsx from 'clsx';
import { CardProps } from '@/types/components';

export const Card: React.FC<CardProps> = ({ children, className, onClick }) => {
  return (
    <div
      onClick={onClick}
      className={clsx(
        'bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow',
        onClick && 'cursor-pointer hover:border-primary',
        className
      )}
    >
      {children}
    </div>
  );
};
