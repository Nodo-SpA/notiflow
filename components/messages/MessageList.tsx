'use client';

import React from 'react';
import { Message } from '@/types';
import { MessageItem } from './MessageItem';

interface MessageListProps {
  messages: Message[];
  loading?: boolean;
  emptyMessage?: string;
  onMessageClick?: (message: Message) => void;
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  loading,
  emptyMessage = 'No hay mensajes',
  onMessageClick,
}) => {
  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-24 bg-gray-200 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 text-lg">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {messages.map((message) => (
        <MessageItem
          key={message.id}
          message={message}
          onClick={() => onMessageClick?.(message)}
        />
      ))}
    </div>
  );
};
