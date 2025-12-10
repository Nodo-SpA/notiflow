'use client';

import React from 'react';
import { Card } from '@/components/ui';
import { Message } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import clsx from 'clsx';
import {
  FiCheckCircle,
  FiClock,
  FiAlertCircle,
  FiUsers,
  FiUser,
} from 'react-icons/fi';

interface MessageItemProps {
  message: Message;
  onClick?: () => void;
}

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  onClick,
}) => {
  const statusConfig = {
    draft: {
      icon: FiClock,
      label: 'Borrador',
      color: 'text-gray-500 bg-gray-100',
    },
    scheduled: {
      icon: FiClock,
      label: 'Programado',
      color: 'text-blue-600 bg-blue-100',
    },
    sent: {
      icon: FiCheckCircle,
      label: 'Enviado',
      color: 'text-green-600 bg-green-100',
    },
    failed: {
      icon: FiAlertCircle,
      label: 'Error',
      color: 'text-red-600 bg-red-100',
    },
  };

  const config = statusConfig[message.status];
  const Icon = config.icon;

  return (
    <Card
      onClick={onClick}
      className={clsx('p-4 cursor-pointer', onClick && 'hover:shadow-lg')}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-gray-900 line-clamp-2">
            {message.content}
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            De: {message.senderName}
          </p>
        </div>
        <div className={clsx('flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ml-2', config.color)}>
          <Icon size={14} />
          {config.label}
        </div>
      </div>

      <div className="flex items-center justify-between text-sm text-gray-600">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <FiUsers size={16} />
            <span>{message.recipients.length} destinatario(s)</span>
          </div>
        </div>
        <span>
          {formatDistanceToNow(new Date(message.createdAt), {
            addSuffix: true,
            locale: es,
          })}
        </span>
      </div>
    </Card>
  );
};
