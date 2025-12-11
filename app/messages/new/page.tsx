'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Layout } from '@/components/layout';
import { Modal } from '@/components/ui';

type Template = {
  id: string;
  name: string;
  content: string;
};

export default function NewMessagePage() {
  const [templates, setTemplates] = useState<Template[]>([
    {
      id: '1',
      name: 'Recordatorio de pago',
      content:
        'Estimados apoderados, les recordamos que el pago de matrícula vence el viernes. Gracias por su apoyo.',
    },
    {
      id: '2',
      name: 'Reunión de padres',
      content:
        'Les invitamos a la reunión de padres el día jueves a las 18:00 hrs. Tema: avances académicos.',
    },
    {
      id: '3',
      name: 'Aviso general',
      content:
        'Estimados, mañana habrá jornada corta por actividad institucional. Los estudiantes saldrán a las 12:00.',
    },
  ]);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [messageContent, setMessageContent] = useState('');
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateContent, setNewTemplateContent] = useState('');
  const [showTemplates, setShowTemplates] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editContent, setEditContent] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    alert('Mensaje enviado');
  };

  const handleApplyTemplate = (templateId: string) => {
    const found = templates.find((t) => t.id === templateId);
    if (found) {
      setSelectedTemplate(templateId);
      setMessageContent(found.content);
    }
  };

  const handleAddTemplate = () => {
    if (!newTemplateName.trim() || !newTemplateContent.trim()) return;
    const newTemplate: Template = {
      id: Date.now().toString(),
      name: newTemplateName.trim(),
      content: newTemplateContent.trim(),
    };
    setTemplates([newTemplate, ...templates]);
    setNewTemplateName('');
    setNewTemplateContent('');
    setSelectedTemplate(newTemplate.id);
    setMessageContent(newTemplate.content);
  };

  const handleStartEdit = (tpl: Template) => {
    setEditingTemplateId(tpl.id);
    setEditName(tpl.name);
    setEditContent(tpl.content);
    setShowEditModal(true);
  };

  const handleSaveEdit = () => {
    if (!editingTemplateId || !editName.trim() || !editContent.trim()) return;
    setTemplates((prev) =>
      prev.map((tpl) =>
        tpl.id === editingTemplateId
          ? { ...tpl, name: editName.trim(), content: editContent.trim() }
          : tpl
      )
    );
    if (selectedTemplate === editingTemplateId) {
      setMessageContent(editContent.trim());
    }
    handleCancelEdit();
  };

  const handleCancelEdit = () => {
    setEditingTemplateId(null);
    setEditName('');
    setEditContent('');
    setShowEditModal(false);
  };

  const handleDeleteTemplate = (id: string) => {
    setDeleteTarget(templates.find((tpl) => tpl.id === id) || null);
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    setTemplates((prev) => prev.filter((tpl) => tpl.id !== deleteTarget.id));
    if (selectedTemplate === deleteTarget.id) {
      setSelectedTemplate(null);
    }
    if (editingTemplateId === deleteTarget.id) {
      handleCancelEdit();
    }
    setDeleteTarget(null);
  };

  const handleCancelDelete = () => {
    setDeleteTarget(null);
  };

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Redactar</p>
            <h1 className="text-3xl font-bold text-gray-900">Nuevo Mensaje</h1>
            <p className="text-gray-600 mt-1">
              Envía un mensaje inmediato o prográmalo para más tarde
            </p>
          </div>
          <Link
            href="/messages"
            className="text-primary hover:text-green-800 transition-colors"
          >
            ← Volver
          </Link>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-8">
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Contenido</h2>
                <p className="text-sm text-gray-600">
                  Redacta el mensaje o aplica una plantilla.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowTemplates((prev) => !prev)}
                className="px-4 py-2 border border-primary text-primary rounded-lg font-medium hover:bg-green-50 transition-colors"
              >
                {showTemplates ? 'Ocultar plantillas' : 'Utilizar plantilla'}
              </button>
            </div>

            {showTemplates && (
              <div className="space-y-4 border border-gray-200 rounded-lg p-4">
                <div>
                  <p className="text-sm text-gray-600 mb-3">
                    Selecciona una plantilla o crea una nueva para reutilizar mensajes frecuentes.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {templates.map((tpl) => (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => handleApplyTemplate(tpl.id)}
                        className={`text-left border rounded-lg p-4 hover:border-primary transition-colors ${
                          selectedTemplate === tpl.id ? 'border-primary bg-green-50' : 'border-gray-200'
                        }`}
                      >
                        <p className="font-semibold text-gray-900 mb-1">{tpl.name}</p>
                        <p className="text-sm text-gray-600 line-clamp-3">{tpl.content}</p>
                        <div className="flex items-center gap-2 mt-3">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartEdit(tpl);
                            }}
                            className="text-xs text-primary hover:underline"
                          >
                            Editar
                          </button>
                          <span className="text-gray-300">•</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteTemplate(tpl.id);
                            }}
                            className="text-xs text-red-600 hover:underline"
                          >
                            Borrar
                          </button>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border border-dashed border-gray-300 rounded-lg p-4 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                  <div className="sm:col-span-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nombre de plantilla
                    </label>
                    <input
                      type="text"
                      value={newTemplateName}
                      onChange={(e) => setNewTemplateName(e.target.value)}
                      placeholder="Ej: Aviso feriado"
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200"
                    />
                  </div>
                  <div className="sm:col-span-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Contenido
                    </label>
                    <input
                      type="text"
                      value={newTemplateContent}
                      onChange={(e) => setNewTemplateContent(e.target.value)}
                      placeholder="Mensaje breve para reutilizar"
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200"
                    />
                  </div>
                  <div className="sm:col-span-2 flex justify-end">
                    <button
                      type="button"
                      onClick={handleAddTemplate}
                      className="px-4 py-2 bg-primary text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
                    >
                      Agregar plantilla
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Contenido del Mensaje<span className="text-red-500">*</span>
              </label>
              <textarea
                placeholder="Escribe tu mensaje aquí..."
                className="w-full px-4 py-2.5 border rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200 bg-white hover:border-gray-300 h-32 resize-none"
                value={messageContent}
                onChange={(e) => setMessageContent(e.target.value)}
                maxLength={1000}
                required
              />
              <p className="text-xs text-gray-500 mt-1">{messageContent.length} / 1000 caracteres</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Destinatarios<span className="text-red-500">*</span>
              </label>
              <select className="w-full px-4 py-2.5 border rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200 bg-white hover:border-gray-300" required>
                <option value="">Selecciona destinatarios...</option>
                <option value="all">Todo el Colegio</option>
                <option value="primary">Nivel Primario</option>
                <option value="secondary">Nivel Secundario</option>
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Enviar Ahora
                </label>
                <label className="flex items-center">
                  <input type="radio" name="schedule" defaultChecked className="w-4 h-4 text-primary" />
                  <span className="ml-2 text-sm text-gray-700">Enviar inmediatamente</span>
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Programar
                </label>
                <label className="flex items-center">
                  <input type="radio" name="schedule" className="w-4 h-4 text-primary" />
                  <span className="ml-2 text-sm text-gray-700">Programar para después</span>
                </label>
              </div>
            </div>

            <div className="flex gap-4 pt-4">
              <button
                type="submit"
                className="flex-1 px-6 py-2.5 bg-primary text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
              >
                Enviar Mensaje
              </button>
              <Link
                href="/messages"
                className="flex-1 px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors text-center"
              >
                Cancelar
              </Link>
            </div>
          </form>
        </div>
      </div>

      <Modal
        isOpen={showEditModal}
        title="Editar plantilla"
        onClose={handleCancelEdit}
        onConfirm={handleSaveEdit}
        confirmText="Guardar cambios"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contenido</label>
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent border-gray-200 resize-none h-28"
            />
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!deleteTarget}
        title="Eliminar plantilla"
        onClose={handleCancelDelete}
        onConfirm={handleConfirmDelete}
        confirmText="Eliminar"
      >
        <p className="text-sm text-gray-700">
          ¿Deseas eliminar la plantilla{' '}
          <span className="font-semibold">{deleteTarget?.name}</span>? Esta acción no se puede deshacer.
        </p>
      </Modal>
    </Layout>
  );
}
