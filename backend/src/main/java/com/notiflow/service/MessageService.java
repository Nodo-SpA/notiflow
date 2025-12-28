package com.notiflow.service;

import com.google.api.core.ApiFuture;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.AggregateQuery;
import com.google.cloud.firestore.AggregateQuerySnapshot;
import com.google.cloud.firestore.QueryDocumentSnapshot;
import com.google.cloud.firestore.QuerySnapshot;
import com.google.cloud.storage.BlobInfo;
import com.google.cloud.storage.Storage;
import com.notiflow.dto.AttachmentRequest;
import com.notiflow.dto.MessageListResponse;
import com.notiflow.dto.MessageDto;
import com.notiflow.dto.MessageRequest;
import com.notiflow.model.AttachmentMetadata;
import com.notiflow.model.MessageDocument;
import com.notiflow.model.MessageStatus;
import com.notiflow.service.SchoolService;
import com.notiflow.util.CurrentUser;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import com.google.auth.oauth2.GoogleCredentials;
import com.google.auth.oauth2.ServiceAccountCredentials;

import java.time.Instant;
import java.time.Year;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.ExecutionException;
import java.util.stream.Collectors;
import java.util.concurrent.TimeUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;
import java.nio.charset.StandardCharsets;

@Service
public class MessageService {

    private static final int MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10MB
    private static final int MAX_SEARCH_SCAN = 5000;
    private final Firestore firestore;
    private final EmailService emailService;
    private final Storage storage;
    private final SchoolService schoolService;
    private final String attachmentsBucket;
    private final DeviceTokenService deviceTokenService;
    private final String fcmServerKey;
    private final String fcmCredentialsJson;
    private final String fcmProjectId;
    private GoogleCredentials fcmCredentials;

    public MessageService(
            Firestore firestore,
            EmailService emailService,
            Storage storage,
            SchoolService schoolService,
            DeviceTokenService deviceTokenService,
            @org.springframework.beans.factory.annotation.Value("${ATTACHMENTS_BUCKET:}") String attachmentsBucket,
            @org.springframework.beans.factory.annotation.Value("${app.fcm.server-key:}") String fcmServerKey,
            @org.springframework.beans.factory.annotation.Value("${app.fcm.credentials-json:}") String fcmCredentialsJson,
            @org.springframework.beans.factory.annotation.Value("${app.fcm.project-id:}") String fcmProjectId
    ) {
        this.firestore = firestore;
        this.emailService = emailService;
        this.storage = storage;
        this.schoolService = schoolService;
        this.attachmentsBucket = attachmentsBucket;
        this.deviceTokenService = deviceTokenService;
        this.fcmServerKey = fcmServerKey;
        this.fcmCredentialsJson = fcmCredentialsJson;
        this.fcmProjectId = fcmProjectId;
        this.fcmCredentials = parseCredentials(fcmCredentialsJson);
    }

    public MessageListResponse list(String schoolId, boolean isGlobal, String year, String recipientEmailFilter, String query, int page, int pageSize) {
        try {
            int safePage = Math.max(1, page);
            int safeSize = Math.min(Math.max(1, pageSize), 100);
            com.google.cloud.firestore.Query base = firestore.collectionGroup("messages");
            if (!isGlobal || (schoolId != null && !schoolId.isBlank())) {
                String targetSchool = (schoolId == null || schoolId.isBlank()) ? "global" : schoolId;
                base = base.whereEqualTo("schoolId", targetSchool);
            }
            if (year != null && !year.isBlank()) {
                base = base.whereEqualTo("year", year);
            }
            if (recipientEmailFilter != null && !recipientEmailFilter.isBlank()) {
                base = base.whereArrayContains("recipients", recipientEmailFilter);
            }
            return fetch(base, query, safePage, safeSize);
        } catch (InterruptedException | ExecutionException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("Error listando mensajes", e);
        }
    }

