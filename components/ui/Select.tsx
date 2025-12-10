'use client';

import React from 'react';
import clsx from 'clsx';
import { SelectProps } from '@/types/components';

export const Select: React.FC<SelectProps> = ({
  label,
  options,
  value,
  onChange,
  placeholder,
  multiple = false,
  error,
  disabled,
}) => {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {label}
        </label>
      )}
      <select
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        multiple={multiple}
        disabled={disabled}
        className={clsx(
          'w-full px-4 py-2.5 border rounded-lg font-medium transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent',
          error ? 'border-red-500 bg-red-50' : 'border-gray-200 bg-white hover:border-gray-300',
          disabled && 'bg-gray-100 cursor-not-allowed opacity-60'
        )}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
    </div>
  );
};
