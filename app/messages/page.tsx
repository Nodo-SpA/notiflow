'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore, useMessageStore } from '@/store';
import { Layout } from '@/components/layout';
import { Card, Button, Select } from '@/components/ui';
import { MessageList } from '@/components/messages/MessageList';
import { Message } from '@/types';
import { FiPlus, FiTrash2 } from 'react-icons/fi';

export default function MessagesPage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const messages = useMessageStore((state) => state.messages);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  useEffect(() => {
    if (!user) {
      router.push('/login');
    }
  }, [user, router]);

  if (!user) {
    return null;
  }

  // Mock messages
  const mockMessages: Message[] = [
    {
      id: '1',
      content: 'Recordatorio: Reunión de padres el próximo viernes a las 3 PM',
      senderId: user.id,
      senderName: user.name,
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      status: 'sent',
      recipients: [
        { id: '1', type: 'course', name: 'Curso 6-A', count: 30 },
      ],
    },
    {
      id: '2',
      content: 'No hay clases mañana - feriado nacional',
      senderId: user.id,
      senderName: user.name,
      createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
      status: 'sent',
      recipients: [{ id: '2', type: 'school', name: 'Todo el Colegio' }],
    },
    {
      id: '3',
      content: 'Evaluación de matemáticas reprogramada para el martes',
      senderId: user.id,
      senderName: user.name,
      createdAt: new Date(),
      status: 'scheduled',
      recipients: [
        { id: '3', type: 'level', name: 'Nivel Secundario', count: 120 },
      ],
    },
  ];

  const filteredMessages = mockMessages.filter((msg) => {
    if (filterStatus === 'all') return true;
    return msg.status === filterStatus;
  });

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold text-gray-900">Mis Mensajes</h1>
            <p className="text-gray-600 mt-1">
              Historial de mensajes enviados y programados
            </p>
          </div>
          <Button
            variant="primary"
            onClick={() => router.push('/messages/new')}
          >
            <FiPlus size={18} />
            Nuevo Mensaje
          </Button>
        </div>

        {/* Filters */}
        <Card className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Filtrar por estado"
              options={[
                { value: 'all', label: 'Todos' },
                { value: 'sent', label: 'Enviados' },
                { value: 'scheduled', label: 'Programados' },
                { value: 'draft', label: 'Borradores' },
                { value: 'failed', label: 'Error' },
              ]}
              value={filterStatus}
              onChange={(val) => setFilterStatus(val as string)}
            />
          </div>
        </Card>

        {/* Messages List */}
        <MessageList
          messages={filteredMessages}
          emptyMessage="No hay mensajes con este filtro"
          onMessageClick={(message) => {
            console.log('Mensaje seleccionado:', message);
          }}
        />
      </div>
    </Layout>
  );
}