    public MessageDto getById(String id) {
        try {
            DocumentReference ref = findMessageRef(id, null);
            if (ref == null) {
                throw new ResponseStatusException(org.springframework.http.HttpStatus.NOT_FOUND, "Mensaje no encontrado");
            }
            var snap = ref.get().get();
            MessageDocument msg = snap.exists() ? snap.toObject(MessageDocument.class) : null;
            if (msg == null) {
                throw new ResponseStatusException(org.springframework.http.HttpStatus.INTERNAL_SERVER_ERROR, "Mensaje inválido");
            }
            msg.setId(snap.getId());
            return toDto(msg, CurrentUser.fromContext().orElse(null));
        } catch (InterruptedException | ExecutionException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("Error obteniendo mensaje", e);
        }
    }

    private MessageListResponse fetch(com.google.cloud.firestore.Query baseQuery, String search, int page, int size) throws ExecutionException, InterruptedException {
        String normalized = search == null ? "" : search.trim().toLowerCase();
        boolean hasSearch = !normalized.isBlank();
        int safePage = Math.max(1, page);
        int safeSize = Math.min(Math.max(1, size), 100);
        CurrentUser current = CurrentUser.fromContext().orElse(null);
        com.google.cloud.firestore.Query sorted = baseQuery.orderBy("createdAt", com.google.cloud.firestore.Query.Direction.DESCENDING);

        if (hasSearch) {
            ApiFuture<QuerySnapshot> future = sorted.limit(MAX_SEARCH_SCAN).get();
            List<QueryDocumentSnapshot> docs = future.get().getDocuments();
            List<MessageDto> filtered = docs.stream()
                    .map(doc -> {
                        MessageDocument msg = doc.toObject(MessageDocument.class);
                        if (msg == null) return null;
                        msg.setId(doc.getId());
                        return toDto(msg, current);
                    })
                    .filter(Objects::nonNull)
                    .filter(dto -> matchesQuery(dto, normalized))
                    .collect(Collectors.toList());
            boolean reachedLimit = docs.size() == MAX_SEARCH_SCAN;
            int from = Math.min((safePage - 1) * safeSize, filtered.size());
            int to = Math.min(from + safeSize, filtered.size());
            List<MessageDto> pageItems = filtered.subList(from, to);
            boolean hasMore = reachedLimit || to < filtered.size();
            long total = filtered.size() + (reachedLimit ? 1 : 0);
            return new MessageListResponse(pageItems, total, safePage, safeSize, hasMore);
        } else {
            long total = count(sorted);
            ApiFuture<QuerySnapshot> query = sorted
                    .offset((safePage - 1) * safeSize)
                    .limit(safeSize)
                    .get();
            List<QueryDocumentSnapshot> docs = query.get().getDocuments();
            List<MessageDto> items = docs.stream()
                    .map(doc -> {
                        MessageDocument msg = doc.toObject(MessageDocument.class);
                        if (msg == null) return null;
                        msg.setId(doc.getId());
                        return toDto(msg, current);
                    })
                    .filter(Objects::nonNull)
                    .collect(Collectors.toList());
            boolean hasMore = (long) safePage * safeSize < total;
            return new MessageListResponse(items, total, safePage, safeSize, hasMore);
        }
    }

    private boolean matchesQuery(MessageDto dto, String q) {
        String content = dto.content() == null ? "" : dto.content().toLowerCase();
        String senderName = dto.senderName() == null ? "" : dto.senderName().toLowerCase();
        String senderEmail = dto.senderEmail() == null ? "" : dto.senderEmail().toLowerCase();
        String reason = dto.reason() == null ? "" : dto.reason().toLowerCase();
        String recipients = dto.recipients() == null ? "" : String.join(",", dto.recipients()).toLowerCase();
        return content.contains(q) || senderName.contains(q) || senderEmail.contains(q) || recipients.contains(q) || reason.contains(q);
    }

    private long count(com.google.cloud.firestore.Query q) throws ExecutionException, InterruptedException {
        AggregateQuery countQuery = q.count();
        AggregateQuerySnapshot snapshot = countQuery.get().get();
        return snapshot.getCount();
    }

