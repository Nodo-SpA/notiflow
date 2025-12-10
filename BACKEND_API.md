# Guía de Integración con Backend (GCP)

## 🎯 Descripción

Este documento describe cómo integrar Notiflow con tu backend en Google Cloud Platform.

---

## 🔌 Endpoints Requeridos

### Base URL
```
https://api.notiflow.app  (Cambia por tu URL de GCP)
```

### 1. Autenticación

#### Login
```http
POST /auth/login
Content-Type: application/json

{
  "email": "profesor@escuela.com",
  "password": "password123"
}

Response 200:
{
  "user": {
    "id": "user-123",
    "name": "Juan Pérez",
    "email": "profesor@escuela.com",
    "role": "teacher",
    "schoolId": "school-1"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}

Response 401:
{
  "error": "Credenciales inválidas"
}
```

#### Logout
```http
POST /auth/logout
Authorization: Bearer <token>

Response 200:
{
  "message": "Sesión cerrada"
}
```

---

### 2. Mensajes

#### Enviar Mensaje
```http
POST /messages/send
Authorization: Bearer <token>
Content-Type: application/json

{
  "content": "Recordatorio: reunión de padres viernes a las 3 PM",
  "recipients": [
    {
      "id": "course-6a",
      "type": "course",
      "name": "Curso 6-A"
    }
  ]
}

Response 200:
{
  "id": "msg-456",
  "status": "sent",
  "createdAt": "2025-12-10T10:30:00Z"
}

Response 400:
{
  "error": "Mensaje vacío o destinatarios inválidos"
}
```

#### Programar Mensaje
```http
POST /messages/schedule
Authorization: Bearer <token>
Content-Type: application/json

{
  "content": "No hay clases mañana",
  "recipients": [
    {
      "id": "school-all",
      "type": "school",
      "name": "Todo el Colegio"
    }
  ],
  "scheduledTime": "2025-12-11T08:00:00Z"
}

Response 200:
{
  "id": "msg-789",
  "status": "scheduled",
  "scheduledTime": "2025-12-11T08:00:00Z"
}
```

#### Obtener Mensajes
```http
GET /messages?status=sent&limit=10&offset=0
Authorization: Bearer <token>

Response 200:
{
  "messages": [
    {
      "id": "msg-456",
      "content": "Recordatorio: reunión de padres...",
      "senderId": "user-123",
      "senderName": "Juan Pérez",
      "createdAt": "2025-12-10T10:30:00Z",
      "status": "sent",
      "recipients": [
        {
          "id": "course-6a",
          "type": "course",
          "name": "Curso 6-A",
          "count": 32
        }
      ]
    }
  ],
  "total": 25,
  "limit": 10,
  "offset": 0
}
```

#### Obtener Detalle de Mensaje
```http
GET /messages/msg-456
Authorization: Bearer <token>

Response 200:
{
  "id": "msg-456",
  "content": "Recordatorio: reunión de padres viernes a las 3 PM",
  "senderId": "user-123",
  "senderName": "Juan Pérez",
  "createdAt": "2025-12-10T10:30:00Z",
  "status": "sent",
  "recipients": [
    {
      "id": "course-6a",
      "type": "course",
      "name": "Curso 6-A",
      "count": 32
    }
  ],
  "deliveryStatus": [
    {
      "recipientId": "student-1",
      "recipientName": "María García",
      "status": "delivered",
      "deliveredAt": "2025-12-10T10:35:00Z"
    }
  ]
}
```

#### Eliminar Mensaje
```http
DELETE /messages/msg-456
Authorization: Bearer <token>

Response 200:
{
  "message": "Mensaje eliminado"
}

Response 404:
{
  "error": "Mensaje no encontrado"
}
```

---

### 3. Datos Escolares

#### Obtener Datos de la Escuela
```http
GET /school
Authorization: Bearer <token>

Response 200:
{
  "id": "school-1",
  "name": "Colegio Ejemplo",
  "whatsappPhoneNumber": "+34612345678",
  "address": "Calle Principal 123",
  "city": "Madrid",
  "country": "España",
  "adminUsers": [
    {
      "id": "user-1",
      "name": "Director",
      "email": "director@escuela.com",
      "role": "admin"
    }
  ]
}
```

#### Obtener Estudiantes
```http
GET /students?courseId=course-6a&limit=50&offset=0
Authorization: Bearer <token>

Response 200:
{
  "students": [
    {
      "id": "student-1",
      "name": "María García",
      "email": "maria@escuela.com",
      "phone": "+34612345678",
      "courseId": "course-6a",
      "parentPhone": "+34687654321"
    }
  ],
  "total": 32,
  "limit": 50,
  "offset": 0
}
```

