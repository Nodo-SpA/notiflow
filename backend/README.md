# Notiflow Backend (Spring Boot + Firestore)

Backend para Notiflow con Spring Boot 3, JWT y Firestore. Incluye gestión de usuarios (admins por colegio), mensajes, escuelas, grupos y recuperación de contraseña con token por email (SendGrid opcional).

## Stack
- Java 21, Spring Boot 3 (Web, Security, Validation, Actuator)
- Firestore con `spring-cloud-gcp-starter-data-firestore`
- JWT con `jjwt`
- SendGrid (opcional) para envío de emails de recuperación

## Ejecutar en local
```bash
# Opcional: usar emulador de Firestore
gcloud beta emulators firestore start --host-port=localhost:8080

cd backend
export FIRESTORE_EMULATOR_ENABLED=true
export FIRESTORE_EMULATOR_HOST=localhost:8080
mvn -Dmaven.repo.local=./.m2 -Dmaven.test.skip=true spring-boot:run
# http://localhost:8080/actuator/health
```

## Variables de entorno clave
- `FIRESTORE_PROJECT_ID` (por defecto `notiflow-480919`)
- `JWT_SECRET` secreto para firmar el JWT
- `CORS_ALLOWED_ORIGINS` orígenes permitidos (ej: `https://hectorguzman.github.io,https://hectorguzman.github.io/notiflow`)
- `APP_ADMIN_EMAIL` / `APP_ADMIN_PASSWORD` / `APP_ADMIN_SCHOOL_ID` semilla opcional de admin (school-id `global` permite crear en cualquier colegio)
- `APP_FRONTEND_URL` URL base para armar el enlace de reset (ej: `https://hectorguzman.github.io/notiflow`)
- `APP_MAIL_FROM` remitente de correos (ej: `no-reply@notiflow.app`)
- `SENDGRID_API_KEY` API key para enviar el mail de recuperación. Si no está, el endpoint devuelve el token en la respuesta (solo para pruebas).
- `APP_PASSWORD_RESET_EXPIRES_MINUTES` minutos de vigencia del token (default 30)
- WhatsApp Cloud API:
  - `WHATSAPP_TOKEN` (access token)
  - `WHATSAPP_PHONE_NUMBER_ID` (Phone Number ID asociado a WABA para el endpoint `/messages`)
  - `WHATSAPP_WABA_ID` (opcional, solo informativo)
  - `WHATSAPP_API_VERSION` (default `v20.0`)

## Endpoints principales
- `POST /auth/login` → `{ token, user }`
- `GET /auth/me` → datos del usuario a partir del JWT
- `POST /auth/forgot` → genera token de reset; envía email si SendGrid está configurado
- `POST /auth/reset` → actualiza contraseña con token válido
- `GET /users` | `POST /users` → admins; admin de colegio solo crea en su colegio, admin global (`schoolId=global`) en cualquiera
- `GET /schools` | `POST /schools` → admins
- `GET /groups` | `POST /groups` → admins; se filtra por colegio
- `GET /messages` | `POST /messages` → mensajes en Firestore

## Build JAR
```bash
cd backend
mvn -Dmaven.repo.local=./.m2 -Dmaven.test.skip=true package
```

## Docker / Cloud Run (ejemplo)
```bash
cd backend
docker build -t us-central1-docker.pkg.dev/PROJECT/notiflow-repo/notiflow-backend .

# Variables en el servicio:
# PORT=8080
# SPRING_PROFILES_ACTIVE=prod
# FIRESTORE_PROJECT_ID=notiflow-480919
# JWT_SECRET=<secreto>
# CORS_ALLOWED_ORIGINS=https://hectorguzman.github.io,https://hectorguzman.github.io/notiflow
# APP_FRONTEND_URL=https://hectorguzman.github.io/notiflow
# APP_MAIL_FROM=no-reply@notiflow.app
# SENDGRID_API_KEY=<tu_api_key>
# APP_ADMIN_EMAIL / APP_ADMIN_PASSWORD / APP_ADMIN_SCHOOL_ID (semilla opcional)
```