    private com.google.cloud.firestore.CollectionReference tenantMessages(String tenantId) {
        String safeTenant = tenantId == null || tenantId.isBlank() ? "global" : tenantId;
        return firestore.collection("tenants").document(safeTenant).collection("messages");
    }

    private DocumentReference findMessageRef(String messageId, String schoolId) throws ExecutionException, InterruptedException {
        com.google.cloud.firestore.Query q = firestore.collectionGroup("messages")
                .whereEqualTo("id", messageId)
                .limit(1);
        if (schoolId != null && !schoolId.isBlank()) {
            q = q.whereEqualTo("schoolId", schoolId);
        }
        List<QueryDocumentSnapshot> docs = q.get().get().getDocuments();
        if (docs.isEmpty()) return null;
        return docs.get(0).getReference();
    }

    public void delete(String id) {
        try {
            DocumentReference ref = findMessageRef(id, null);
            if (ref == null) {
                throw new ResponseStatusException(org.springframework.http.HttpStatus.NOT_FOUND, "Mensaje no encontrado");
            }
            ref.delete().get();
        } catch (InterruptedException | ExecutionException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("Error eliminando mensaje", e);
        }
    }

    public MessageDto create(MessageRequest request, String senderId, String senderName) {
        try {
            String resolvedYear = request.year() != null && !request.year().isBlank()
                    ? request.year()
                    : String.valueOf(Year.now().getValue());
            String schoolId = request.schoolId();
            CurrentUser current = CurrentUser.fromContext().orElse(null);
            if ((schoolId == null || schoolId.isBlank()) && current != null) {
                schoolId = current.schoolId();
            }
            List<String> channels = request.channels() != null && !request.channels().isEmpty()
                    ? request.channels()
                    : List.of("email");

            MessageDocument msg = new MessageDocument();
            msg.setId(UUID.randomUUID().toString());
            msg.setContent(request.content());
            msg.setSenderId(senderId);
            msg.setSenderName(senderName);
            msg.setSenderEmail(senderId);
            msg.setRecipients(request.recipients());
            msg.setChannels(channels);
            msg.setSchoolId(schoolId);
            msg.setReason(request.reason());
            msg.setYear(resolvedYear);
            msg.setAppReadBy(new ArrayList<>());
            if (channels.contains("app") && request.recipients() != null) {
                Map<String, MessageStatus> perRecipient = new HashMap<>();
                for (String r : request.recipients()) {
                    if (r != null) {
                        perRecipient.put(r, MessageStatus.PENDING);
                    }
                }
                msg.setAppStatuses(perRecipient);
            }
            List<AttachmentRequest> attachments = request.attachments() == null
                    ? List.of()
                    : request.attachments().stream().filter(Objects::nonNull).toList();
            validateAttachments(attachments);

            List<AttachmentMetadata> storedAttachments = storeAttachments(msg.getId(), schoolId, resolvedYear, attachments);
            msg.setAttachments(storedAttachments);

            Instant now = Instant.now();
            Instant scheduledAt = parseScheduledAt(request.scheduleAt());
            boolean isScheduled = scheduledAt != null && scheduledAt.isAfter(now.plusSeconds(30));

            String schoolLogo = null;
            String schoolName = null;
            try {
                if (schoolId != null && !schoolId.isBlank()) {
                    var school = schoolService.getById(schoolId);
                    schoolLogo = school != null ? school.getLogoUrl() : null;
                    schoolName = school != null ? school.getName() : null;
                }
            } catch (Exception ignore) {
                // si falla no bloqueamos el envío
            }

            msg.setCreatedAt(now);
            if (isScheduled) {
                msg.setScheduledAt(scheduledAt);
                msg.setStatus(MessageStatus.SCHEDULED);
                if (channels.contains("email")) {
                    msg.setEmailStatus(MessageStatus.PENDING);
                }
                if (channels.contains("app")) {
                    msg.setAppStatus(MessageStatus.PENDING);
                }
                DocumentReference ref = tenantMessages(schoolId).document(msg.getId());
                ref.set(msg).get();
                return toDto(msg, CurrentUser.fromContext().orElse(null));
            }

            // Envío inmediato
            deliverNow(msg, attachments, channels, schoolLogo, schoolName, schoolId);
            return toDto(msg, CurrentUser.fromContext().orElse(null));
        } catch (InterruptedException | ExecutionException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("Error creando mensaje", e);
        }
    }

