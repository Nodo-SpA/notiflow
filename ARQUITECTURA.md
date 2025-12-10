# Arquitectura de Notiflow

## 📐 Diagrama General

```
┌─────────────────────────────────────────────────────────────────┐
│                     GitHub Pages (Frontend)                      │
│              Next.js 14 + TypeScript + Tailwind CSS              │
└────────────────────┬────────────────────────────────────────────┘
                     │ HTTPS API Calls
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│              Google Cloud Platform (Backend)                     │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Cloud Run / Cloud Functions                 │   │
│  │              (Node.js / Python / Go)                     │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │  REST API                                                │   │
│  │  - Authentication (JWT)                                  │   │
│  │  - Message Management                                    │   │
│  │  - User Management                                       │   │
│  │  - School Data Management                                │   │
│  └──────────────────────────────────────────────────────────┘   │
│                     │                                            │
│  ┌──────────────────┴──────────────────┬─────────────────────┐  │
│  ▼                                     ▼                     ▼   │
│ Firestore             Cloud Tasks           Meta            │
│ (Database)       (Message Scheduling)  WhatsApp API         │
└──────────────────────────────────────────────────────────────────┘
```

---

## 🏗️ Arquitectura del Frontend

### Capas

```
┌─────────────────────────────────────────────────────┐
│              Pages (Next.js App Router)             │
│  login/ | dashboard/ | messages/ | management/     │
└────────────────┬────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────┐
│          Layout + Components                        │
│  Header | Sidebar | MessageComposer | MessageList   │
└────────────────┬────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────┐
│         UI Components (Reusables)                   │
│  Button | Input | Select | Card | Modal | TextArea │
└────────────────┬────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────┐
│           State Management (Zustand)                │
│  useAuthStore | useSchoolStore | useMessageStore    │
└────────────────┬────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────┐
│            API Client (Axios)                       │
│         Interceptores de Auth/Errores                │
└─────────────────────────────────────────────────────┘
```

---

## 🔄 Flujo de Datos

### 1. Autenticación

```
User Input → Login Page → API Client → Backend
                                        ↓ (JWT Token)
                                    localStorage
                                        ↓
                                   useAuthStore
                                        ↓
                                   Dashboard (Protegida)
```

### 2. Envío de Mensaje

```
User → MessageComposer → useMessageStore → API Client
                              ↓                    ↓
                           Estado Local        Backend
                                                  ↓
                                            Firestore
                                                  ↓
                                            Cloud Tasks
                                                  ↓
                                            WhatsApp API
```

### 3. Sincronización de Datos

```
Backend → API Response → useSchoolStore
                             ↓
                        Componentes suscritos
                             ↓
                        Re-render automático
```

---

## 🗂️ Estructura de Directorios Detallada

### `/app`
- **Entrypoint**: Usa Next.js App Router (no Pages Router)
- Cada carpeta = nueva ruta
- `page.tsx` = componente página
- `layout.tsx` = layout para sub-rutas
- `globals.css` = estilos globales

```
/app
├── layout.tsx          # Root layout
├── globals.css         # Tailwind + custom styles
├── page.tsx            # / → Redirige a /login
├── /login
│   └── page.tsx        # /login
├── /dashboard
│   └── page.tsx        # /dashboard
├── /messages
│   ├── page.tsx        # /messages
│   └── /new
│       └── page.tsx    # /messages/new
├── /management
│   ├── /students
│   │   └── page.tsx    # /management/students
│   ├── /courses
│   │   └── page.tsx    # /management/courses
│   └── /levels
│       └── page.tsx    # /management/levels
└── /settings
    └── page.tsx        # /settings
```

### `/components`
Componentes reutilizables organizados por funcionalidad

```
/components
├── /ui                 # Componentes base
│   ├── Button.tsx
│   ├── Input.tsx
│   ├── Select.tsx
│   ├── TextArea.tsx
│   ├── Card.tsx
│   ├── Modal.tsx
│   └── index.ts        # Barrel export
├── /layout             # Componentes de layout
│   ├── Header.tsx      # Navbar superior
│   ├── Sidebar.tsx     # Menu lateral
│   ├── Layout.tsx      # Wrapper principal
│   └── index.ts        # Barrel export
└── /messages           # Componentes de mensajes
    ├── MessageComposer.tsx
    ├── MessageItem.tsx
    ├── MessageList.tsx
    └── (index.ts)
```