#### Obtener Cursos
```http
GET /courses?levelId=level-secondary&limit=20
Authorization: Bearer <token>

Response 200:
{
  "courses": [
    {
      "id": "course-6a",
      "name": "Curso 6-A",
      "level": "Secundaria",
      "shift": "morning",
      "studentCount": 32
    },
    {
      "id": "course-6b",
      "name": "Curso 6-B",
      "level": "Secundaria",
      "shift": "morning",
      "studentCount": 31
    }
  ],
  "total": 8,
  "limit": 20
}
```

#### Obtener Niveles
```http
GET /levels
Authorization: Bearer <token>

Response 200:
{
  "levels": [
    {
      "id": "level-primary",
      "name": "Primaria",
      "courses": [
        {
          "id": "course-1a",
          "name": "Curso 1-A",
          "shift": "morning",
          "studentCount": 30
        }
      ]
    },
    {
      "id": "level-secondary",
      "name": "Secundaria",
      "courses": [
        {
          "id": "course-6a",
          "name": "Curso 6-A",
          "shift": "morning",
          "studentCount": 32
        }
      ]
    }
  ]
}
```

---

### 4. Usuario

#### Obtener Usuario Actual
```http
GET /users/me
Authorization: Bearer <token>

Response 200:
{
  "id": "user-123",
  "name": "Juan Pérez",
  "email": "profesor@escuela.com",
  "role": "teacher",
  "schoolId": "school-1",
  "profileImage": "https://..."
}
```

---

## 🔐 Autenticación

### Headers Requeridos
```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

### Ciclo de Vida del Token
1. Usuario hace login
2. Backend retorna token JWT válido por 24h
3. Cliente almacena en localStorage
4. Cada request incluye el token en Authorization header
5. Backend valida el token
6. Si token expirado → Response 401
7. Cliente redirige a login

---

## 🛡️ Códigos de Error

| Código | Descripción |
|--------|-------------|
| 200 | OK - Solicitud exitosa |
| 400 | Bad Request - Datos inválidos |
| 401 | Unauthorized - Token inválido o expirado |
| 403 | Forbidden - No tienes permiso |
| 404 | Not Found - Recurso no existe |
| 500 | Server Error - Error del servidor |

---

## 📝 Estructura de Datos

### User
```typescript
{
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'director' | 'coordinator' | 'teacher' | 'student';
  schoolId: string;
  profileImage?: string;
}
```

### Message
```typescript
{
  id: string;
  content: string;
  senderId: string;
  senderName: string;
  createdAt: Date;
  status: 'draft' | 'scheduled' | 'sent' | 'failed';
  recipients: Recipient[];
  metadata?: {
    imageUrl?: string;
    documentUrl?: string;
  };
}
```

### Recipient
```typescript
{
  id: string;
  type: 'student' | 'course' | 'level' | 'shift' | 'school';
  name: string;
  count?: number;
}
```

---

## 🚀 Ejemplo de Implementación Backend (Node.js + Express)

```javascript
// routes/messages.js
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');

// POST /messages/send
router.post('/send', authenticate, async (req, res) => {
  try {
    const { content, recipients } = req.body;
    const userId = req.user.id;

    // Validar
    if (!content || !recipients.length) {
      return res.status(400).json({ error: 'Datos inválidos' });
    }

    // Guardar en DB
    const message = await Message.create({
      content,
      senderId: userId,
      recipients,
      status: 'sent',
      createdAt: new Date()
    });

    // Enviar a WhatsApp API
    await sendToWhatsApp(message, recipients);

    res.json({ id: message.id, status: 'sent' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
```

---

## 🔗 Variables de Entorno (Backend)

```env
# Database
FIRESTORE_PROJECT_ID=tu-proyecto-gcp
FIRESTORE_PRIVATE_KEY=...
FIRESTORE_CLIENT_EMAIL=...

# WhatsApp
WHATSAPP_API_VERSION=v18.0
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_API_TOKEN=...

# JWT
JWT_SECRET=tu-super-secreto
JWT_EXPIRY=24h

# CORS
ALLOWED_ORIGINS=https://hectorguzman.github.io

# Mail (opcional)
SENDGRID_API_KEY=...
```

---

## ✅ Checklist de Implementación

- [ ] Crear endpoints de autenticación
- [ ] Implementar validación de JWT
- [ ] Crear modelo de Message en Firestore
- [ ] Implementar lógica de envío a WhatsApp
- [ ] Crear endpoints de gestión de mensajes
- [ ] Crear endpoints de datos escolares
- [ ] Agregar manejo de errores
- [ ] Agregar logging
- [ ] Configurar CORS
- [ ] Hacer deploy en Cloud Run

---

**Para más ayuda**, consulta la [documentación de WhatsApp Business API](https://developers.facebook.com/docs/whatsapp/cloud-api)