    private void validateAttachments(List<AttachmentRequest> attachments) {
        for (AttachmentRequest att : attachments) {
            if (att.base64() == null || att.base64().isBlank()) {
                throw new ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST, "El adjunto no contiene datos");
            }
            byte[] data;
            try {
                data = java.util.Base64.getDecoder().decode(att.base64());
            } catch (IllegalArgumentException ex) {
                throw new ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST, "Adjunto inválido (base64)");
            }
            if (data.length > MAX_ATTACHMENT_BYTES) {
                throw new ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST, "Adjunto excede el límite de 10MB: " + att.fileName());
            }
        }
    }

    public int processScheduled() {
        try {
            Instant now = Instant.now();
            var query = firestore.collectionGroup("messages")
                    .whereEqualTo("status", MessageStatus.SCHEDULED)
                    .whereLessThanOrEqualTo("scheduledAt", com.google.cloud.Timestamp.ofTimeSecondsAndNanos(now.getEpochSecond(), now.getNano()))
                    .get()
                    .get();
            List<QueryDocumentSnapshot> docs = query.getDocuments();
            int processed = 0;
            for (QueryDocumentSnapshot doc : docs) {
                MessageDocument msg = doc.toObject(MessageDocument.class);
                if (msg == null) continue;
                msg.setId(doc.getId());
                List<AttachmentRequest> attReqs = buildAttachmentsFromMetadata(msg.getAttachments());
                String schoolLogo = null;
                String schoolName = null;
                try {
                    if (msg.getSchoolId() != null && !msg.getSchoolId().isBlank()) {
                        var school = schoolService.getById(msg.getSchoolId());
                        schoolLogo = school != null ? school.getLogoUrl() : null;
                        schoolName = school != null ? school.getName() : null;
                    }
                } catch (Exception ignore) {}
                deliverNow(msg, attReqs, msg.getChannels(), schoolLogo, schoolName, msg.getSchoolId());
                processed++;
            }
            return processed;
        } catch (InterruptedException | ExecutionException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("Error procesando mensajes programados", e);
        }
    }

    private List<AttachmentRequest> buildAttachmentsFromMetadata(List<AttachmentMetadata> metadataList) {
        if (metadataList == null || metadataList.isEmpty() || attachmentsBucket == null || attachmentsBucket.isBlank()) {
            return List.of();
        }
        return metadataList.stream()
                .map(meta -> {
                    if (meta.getObjectPath() == null) return null;
                    try {
                        var blob = storage.get(com.google.cloud.storage.BlobId.of(attachmentsBucket, meta.getObjectPath()));
                        if (blob == null) return null;
                        byte[] data = blob.getContent();
                        String base64 = java.util.Base64.getEncoder().encodeToString(data);
                        return new AttachmentRequest(
                                meta.getFileName(),
                                meta.getMimeType(),
                                base64,
                                meta.getInline(),
                                meta.getCid()
                        );
                    } catch (Exception e) {
                        org.slf4j.LoggerFactory.getLogger(MessageService.class)
                                .warn("No se pudo reconstruir adjunto {}: {}", meta.getFileName(), e.getMessage());
                        return null;
                    }
                })
                .filter(Objects::nonNull)
                .toList();
    }

    private void deliverNow(MessageDocument msg, List<AttachmentRequest> attachments, List<String> channels, String schoolLogo, String schoolName, String schoolId) {
        boolean mailOk = true;
        MessageStatus emailStatus = null;
        MessageStatus appStatus = null;

        String htmlBody = buildHtmlBody(msg.getContent(), msg.getSenderName(), msg.getSenderEmail(), msg.getReason(), attachments, schoolLogo, schoolName);
        String textBody = msg.getContent();
        String subject = (schoolName != null && !schoolName.isBlank()
                ? schoolName
                : "Notiflow") + " - Nuevo mensaje de " + (msg.getSenderName() != null ? msg.getSenderName() : "Usuario");

        if (channels.contains("email") && emailService.isEnabled()) {
            List<String> emails = msg.getRecipients() != null
                    ? msg.getRecipients().stream().filter(r -> r != null && r.contains("@")).collect(Collectors.toList())
                    : List.of();
            if (emails.isEmpty()) {
                mailOk = false;
                org.slf4j.LoggerFactory.getLogger(MessageService.class)
                        .warn("No se encontraron correos válidos en recipients");
            }
            for (String to : emails) {
                boolean sent = emailService.sendMessageEmail(
                        to,
                        subject,
                        htmlBody,
                        textBody,
                        attachments
                );
                mailOk = mailOk && sent;
            }
        } else {
            if (channels.contains("email")) {
                mailOk = false;
                org.slf4j.LoggerFactory.getLogger(MessageService.class)
                        .warn("EmailService no está habilitado; no se enviarán correos");
            }
        }
        if (channels.contains("email")) {
            emailStatus = mailOk ? MessageStatus.SENT : MessageStatus.FAILED;
        }
        if (channels.contains("app")) {
            appStatus = MessageStatus.PENDING;
            List<String> tokens = deviceTokenService.tokensForRecipients(msg.getRecipients(), schoolId);
            if (!tokens.isEmpty()) {
                sendPushNotifications(tokens, subject, msg.getReason(), msg.getId(), schoolId);
            }
        }
        MessageStatus status = mailOk ? MessageStatus.SENT : MessageStatus.FAILED;
        msg.setStatus(status);
        msg.setEmailStatus(emailStatus);
        msg.setAppStatus(appStatus);
        msg.setScheduledAt(null);

        try {
            tenantMessages(schoolId).document(msg.getId()).set(msg).get();
        } catch (InterruptedException | ExecutionException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("Error actualizando mensaje enviado", e);
        }
    }

    private Instant parseScheduledAt(String value) {
        if (value == null || value.isBlank()) return null;
        try {
            // intenta instant (ISO con zona u offset)
            try {
                return Instant.parse(value);
            } catch (java.time.format.DateTimeParseException ignored) {}
            try {
                return java.time.OffsetDateTime.parse(value).toInstant();
            } catch (java.time.format.DateTimeParseException ignored) {}
            java.time.LocalDateTime ldt = java.time.LocalDateTime.parse(value);
            return ldt.atZone(java.time.ZoneId.systemDefault()).toInstant();
        } catch (java.time.format.DateTimeParseException ex) {
            throw new ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST, "Fecha de programación inválida");
        }
    }

    private boolean canDelete(CurrentUser user, MessageDocument msg) {
        if (user == null) return false;
        String role = user.role() != null ? user.role().toLowerCase() : "";
        if (user.isSuperAdmin() || user.isGlobalAdmin()) return true;
        if ("admin".equals(role)) {
            return user.hasSchoolScope(msg.getSchoolId());
        }
        if ("teacher".equals(role)) {
            return user.email() != null && user.email().equalsIgnoreCase(msg.getSenderEmail());
        }
        return false;
    }

    private MessageDto toDto(MessageDocument msg, CurrentUser user) {
        boolean deletable = canDelete(user, msg);
        return new MessageDto(
                msg.getId(),
                msg.getContent(),
                msg.getSenderName(),
                msg.getSenderEmail(),
                msg.getRecipients(),
                msg.getChannels(),
                msg.getEmailStatus(),
                msg.getAppStatus(),
                msg.getAppReadBy(),
                msg.getAppStatuses(),
                msg.getSchoolId(),
                msg.getYear(),
                msg.getStatus(),
                msg.getScheduledAt(),
                msg.getCreatedAt(),
                msg.getAttachments(),
                msg.getReason(),
                deletable
        );
    }
    
    private List<AttachmentMetadata> storeAttachments(String messageId, String schoolId, String year, List<AttachmentRequest> attachments) {
        if (attachments == null || attachments.isEmpty() || attachmentsBucket == null || attachmentsBucket.isBlank()) {
            return List.of();
        }
        return attachments.stream().map(att -> {
            if (att.base64() == null || att.fileName() == null) return null;
            byte[] data = java.util.Base64.getDecoder().decode(att.base64());
            String cleanName = att.fileName().replaceAll("[^a-zA-Z0-9._-]", "_");
            String key = String.format("messages/%s/%s/%s", schoolId != null ? schoolId : "global", messageId, cleanName);
            BlobInfo blobInfo = BlobInfo.newBuilder(attachmentsBucket, key)
                    .setContentType(att.mimeType() != null ? att.mimeType() : "application/octet-stream")
                    .build();
            storage.create(blobInfo, data);
            java.net.URL signed = storage.signUrl(blobInfo, 30, TimeUnit.DAYS);
            return new AttachmentMetadata(
                    att.fileName(),
                    att.mimeType(),
                    (long) data.length,
                    signed != null ? signed.toString() : null,
                    att.inline(),
                    att.cid(),
                    key
            );
        }).filter(Objects::nonNull).toList();
    }

    private void sendPushNotifications(List<String> tokens, String title, String body, String messageId, String schoolId) {
        if (fcmCredentials != null) {
            sendPushV1(tokens, title, body, messageId, schoolId);
        } else if (fcmServerKey != null && !fcmServerKey.isBlank()) {
            sendPushLegacy(tokens, title, body, messageId, schoolId);
        }
    }

    private void sendPushLegacy(List<String> tokens, String title, String body, String messageId, String schoolId) {
        try {
            java.net.URL url = new java.net.URL("https://fcm.googleapis.com/fcm/send");
            java.net.HttpURLConnection conn = (java.net.HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Authorization", "key=" + fcmServerKey);
            conn.setRequestProperty("Content-Type", "application/json; UTF-8");
            conn.setDoOutput(true);
            String payload = """
                    {
                      "registration_ids": %s,
                      "notification": {
                        "title": "%s",
                        "body": "%s"
                      },
                      "data": {
                        "messageId": "%s",
                        "schoolId": "%s"
                      }
                    }
                    """.formatted(
                    new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(tokens),
                    title.replace("\"", "'"),
                    body != null ? body.replace("\"", "'") : "",
                    messageId,
                    schoolId != null ? schoolId : "global"
            );
            try (java.io.OutputStream os = conn.getOutputStream()) {
                byte[] input = payload.getBytes(java.nio.charset.StandardCharsets.UTF_8);
                os.write(input, 0, input.length);
            }
            conn.getResponseCode(); // dispara la llamada
        } catch (Exception e) {
            org.slf4j.LoggerFactory.getLogger(MessageService.class)
                    .warn("No se pudo enviar push FCM (legacy): {}", e.getMessage());
        }
    }

    private void sendPushV1(List<String> tokens, String title, String body, String messageId, String schoolId) {
        try {
            if (fcmCredentials == null) return;
            String project = resolveFcmProjectId();
            if (project == null || project.isBlank()) {
                org.slf4j.LoggerFactory.getLogger(MessageService.class)
                        .warn("No se pudo resolver projectId para FCM v1");
                return;
            }
            String urlBase = "https://fcm.googleapis.com/v1/projects/" + project + "/messages:send";
            String bearer = getAccessToken();
            for (String token : tokens) {
                if (token == null || token.isBlank()) continue;
                java.net.URL url = new java.net.URL(urlBase);
                java.net.HttpURLConnection conn = (java.net.HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Authorization", "Bearer " + bearer);
                conn.setRequestProperty("Content-Type", "application/json; UTF-8");
                conn.setDoOutput(true);
                String payload = """
                        {
                          "message": {
                            "token": "%s",
                            "notification": {
                              "title": "%s",
                              "body": "%s"
                            },
                            "data": {
                              "messageId": "%s",
                              "schoolId": "%s"
                            }
                          }
                        }
                        """.formatted(
                        token,
                        title.replace("\"", "'"),
                        body != null ? body.replace("\"", "'") : "",
                        messageId,
                        schoolId != null ? schoolId : "global"
                );
                try (java.io.OutputStream os = conn.getOutputStream()) {
                    byte[] input = payload.getBytes(StandardCharsets.UTF_8);
                    os.write(input, 0, input.length);
                }
                conn.getResponseCode();
            }
        } catch (Exception e) {
            org.slf4j.LoggerFactory.getLogger(MessageService.class)
                    .warn("No se pudo enviar push FCM v1: {}", e.getMessage());
        }
    }

    private GoogleCredentials parseCredentials(String json) {
        try {
            if (json == null || json.isBlank()) return null;
            GoogleCredentials creds = GoogleCredentials.fromStream(
                    new java.io.ByteArrayInputStream(json.getBytes(StandardCharsets.UTF_8))
            ).createScoped(List.of("https://www.googleapis.com/auth/cloud-platform"));
            creds.refreshIfExpired();
            return creds;
        } catch (Exception e) {
            org.slf4j.LoggerFactory.getLogger(MessageService.class)
                    .warn("No se pudieron leer credenciales FCM v1: {}", e.getMessage());
            return null;
        }
    }

    private String resolveFcmProjectId() {
        if (fcmProjectId != null && !fcmProjectId.isBlank()) return fcmProjectId;
        if (fcmCredentials instanceof ServiceAccountCredentials sac && sac.getProjectId() != null) {
            return sac.getProjectId();
        }
        if (firestore != null && firestore.getOptions() != null) {
            return firestore.getOptions().getProjectId();
        }
        return null;
    }

    private String getAccessToken() throws java.io.IOException {
        if (fcmCredentials == null) return null;
        fcmCredentials.refreshIfExpired();
        return fcmCredentials.getAccessToken().getTokenValue();
    }

    public void markAsRead(String messageId, String readerEmail) {
        try {
            if (readerEmail == null || readerEmail.isBlank()) {
                throw new ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST, "Email requerido");
            }
            DocumentReference ref = findMessageRef(messageId, null);
            if (ref == null) {
                throw new ResponseStatusException(org.springframework.http.HttpStatus.NOT_FOUND, "Mensaje no encontrado");
            }
            var snapshot = ref.get().get();
            MessageDocument msg = snapshot.toObject(MessageDocument.class);
            if (msg == null) {
                throw new ResponseStatusException(org.springframework.http.HttpStatus.INTERNAL_SERVER_ERROR, "Mensaje inválido");
            }
            if (msg.getRecipients() == null || !msg.getRecipients().contains(readerEmail)) {
                throw new ResponseStatusException(org.springframework.http.HttpStatus.FORBIDDEN, "No eres destinatario de este mensaje");
            }

            List<String> readBy = msg.getAppReadBy() != null ? new ArrayList<>(msg.getAppReadBy()) : new ArrayList<>();
            if (!readBy.contains(readerEmail)) {
                readBy.add(readerEmail);
            }
            msg.setAppReadBy(readBy);

            Map<String, MessageStatus> perRecipient = msg.getAppStatuses() != null ? new HashMap<>(msg.getAppStatuses()) : new HashMap<>();
            perRecipient.put(readerEmail, MessageStatus.READ);
            msg.setAppStatuses(perRecipient);

            // Si todos los destinatarios que tienen canal app ya leyeron, marcar appStatus como READ
            boolean allRead = false;
            if (msg.getRecipients() != null && !msg.getRecipients().isEmpty()) {
                long appRecipients = msg.getRecipients().size();
                long readCount = readBy.size();
                allRead = readCount >= appRecipients;
            }
            if (msg.getChannels() != null && msg.getChannels().contains("app")) {
                msg.setAppStatus(allRead ? MessageStatus.READ : MessageStatus.PENDING);
            }

            ref.set(msg).get();
        } catch (InterruptedException | ExecutionException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("No se pudo marcar como leído", e);
        }
    }

    private String buildHtmlBody(String content, String senderName, String senderEmail, String reason, List<AttachmentRequest> attachments, String logoUrl, String schoolName) {
        List<AttachmentRequest> attList = attachments == null ? java.util.Collections.emptyList() : attachments;
        String htmlContent = renderContentHtml(content);

        // Adjunta una imagen inline si existe
        AttachmentRequest inlineImg = attList.stream()
                .filter(a -> Boolean.TRUE.equals(a.inline()) && a.cid() != null && a.mimeType() != null && a.mimeType().startsWith("image/"))
                .findFirst()
                .orElse(null);
        if (inlineImg != null) {
            htmlContent = htmlContent + "<p style=\"margin-top:12px;\"><img src=\"cid:" + inlineImg.cid() + "\" alt=\"imagen adjunta\" style=\"max-width:100%;\"/></p>";
        }

        String logoBlock = (logoUrl != null && !logoUrl.isBlank())
                ? "<img src=\"" + logoUrl + "\" alt=\"Logo\" style=\"max-height:120px; display:block;\" />"
                : "<span style=\"font-weight:700;font-size:18px;\">Notiflow</span>";
        String headerText = (reason != null && !reason.isBlank()) ? reason : "Mensaje";
        String senderLine = (senderName != null ? senderName : "Usuario") +
                (senderEmail != null && !senderEmail.isBlank() ? " (" + senderEmail + ")" : "");
        String schoolLine = (schoolName != null && !schoolName.isBlank()) ? schoolName : "Notiflow";

        return """
                <div style="font-family: 'Helvetica Neue', Arial, sans-serif; background:#e0f2fe; padding:24px;">
                  <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
                    <div style="background:#fbbf24;color:#7a4c00;padding:16px 20px;font-size:16px;font-weight:700;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
                      <div style="flex:0 0 auto;">%s</div>
                      <div style="flex:1;min-width:200px;">
                        <div style="font-size:14px;color:#92400e;font-weight:700;">%s</div>
                        <div style="font-size:13px;color:#b45309;">Asunto: %s</div>
                        <div style="font-size:12px;color:#b45309;">Enviado por: %s</div>
                      </div>
                    </div>
                    <div style="padding:20px;font-size:15px;color:#111827;line-height:1.6;">
                      %s
                    </div>
                    <div style="padding:16px 20px;border-top:1px solid #e5e7eb;font-size:13px;color:#6b7280;">
                      Enviado a través de Notiflow
                    </div>
                  </div>
                </div>
                """.formatted(logoBlock, schoolLine, headerText, senderLine, htmlContent);
    }

    private String renderContentHtml(String content) {
        String safeContent = content == null ? "" : content;
        String escaped = safeContent
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\n", "<br/>");
        // Bold with **text**
        String withBold = escaped.replaceAll("\\*\\*(.+?)\\*\\*", "<strong>$1</strong>");
        return linkify(withBold);
    }

    private String linkify(String html) {
        if (html == null || html.isBlank()) return "";
        java.util.regex.Pattern pattern = java.util.regex.Pattern.compile("(https?://[^\\s<]+)", java.util.regex.Pattern.CASE_INSENSITIVE);
        java.util.regex.Matcher matcher = pattern.matcher(html);
        StringBuffer sb = new StringBuffer();
        while (matcher.find()) {
            String url = matcher.group(1);
            String anchor = "<a href=\"" + url + "\" target=\"_blank\" rel=\"noopener noreferrer\" style=\"color:#0ea5e9;\">" + url + "</a>";
            matcher.appendReplacement(sb, anchor);
        }
        matcher.appendTail(sb);
        return sb.toString();
    }
}
