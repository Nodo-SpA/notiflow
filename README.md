# Notiflow - Sistema de Mensajería Escolar por WhatsApp

## 🎯 Descripción del Proyecto

Notiflow es una plataforma web responsiva diseñada para facilitar la comunicación entre diferentes actores de un colegio (directores, coordinadores, profesores) y estudiantes a través de WhatsApp Business API integrada con Meta.

### Características Principales

✅ **Interfaz Responsiva** - Funciona perfectamente en desktop, tablet y móvil  
✅ **Múltiples Actores** - Soporte para Admin, Director, Coordinador, Profesor  
✅ **Envío Selectivo** - A estudiantes individuales, cursos, niveles, jornadas o toda la escuela  
✅ **Programación de Mensajes** - Envía mensajes en horarios específicos  
✅ **Historial de Mensajes** - Visualiza todos los mensajes enviados  
✅ **Integración WhatsApp** - Conecta fácilmente con Meta WhatsApp Business API  
✅ **Dashboard Intuitivo** - Visualiza estadísticas y acceso rápido a funciones  

---

## 📁 Estructura del Proyecto

```
notiflow/
├── app/                          # Directorio principal de Next.js (App Router)
│   ├── layout.tsx               # Layout raíz
│   ├── globals.css              # Estilos globales
│   ├── page.tsx                 # Página inicial (redirecciona a login)
│   ├── login/
│   │   └── page.tsx            # Página de login
│   ├── dashboard/
│   │   └── page.tsx            # Dashboard principal
│   ├── messages/
│   │   ├── page.tsx            # Lista de mensajes
│   │   └── new/
│   │       └── page.tsx        # Crear nuevo mensaje
│   ├── management/
│   │   └── courses/
│   │       └── page.tsx        # Gestión de cursos
│   └── settings/
│       └── page.tsx            # Configuración
│
├── components/                   # Componentes reutilizables
│   ├── ui/                      # Componentes base (Button, Input, Select, etc)
│   ├── layout/                  # Layout components (Header, Sidebar, Layout)
│   └── messages/                # Componentes específicos de mensajes
│
├── lib/
│   └── api-client.ts           # Cliente HTTP para comunicar con backend
│
├── store/
│   └── index.ts                # State management con Zustand
│
├── types/
│   ├── index.ts                # Tipos principales
│   └── components.ts           # Props types para componentes
│
├── package.json                # Dependencias y scripts
├── tsconfig.json               # Configuración TypeScript
├── tailwind.config.js          # Configuración Tailwind CSS
├── postcss.config.js           # Configuración PostCSS
└── next.config.js              # Configuración Next.js (optimizada para GitHub Pages)
```

---

## 🛠️ Stack Tecnológico

### Frontend
- **Next.js 14** - Framework React con App Router
- **TypeScript** - Tipado estático
- **Tailwind CSS** - Estilos con utilidades
- **Zustand** - State management minimalista
- **React Icons** - Iconografía
- **Date-fns** - Manejo de fechas
- **Axios** - Cliente HTTP

### Backend (GCP)
- Hosting en Google Cloud Platform
- API RESTful para gestionar mensajes y datos
- Integración con Meta WhatsApp Business API

### Deployment
- **GitHub Pages** - Hospedaje del frontend (export estático)
- Build con `npm run export`

---

## 🚀 Instalación y Setup

### Requisitos Previos
- Node.js 18+
- npm o yarn
- Git

### Pasos de Instalación

```bash
# 1. Clonar el repositorio
git clone https://github.com/HectorGuzman/notiflow.git
cd notiflow

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env.local

# 4. Actualizar .env.local con tus valores
# NEXT_PUBLIC_API_URL=<tu-url-backend>
# Otros valores según necesites
```

### Ejecutar en Desarrollo

```bash
npm run dev
# La aplicación estará disponible en http://localhost:3000
```

### Build para Producción

```bash
npm run build
npm run start
```

### Deploy en GitHub Pages

```bash
npm run deploy
# Esto ejecuta: npm run export && gh-pages -d out
```

---

## 📊 Flujos Principales

### 1. Autenticación
- Usuario ingresa a `/login`
- Se autentica contra el backend de GCP
- Token se almacena en localStorage
- Se redirige a `/dashboard`

### 2. Crear Nuevo Mensaje
1. Usuario accede a `/messages/new`
2. Completa el contenido del mensaje
3. Selecciona tipo de destinatario (estudiante, curso, nivel, jornada, colegio)
4. Elige si enviar ahora o programar
5. Confirma y envía

### 3. Gestión de Mensajes
- `/messages` muestra historial completo
- Filtrar por estado (enviado, programado, borrador, error)
- Ver detalles del mensaje y destinatarios

---

## 🔌 Integración con Backend (GCP)

### Endpoints Esperados

```
POST   /auth/login                    # Autenticación
POST   /auth/logout                   # Logout
POST   /messages/send                 # Enviar mensaje inmediato
POST   /messages/schedule             # Programar mensaje
GET    /messages                      # Obtener mensajes del usuario
GET    /messages/:id                  # Obtener detalle de mensaje
DELETE /messages/:id                  # Eliminar mensaje
GET    /school                        # Datos de la escuela
GET    /students                      # Obtener estudiantes
GET    /courses                       # Obtener cursos
GET    /levels                        # Obtener niveles
GET    /users/me                      # Usuario actual
```

### Estructura de Datos

Ver `types/index.ts` para las interfaces completas.

---

## 🎨 Diseño y Estilos

### Paleta de Colores (WhatsApp Inspired)
- **Primary**: #25D366 (Verde WhatsApp)
- **Secondary**: #075E54 (Verde oscuro)
- **Accent**: #34B7F1 (Azul claro)
- **Light**: #F0F0F0 (Gris claro)

### Responsividad
- Mobile-first approach
- Breakpoints: sm (640px), md (768px), lg (1024px)
- Navbar colapsable en móvil
- Layout adaptativo

---

## 📱 Funcionalidades Futuras

- [ ] Notificaciones en tiempo real (Socket.io)
- [ ] Subida de archivos (imágenes, documentos)
- [ ] Templates de mensajes personalizables
- [ ] Analytics avanzado
- [ ] Multiidioma
- [ ] Modo oscuro
- [ ] Sincronización con sistemas de SIS (Student Information System)
- [ ] API WebHooks de WhatsApp para recibir mensajes

---

## 🔐 Seguridad

- Tokens JWT para autenticación
- HTTPS en producción
- Variables de entorno para datos sensibles
- CORS configurado apropiadamente
- Validación en cliente y servidor

---

## 📝 Licencia

MIT - Libre para usar en proyectos educativos

---

## 👤 Autor

Hector Guzman

## 💬 Soporte

Para preguntas o reportes de bugs, abre un issue en GitHub.

---

**¡Empecemos a construir Notiflow! 🚀**