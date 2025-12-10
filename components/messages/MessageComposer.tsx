'use client';

import React, { useState } from 'react';
import { Card, Button, Select, TextArea } from '@/components/ui';
import { FiPlus, FiX } from 'react-icons/fi';
import clsx from 'clsx';
import { Recipient } from '@/types';

interface MessageComposerProps {
  onSend?: (data: any) => void;
  onSchedule?: (data: any) => void;
}

export const MessageComposer: React.FC<MessageComposerProps> = ({
  onSend,
  onSchedule,
}) => {
  const [message, setMessage] = useState('');
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [recipientType, setRecipientType] = useState<'student' | 'course' | 'level' | 'shift' | 'school'>('student');
  const [selectedRecipient, setSelectedRecipient] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [sendNow, setSendNow] = useState(true);

  const mockOptions = [
    { value: 'student-1', label: 'Juan Pérez' },
    { value: 'student-2', label: 'María García' },
    { value: 'student-3', label: 'Carlos López' },
  ];

  const addRecipient = () => {
    if (selectedRecipient) {
      const option = mockOptions.find((o) => o.value === selectedRecipient);
      if (option) {
        const newRecipient: Recipient = {
          id: selectedRecipient,
          type: recipientType,
          name: option.label,
        };
        setRecipients([...recipients, newRecipient]);
        setSelectedRecipient('');
      }
    }
  };

  const removeRecipient = (id: string) => {
    setRecipients(recipients.filter((r) => r.id !== id));
  };

  const handleSend = () => {
    if (!message.trim() || recipients.length === 0) {
      alert('Por favor completa el mensaje y selecciona destinatarios');
      return;
    }

    const data = {
      content: message,
      recipients,
      scheduledTime: !sendNow ? scheduledTime : null,
    };

    if (sendNow) {
      onSend?.(data);
    } else {
      onSchedule?.(data);
    }

    // Reset
    setMessage('');
    setRecipients([]);
    setScheduledTime('');
    setSendNow(true);
  };

  return (
    <Card className="p-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Nuevo Mensaje</h2>

      {/* Message Content */}
      <div className="mb-6">
        <TextArea
          label="Mensaje"
          placeholder="Escribe tu mensaje aquí..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={1000}
          rows={5}
        />
      </div>

      {/* Recipients Section */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Destinatarios</h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <Select
            label="Tipo de destinatario"
            options={[
              { value: 'student', label: 'Estudiante' },
              { value: 'course', label: 'Curso' },
              { value: 'level', label: 'Nivel' },
              { value: 'shift', label: 'Jornada' },
              { value: 'school', label: 'Todo el Colegio' },
            ]}
            value={recipientType}
            onChange={(val) => setRecipientType(val as any)}
          />

          <Select
            label="Seleccionar"
            options={mockOptions}
            value={selectedRecipient}
            onChange={(val) => setSelectedRecipient(val as string)}
            placeholder="Elige un destinatario"
          />

          <div className="flex items-end">
            <Button variant="primary" onClick={addRecipient} fullWidth>
              <FiPlus size={18} />
              Agregar
            </Button>
          </div>
        </div>

        {/* Selected Recipients */}
        {recipients.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm font-medium text-gray-700 mb-3">
              Destinatarios seleccionados ({recipients.length}):
            </p>
            <div className="flex flex-wrap gap-2">
              {recipients.map((recipient) => (
                <div
                  key={recipient.id}
                  className="bg-white border border-blue-300 rounded-full px-3 py-1 text-sm flex items-center gap-2"
                >
                  <span>{recipient.name}</span>
                  <button
                    onClick={() => removeRecipient(recipient.id)}
                    className="text-gray-500 hover:text-red-600 transition-colors"
                  >
                    <FiX size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Schedule Section */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <div className="flex items-center gap-4 mb-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={sendNow}
              onChange={(e) => setSendNow(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="font-medium text-gray-700">Enviar ahora</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={!sendNow}
              onChange={(e) => setSendNow(!e.target.checked)}
              className="w-4 h-4"
            />
            <span className="font-medium text-gray-700">Programar</span>
          </label>
        </div>

        {!sendNow && (
          <input
            type="datetime-local"
            value={scheduledTime}
            onChange={(e) => setScheduledTime(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
          />
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 justify-end">
        <Button variant="outline" onClick={() => setMessage('')}>
          Limpiar
        </Button>
        <Button
          variant="primary"
          onClick={handleSend}
          disabled={!message.trim() || recipients.length === 0}
        >
          {sendNow ? 'Enviar Mensaje' : 'Programar Mensaje'}
        </Button>
      </div>
    </Card>
  );
};