### `/lib`
Utilidades y funciones helper

```
/lib
├── api-client.ts       # Configuración de Axios + interceptores
├── withAuth.tsx        # HOC para proteger rutas
└── (hooks futuros)
```

### `/store`
State management con Zustand

```
/store
└── index.ts
    ├── useAuthStore    # Estado de autenticación
    ├── useSchoolStore  # Datos de escuela
    └── useMessageStore # Historial de mensajes
```

### `/types`
Interfaces y tipos TypeScript

```
/types
├── index.ts        # Tipos principales del dominio
└── components.ts   # Prop types de componentes
```

---

## 🔐 Patrones de Seguridad

### 1. Autenticación
- Tokens JWT almacenados en localStorage
- Interceptor de Axios agrega token a cada request
- Error 401 redirige a login

### 2. Protección de Rutas
- `withAuth` HOC para componentes
- `useEffect` hook verifica autenticación en páginas

### 3. CORS
- Configurado en backend
- Solo solicitudes desde dominio GitHub Pages

### 4. Variables de Entorno
- Secretos en backend (no en frontend)
- Públicas en NEXT_PUBLIC_* si necesarias

---

## 📦 Dependencias Clave

| Paquete | Versión | Propósito |
|---------|---------|----------|
| next | 14.0.0 | Framework SSR/SSG |
| react | 18.2.0 | Librería UI |
| typescript | 5.3.0 | Tipado estático |
| tailwindcss | 3.3.0 | Estilos con utilidades |
| zustand | 4.4.0 | State management |
| axios | 1.6.0 | Cliente HTTP |
| react-icons | 4.12.0 | Iconografía |
| date-fns | 2.30.0 | Manejo de fechas |
| clsx | 2.0.0 | Condicionales CSS |

---

## 🚀 Build & Deploy

### Desarrollo
```bash
npm run dev
# Next.js dev server en puerto 3000
```

### Producción
```bash
npm run build    # Crea .next/
npm run export   # Exporta a /out (estático)
```

### GitHub Pages
```bash
npm run deploy
# Copia /out a rama gh-pages
# Disponible en: https://hectorguzman.github.io/notiflow/
```

---

## 🔌 Integración con Backend

### Request Flow
```
Client → API Client (Axios)
  ├─ Añade Authorization header
  ├─ Content-Type: application/json
  └─ Timeout: 10s
        ↓
Backend (GCP)
  ├─ Valida JWT
  ├─ Procesa request
  └─ Responde con JSON
        ↓
Response Interceptor
  ├─ 401 → Redirige a login
  ├─ 5xx → Muestra error
  └─ 200 → Retorna data
```

### Endpoints Utilizados

**Autenticación**
```
POST /auth/login
POST /auth/logout
```

**Mensajes**
```
POST   /messages/send
POST   /messages/schedule
GET    /messages
GET    /messages/:id
DELETE /messages/:id
```

**Datos Escolares**
```
GET /school
GET /students?courseId=...
GET /courses?levelId=...
GET /levels
```

**Usuario**
```
GET /users/me
GET /users?role=...
```

---

## 🎯 Mejores Prácticas Implementadas

✅ **Component Composition**: Componentes pequeños y reutilizables  
✅ **Type Safety**: TypeScript en todo el proyecto  
✅ **Separation of Concerns**: Lógica, UI y estilos separados  
✅ **DRY Principle**: Reutilización de componentes  
✅ **Error Handling**: Manejo de errores con interceptores  
✅ **Responsive Design**: Mobile-first con Tailwind  
✅ **Code Organization**: Estructura clara y escalable  
✅ **Environment Variables**: Configuración externalizada  

---

## 🔮 Escalabilidad Futura

### Fase 2: Características Avanzadas
- [ ] WebSockets para mensajes en tiempo real
- [ ] Carga de archivos (media en WhatsApp)
- [ ] Sistema de notificaciones
- [ ] Analytics y reportes

### Fase 3: Optimizaciones
- [ ] Pagination infinita para mensajes
- [ ] Caché de datos con SWR
- [ ] Code splitting automático
- [ ] Lazy loading de componentes

### Fase 4: Integración
- [ ] Google Classroom API
- [ ] Canvas LMS API
- [ ] Zoom API
- [ ] Webhooks de WhatsApp

---

**Última actualización**: Diciembre 2025
