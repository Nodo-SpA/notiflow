# 🚀 Quick Start - Notiflow

## ¿Qué es Notiflow?

Una plataforma de mensajería escolar por WhatsApp que permite que directores, coordinadores y profesores se comuniquen rápidamente con estudiantes, cursos, niveles, jornadas o la escuela completa.

---

## ⚡ Empezar en 5 minutos

### 1. Clonar y Instalar

```bash
cd /Users/hector/Documents/GITHUB/notiflow
npm install
```

### 2. Configurar Variables de Entorno

```bash
cp .env.example .env.local
# Edita .env.local con tus valores
```

### 3. Ejecutar en Desarrollo

```bash
npm run dev
# Abre http://localhost:3000 en tu navegador
```

### 4. Login Demo

- Email: cualquiera@ejemplo.com
- Contraseña: cualquiera

---

## 📂 Estructura Rápida

```
app/           # Páginas (Next.js App Router)
components/    # Componentes reutilizables
lib/           # Utilidades (API client, hooks)
store/         # Estado (Zustand)
types/         # Tipos TypeScript
```

---

## 🎯 Páginas Principales

| Ruta | Descripción |
|------|-------------|
| `/login` | Iniciar sesión |
| `/dashboard` | Panel principal |
| `/messages/new` | Crear nuevo mensaje |
| `/messages` | Historial de mensajes |
| `/management/courses` | Gestionar cursos |
| `/settings` | Configuración |

---

## 🧩 Componentes Disponibles

### UI Base
```tsx
import { Button, Input, Select, TextArea, Card, Modal } from '@/components/ui';

<Button variant="primary" onClick={() => console.log('Click!')}>
  Enviar
</Button>

<Input label="Email" type="email" placeholder="tu@escuela.com" />

<Select 
  label="Curso" 
  options={[
    { value: '1', label: 'Curso 1-A' },
    { value: '2', label: 'Curso 1-B' }
  ]}
/>
```

### Layout
```tsx
import { Layout, Header, Sidebar } from '@/components/layout';

export default function Page() {
  return (
    <Layout>
      {/* Tu contenido aquí */}
    </Layout>
  );
}
```

### Mensajes
```tsx
import { MessageComposer, MessageList } from '@/components/messages';

<MessageComposer 
  onSend={handleSend}
  onSchedule={handleSchedule}
/>

<MessageList messages={messages} />
```

---

## 🏪 State Management (Zustand)

### Autenticación
```tsx
import { useAuthStore } from '@/store';

const { user, setUser, logout } = useAuthStore();
console.log(user?.name); // Nombre del usuario
```

### Escuela
```tsx
import { useSchoolStore } from '@/store';

const { levels, courses, selectLevel } = useSchoolStore();
```

### Mensajes
```tsx
import { useMessageStore } from '@/store';

const { messages, addMessage } = useMessageStore();
```

---

## 📡 API Client

```tsx
import { apiClient } from '@/lib/api-client';

// Enviar mensaje
await apiClient.sendMessage({
  content: 'Hola estudiantes',
  recipients: [{ id: '1', type: 'course', name: 'Curso 6-A' }]
});

// Obtener mensajes
const data = await apiClient.getMessages();

// Obtener estudiantes
const students = await apiClient.getStudents('course-1a');
```

---

## 🔌 Hooks Personalizados

```tsx
import { useFetch, usePost } from '@/hooks/useFetch';

// Obtener datos
const { data, loading, error, fetch } = useFetch('/messages');

// Enviar datos
const { loading, error, post } = usePost('/messages/send');
await post({ content: '...', recipients: [...] });
```

---

## 🎨 Tailwind CSS

Usa clases de Tailwind directamente:

```tsx
<div className="flex items-center justify-center gap-4 p-6 bg-blue-50 rounded-lg">
  <h1 className="text-2xl font-bold text-gray-900">Título</h1>
  <button className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-green-700">
    Botón
  </button>
</div>
```

---

## 📦 Build & Deploy

### Build Producción
```bash
npm run build
npm run export  # Exporta a carpeta /out (estático)
```

### Subir a GitHub Pages
```bash
npm run deploy
# O manualmente:
# - git add .
# - git commit -m "Deploy"
# - git push
# - GitHub Actions deplotará automáticamente
```

---

## 🐛 Debugging

### Ver errores de TypeScript
```bash
npm run build
```

### Ejecutar linter
```bash
npm run lint
```

### Ver componentes en desarrollo
Abre DevTools (F12) en el navegador

---

## 🔗 Recursos Útiles

- [Next.js Docs](https://nextjs.org/docs)
- [React Docs](https://react.dev)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [Zustand](https://github.com/pmndrs/zustand)
- [Meta WhatsApp API](https://developers.facebook.com/docs/whatsapp)

---

## 📝 Próximos Pasos

1. **Conectar Backend**: Actualiza `NEXT_PUBLIC_API_URL` en `.env.local`
2. **Configurar WhatsApp**: Obtén API token de Meta Business
3. **Agregar Usuarios Reales**: Conecta con tu base de datos
4. **Personalizar**: Cambia colores, logos, textos
5. **Hacer Deploy**: Publica en GitHub Pages

---

## 💡 Tips Rápidos

- Presiona `Ctrl+K` en Next.js dev para ver errores
- Usa `console.log` pero recuerda hacer `npm run build`
- Componentes están en `'use client'` para interactividad
- Rutas automáticas basadas en carpetas
- Imports con `@/` apuntan a root del proyecto

---

## 🆘 Soporte

Si tienes problemas:

1. Revisa la consola del navegador (F12)
2. Mira los logs del servidor (terminal)
3. Consulta la documentación en `/README.md`
4. Revisa `/ARQUITECTURA.md` para diagramas

---

**¡Listo! Ahora puedes empezar a desarrollar. ¡Diviértete! 🎉**
