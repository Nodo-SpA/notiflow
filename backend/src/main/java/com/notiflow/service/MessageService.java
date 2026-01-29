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
import com.notiflow.dto.GuardianContact;
import com.notiflow.dto.MessageListResponse;
import com.notiflow.dto.MessageDto;
import com.notiflow.dto.MessageRequest;
import com.notiflow.dto.RecipientDetail;
import com.notiflow.model.AttachmentMetadata;
import com.notiflow.model.GroupDocument;
import com.notiflow.service.GroupService;
import com.notiflow.model.MessageDocument;
import com.notiflow.model.MessageStatus;
import com.notiflow.model.StudentDocument;
import com.notiflow.service.SchoolService;
import com.notiflow.util.CurrentUser;
import com.notiflow.model.UserDocument;
import com.notiflow.model.UserRole;
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
    private final TeacherPermissionService teacherPermissionService;
    private final GroupService groupService;
    private final StudentService studentService;
    private final UserService userService;
    private final String trackingBaseUrl;
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
            TeacherPermissionService teacherPermissionService,
            GroupService groupService,
            StudentService studentService,
            UserService userService,
            @org.springframework.beans.factory.annotation.Value("${app.tracking-base-url:https://api.notiflow.app}") String trackingBaseUrl,
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
        this.groupService = groupService;
        this.studentService = studentService;
        this.userService = userService;
        this.trackingBaseUrl = trackingBaseUrl != null && !trackingBaseUrl.isBlank() ? trackingBaseUrl : "https://api.notiflow.app";
        this.fcmServerKey = fcmServerKey;
        this.fcmCredentialsJson = fcmCredentialsJson;
        this.fcmProjectId = fcmProjectId;
        this.fcmCredentials = parseCredentials(fcmCredentialsJson);
        this.teacherPermissionService = teacherPermissionService;
    }

    public MessageListResponse list(String schoolId, boolean isGlobal, String year, String senderEmailFilter, String recipientEmailFilter, String query, int page, int pageSize) {
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
            if (senderEmailFilter != null && !senderEmailFilter.isBlank()) {
                base = base.whereEqualTo("senderEmail", senderEmailFilter.toLowerCase());
            }
            if (recipientEmailFilter != null && !recipientEmailFilter.isBlank()) {
                base = base.whereArrayContains("recipients", recipientEmailFilter.toLowerCase());
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
            List<String> groupIds = request.groupIds() == null ? List.of() : request.groupIds().stream().filter(g -> g != null && !g.isBlank()).map(String::trim).toList();
            senderName = resolveSenderName(senderName, senderId);
            String allStudentsGroupId = groupService.systemId(GroupService.SYSTEM_ALL_STUDENTS, resolvedYear);
            String allCommunityGroupId = groupService.systemId(GroupService.SYSTEM_ALL_COMMUNITY, resolvedYear);

            // Restricción por profesor: solo grupos permitidos
            if (current != null && "teacher".equalsIgnoreCase(current.role())) {
                List<String> allowed = teacherPermissionService.getAllowedGroups(schoolId, senderId);
                if (!groupIds.isEmpty()) {
                    if (allowed.isEmpty()) {
                        throw new ResponseStatusException(org.springframework.http.HttpStatus.FORBIDDEN, "No tienes permisos de envío a grupos");
                    }
                    boolean subset = groupIds.stream().allMatch(allowed::contains);
                    if (!subset) {
                        throw new ResponseStatusException(org.springframework.http.HttpStatus.FORBIDDEN, "No puedes enviar a grupos fuera de tus permisos");
                    }
                } else {
                    // Envío directo (sin grupos): solo a usuarios de plataforma (no estudiantes)
                    validateTeacherDirectRecipients(request.recipients());
                }
            }

            MessageDocument msg = new MessageDocument();
            msg.setId(UUID.randomUUID().toString());
            msg.setContent(request.content());
            msg.setSenderId(senderId);
            msg.setSenderName(senderName);
            msg.setSenderEmail(senderId);
            List<String> normalizedRecipients = request.recipients() == null
                    ? List.of()
                    : request.recipients().stream()
                    .filter(Objects::nonNull)
                    .map(String::trim)
                    .filter(s -> !s.isBlank())
                    .map(String::toLowerCase)
                    .distinct()
                    .toList();
            if ((groupIds == null || groupIds.isEmpty()) && normalizedRecipients.isEmpty()) {
                throw new ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST, "No hay destinatarios");
            }

            // Si se usan grupos del sistema, enriquecemos destinatarios y marcamos broadcast
            boolean broadcast = false;
            if (groupIds != null && !groupIds.isEmpty()) {
                List<String> expanded = new ArrayList<>(normalizedRecipients);
                for (String gid : groupIds) {
                    if (gid == null || gid.isBlank()) continue;
                    try {
                        var gOpt = groupService.findById(gid, schoolId);
                        if (gOpt.isPresent()) {
                            GroupDocument g = gOpt.get();
                            if (g.getMemberIds() != null) {
                                expanded.addAll(g.getMemberIds());
                            }
                            if (Boolean.TRUE.equals(g.getSystem()) &&
                                    (GroupService.SYSTEM_ALL_STUDENTS.equalsIgnoreCase(g.getSystemType())
                                            || GroupService.SYSTEM_ALL_COMMUNITY.equalsIgnoreCase(g.getSystemType()))) {
                                broadcast = true;
                            }
                        }
                    } catch (Exception ignore) {
                        // si no se puede leer el grupo seguimos con los destinatarios actuales
                    }
                }
                normalizedRecipients = expanded.stream()
                        .filter(Objects::nonNull)
                        .map(String::trim)
                        .filter(s -> !s.isBlank())
                        .map(String::toLowerCase)
                        .distinct()
                        .toList();
            }
            if (normalizedRecipients.isEmpty()) {
                throw new ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST, "No hay destinatarios válidos");
            }
            msg.setRecipients(normalizedRecipients);
            msg.setChannels(channels);
            msg.setSchoolId(schoolId);
            msg.setReason(request.reason());
            msg.setYear(resolvedYear);
            msg.setGroupIds(groupIds);
            if (!broadcast && (groupIds.contains(allStudentsGroupId) || groupIds.contains(allCommunityGroupId))) {
                broadcast = true;
            }
            Map<String, String> recipientNames = resolveRecipientNames(normalizedRecipients);
            msg.setRecipientNames(recipientNames);
            msg.setRecipientsDetails(buildRecipientDetails(normalizedRecipients, recipientNames));
            msg.setAppReadBy(new ArrayList<>());
            Map<String, MessageStatus> perRecipientEmail = new HashMap<>();
            if (channels.contains("app") && !normalizedRecipients.isEmpty()) {
                List<String> studentOnly = studentRecipientEmails(normalizedRecipients);
                if (!studentOnly.isEmpty()) {
                    Map<String, MessageStatus> perRecipient = new HashMap<>();
                    for (String r : studentOnly) {
                        if (r != null) {
                            String key = r.trim().toLowerCase();
                            if (!key.isBlank()) {
                                perRecipient.put(key, MessageStatus.PENDING);
                            }
                        }
                    }
                    msg.setAppStatuses(perRecipient);
                } else {
                    channels = channels.stream().filter(c -> !"app".equalsIgnoreCase(c)).toList();
                    msg.setChannels(channels);
                }
            }
            if (channels.contains("email") && !normalizedRecipients.isEmpty()) {
                for (String key : normalizedRecipients) {
                    if (key != null && !key.isBlank()) {
                        perRecipientEmail.put(key, MessageStatus.PENDING);
                    }
                }
            }
            msg.setEmailStatuses(perRecipientEmail.isEmpty() ? null : perRecipientEmail);
            List<AttachmentRequest> attachments = request.attachments() == null
                    ? List.of()
                    : request.attachments().stream().filter(Objects::nonNull).toList();
            validateAttachments(attachments);

            List<AttachmentMetadata> storedAttachments = storeAttachments(msg.getId(), schoolId, resolvedYear, attachments);
            msg.setAttachments(storedAttachments);

            Instant now = Instant.now();
            Instant scheduledAt = parseScheduledAt(request.scheduleAt());
            boolean isScheduled = scheduledAt != null && scheduledAt.isAfter(now.plusSeconds(30));
            msg.setBroadcast(broadcast || normalizedRecipients.size() > 50);

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

    private String resolveSenderName(String name, String email) {
        String cleanName = name == null ? "" : name.trim();
        String cleanEmail = email == null ? "" : email.trim().toLowerCase();
        if (cleanName.isBlank() && !cleanEmail.isBlank()) {
            cleanName = cleanEmail.split("@")[0];
        }
        if (!cleanEmail.isBlank()) {
            // Si el nombre es idéntico al correo, intenta buscar el nombre real en usuarios
            if (cleanName.equalsIgnoreCase(cleanEmail)) {
                String fetched = fetchUserNameByEmail(cleanEmail);
                if (fetched != null && !fetched.isBlank()) {
                    return fetched;
                }
            }
        }
        return cleanName.isBlank() ? "—" : cleanName;
    }

    private String fetchUserNameByEmail(String email) {
        try {
            ApiFuture<QuerySnapshot> query = firestore.collectionGroup("users")
                    .whereEqualTo("email", email.toLowerCase())
                    .limit(1)
                    .get();
            List<QueryDocumentSnapshot> docs = query.get().getDocuments();
            if (docs.isEmpty()) return null;
            UserDocument u = docs.get(0).toObject(UserDocument.class);
            if (u != null && u.getName() != null && !u.getName().isBlank()) {
                return u.getName();
            }
        } catch (InterruptedException | ExecutionException e) {
            Thread.currentThread().interrupt();
        }
        return null;
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
        Map<String, MessageStatus> perRecipientEmail = msg.getEmailStatuses() != null ? new HashMap<>(msg.getEmailStatuses()) : new HashMap<>();

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
                // usa el correo como "nombre" del destinatario para el chip Para
                String htmlBody = buildHtmlBody(
                        msg.getContent(),
                        msg.getSenderName(),
                        msg.getSenderEmail(),
                        msg.getReason(),
                        attachments,
                        schoolLogo,
                        schoolName,
                        to
                );
                String htmlWithTracking = appendTrackingPixel(htmlBody, msg.getId(), to);
                boolean sent = emailService.sendMessageEmail(
                        to,
                        subject,
                        htmlWithTracking,
                        textBody,
                        attachments
                );
                String key = to == null ? "" : to.trim().toLowerCase();
                if (!key.isBlank()) {
                    perRecipientEmail.put(key, sent ? MessageStatus.SENT : MessageStatus.FAILED);
                }
                mailOk = mailOk && sent;
            }
            msg.setEmailStatuses(perRecipientEmail);
        } else {
            if (channels.contains("email")) {
                mailOk = false;
                org.slf4j.LoggerFactory.getLogger(MessageService.class)
                        .warn("EmailService no está habilitado; no se enviarán correos");
                if (msg.getRecipients() != null) {
                    for (String r : msg.getRecipients()) {
                        if (r != null) {
                            String key = r.trim().toLowerCase();
                            if (!key.isBlank()) {
                                perRecipientEmail.put(key, MessageStatus.FAILED);
                            }
                        }
                    }
                    msg.setEmailStatuses(perRecipientEmail);
                }
            }
        }
        if (channels.contains("email")) {
            emailStatus = mailOk ? MessageStatus.SENT : MessageStatus.FAILED;
        }
        if (channels.contains("app")) {
            List<String> studentRecipients = studentRecipientEmails(msg.getRecipients());
            if (!studentRecipients.isEmpty()) {
                appStatus = MessageStatus.PENDING;
            }
            List<String> tokens = studentRecipients.isEmpty()
                    ? List.of()
                    : deviceTokenService.tokensForRecipients(studentRecipients, schoolId);
            if (!tokens.isEmpty()) {
                sendPushNotifications(tokens, subject, msg.getReason(), msg.getId(), schoolId);
                if (msg.getAppStatuses() != null && !msg.getAppStatuses().isEmpty()) {
                    Map<String, MessageStatus> updated = new HashMap<>(msg.getAppStatuses());
                    for (String key : updated.keySet()) {
                        updated.put(key, MessageStatus.SENT);
                    }
                    msg.setAppStatuses(updated);
                }
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

    private Map<String, String> resolveRecipientNames(List<String> recipients) {
        Map<String, String> result = new HashMap<>();
        if (recipients == null || recipients.isEmpty()) return result;
        for (String raw : recipients) {
            if (raw == null) continue;
            String email = raw.trim().toLowerCase();
            if (email.isBlank() || result.containsKey(email)) continue;
            String name = null;
            try {
                var userOpt = userService.findByEmail(email);
                if (userOpt.isPresent()) {
                    name = userOpt.get().getName();
                }
            } catch (Exception e) {
                org.slf4j.LoggerFactory.getLogger(MessageService.class)
                        .warn("No se pudo resolver nombre de usuario para {}: {}", email, e.getMessage());
            }

            if (name == null || name.isBlank()) {
                try {
                    List<StudentDocument> students = studentService.findAllByEmail(email);
                    for (StudentDocument s : students) {
                        if (s == null) continue;
                        String studentName = String.join(" ", java.util.Arrays.asList(
                                safe(s.getFirstName()),
                                safe(s.getLastNameFather()),
                                safe(s.getLastNameMother())
                        )).trim();
                        if (s.getEmail() != null && s.getEmail().equalsIgnoreCase(email)) {
                            name = studentName.isBlank() ? null : studentName;
                            break;
                        }
                        if (s.getGuardians() != null) {
                            for (GuardianContact g : s.getGuardians()) {
                                if (g == null) continue;
                                String ge = g.getEmail() == null ? "" : g.getEmail().trim().toLowerCase();
                                if (!ge.isBlank() && ge.equals(email)) {
                                    if (g.getName() != null && !g.getName().isBlank()) {
                                        name = g.getName();
                                    } else if (!studentName.isBlank()) {
                                        name = "Apoderado de " + studentName;
                                    }
                                    break;
                                }
                            }
                        }
                        if (name != null && !name.isBlank()) break;
                    }
                } catch (Exception e) {
                    org.slf4j.LoggerFactory.getLogger(MessageService.class)
                            .warn("No se pudo resolver nombre de estudiante/apoderado para {}: {}", email, e.getMessage());
                }
            }

            if (name != null && !name.isBlank()) {
                result.put(email, name);
            }
        }
        return result;
    }

    private List<RecipientDetail> buildRecipientDetails(List<String> recipients, Map<String, String> names) {
        if (recipients == null || recipients.isEmpty()) return List.of();
        List<RecipientDetail> details = new ArrayList<>();
        for (String raw : recipients) {
            if (raw == null || raw.isBlank()) continue;
            String normalized = raw.trim().toLowerCase();
            String name = names.getOrDefault(normalized, names.get(raw));
            details.add(new RecipientDetail(normalized, name));
        }
        return details;
    }

    /**
     * Filtra los correos que corresponden a estudiantes o apoderados (guardians) para uso de App.
     */
    private List<String> studentRecipientEmails(List<String> recipients) {
        if (recipients == null || recipients.isEmpty()) return List.of();
        List<String> result = new ArrayList<>();
        for (String r : recipients) {
            if (r == null || r.isBlank()) continue;
            try {
                List<StudentDocument> matches = studentService.findAllByEmail(r.toLowerCase());
                if (matches != null && !matches.isEmpty()) {
                    result.add(r.trim().toLowerCase());
                }
            } catch (Exception ignore) {
                // si falla la consulta, no agregamos el correo
            }
        }
        return result;
    }

    private String safe(String value) {
        return value == null ? "" : value.trim();
    }

    private MessageDto toDto(MessageDocument msg, CurrentUser user) {
        boolean deletable = canDelete(user, msg);
        Map<String, String> recipientNames = msg.getRecipientNames();
        List<RecipientDetail> recipientDetails = msg.getRecipientsDetails();
        Map<String, MessageStatus> emailStatuses = msg.getEmailStatuses();
        if ((recipientNames == null || recipientNames.isEmpty()) && msg.getRecipients() != null) {
            recipientNames = resolveRecipientNames(msg.getRecipients());
        }
        if ((recipientDetails == null || recipientDetails.isEmpty()) && msg.getRecipients() != null) {
            recipientDetails = buildRecipientDetails(msg.getRecipients(), recipientNames != null ? recipientNames : Map.of());
        }
        if ((emailStatuses == null || emailStatuses.isEmpty()) && msg.getRecipients() != null && msg.getEmailStatuses() == null) {
            Map<String, MessageStatus> fallback = new HashMap<>();
            for (String r : msg.getRecipients()) {
                if (r != null) {
                    String key = r.trim().toLowerCase();
                    if (!key.isBlank()) {
                        fallback.put(key, msg.getEmailStatus() != null ? msg.getEmailStatus() : MessageStatus.PENDING);
                    }
                }
            }
            emailStatuses = fallback;
        }
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
                emailStatuses,
                recipientNames,
                recipientDetails,
                msg.getSchoolId(),
                msg.getYear(),
                msg.getGroupIds(),
                msg.getStatus(),
                msg.getScheduledAt(),
                msg.getCreatedAt(),
                msg.getAttachments(),
                msg.getReason(),
                deletable,
                msg.getBroadcast()
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

    private void validateTeacherDirectRecipients(List<String> recipients) {
        if (recipients == null || recipients.isEmpty()) {
            throw new ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST, "No hay destinatarios");
        }
        // Permitidos: usuarios de plataforma con rol en el set permitido
        List<String> normalized = recipients.stream()
                .filter(Objects::nonNull)
                .map(String::trim)
                .filter(s -> !s.isBlank())
                .map(String::toLowerCase)
                .toList();
        if (normalized.isEmpty()) {
            throw new ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST, "No hay destinatarios válidos");
        }
        Map<String, UserRole> roles = fetchUserRoles(normalized);
        for (String email : normalized) {
            UserRole role = roles.get(email);
            if (role == null) {
                throw new ResponseStatusException(org.springframework.http.HttpStatus.FORBIDDEN, "Solo puedes enviar directo a usuarios de la plataforma (admin/coordinador/profesor)");
            }
            String r = role.name().toUpperCase();
            if (!(r.equals("ADMIN") || r.equals("COORDINATOR") || r.equals("GESTION_ESCOLAR") || r.equals("SUPERADMIN") || r.equals("TEACHER"))) {
                throw new ResponseStatusException(org.springframework.http.HttpStatus.FORBIDDEN, "Solo puedes enviar directo a usuarios de la plataforma (admin/coordinador/profesor)");
            }
        }
    }

    private Map<String, UserRole> fetchUserRoles(List<String> emails) {
        Map<String, UserRole> result = new HashMap<>();
        try {
            // Firestore whereIn supports up to 10; procesar en lotes
            int batchSize = 10;
            for (int i = 0; i < emails.size(); i += batchSize) {
                List<String> batch = emails.subList(i, Math.min(i + batchSize, emails.size()));
                ApiFuture<QuerySnapshot> query = firestore.collectionGroup("users")
                        .whereIn("email", batch)
                        .get();
                List<QueryDocumentSnapshot> docs = query.get().getDocuments();
                for (QueryDocumentSnapshot doc : docs) {
                    UserDocument u = doc.toObject(UserDocument.class);
                    if (u != null && u.getEmail() != null && u.getRole() != null) {
                        result.put(u.getEmail().toLowerCase(), u.getRole());
                    }
                }
            }
            return result;
        } catch (InterruptedException | ExecutionException e) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(org.springframework.http.HttpStatus.INTERNAL_SERVER_ERROR, "Error validando destinatarios", e);
        }
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
            perRecipient.put(readerEmail.toLowerCase(), MessageStatus.READ);
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

    public void markEmailOpened(String messageId, String recipientEmail) {
        try {
            if (recipientEmail == null || recipientEmail.isBlank()) {
                return;
            }
            String normalizedRecipient = recipientEmail.trim().toLowerCase();
            DocumentReference ref = findMessageRef(messageId, null);
            if (ref == null) {
                return;
            }
            var snapshot = ref.get().get();
            MessageDocument msg = snapshot.toObject(MessageDocument.class);
            if (msg == null) {
                return;
            }
            Map<String, MessageStatus> perRecipient = msg.getEmailStatuses() != null
                    ? new HashMap<>(msg.getEmailStatuses())
                    : new HashMap<>();
            perRecipient.put(normalizedRecipient, MessageStatus.READ);
            msg.setEmailStatuses(perRecipient);

            boolean allRead = false;
            if (msg.getRecipients() != null && !msg.getRecipients().isEmpty()) {
                long recipientCount = msg.getRecipients().size();
                long readCount = perRecipient.values().stream().filter(v -> v == MessageStatus.READ).count();
                allRead = readCount >= recipientCount;
            }
            if (msg.getChannels() != null && msg.getChannels().contains("email")) {
                msg.setEmailStatus(allRead ? MessageStatus.READ : msg.getEmailStatus());
            }
            ref.set(msg).get();
        } catch (InterruptedException | ExecutionException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("No se pudo marcar email como leído", e);
        }
    }

    private String buildHtmlBody(String content, String senderName, String senderEmail, String reason, List<AttachmentRequest> attachments, String logoUrl, String schoolName, String recipientName) {
        List<AttachmentRequest> attList = attachments == null ? java.util.Collections.emptyList() : attachments;
        String htmlContent = renderContentHtml(content);
        final String notiflowBadge = "https://www.notiflow.cl/Naranjo_Degradado.png";

        // Adjunta una imagen inline si existe
        AttachmentRequest inlineImg = attList.stream()
                .filter(a -> Boolean.TRUE.equals(a.inline()) && a.cid() != null && a.mimeType() != null && a.mimeType().startsWith("image/"))
                .findFirst()
                .orElse(null);
        if (inlineImg != null) {
            htmlContent = htmlContent + "<p style=\"margin-top:12px;\"><img src=\"cid:" + inlineImg.cid() + "\" alt=\"imagen adjunta\" style=\"max-width:100%;\"/></p>";
        }

        String schoolLogoBlock = (logoUrl != null && !logoUrl.isBlank())
                ? "<img src=\"" + logoUrl + "\" alt=\"Logo colegio\" style=\"max-height:64px; width:auto; display:block;\" />"
                : "<img src=\"" + notiflowBadge + "\" alt=\"Notiflow\" style=\"height:48px; width:auto; display:block;\" />";
        String headerText = (reason != null && !reason.isBlank()) ? reason : "Mensaje";
        String senderLine = (senderName != null ? senderName : "Usuario") +
                (senderEmail != null && !senderEmail.isBlank() ? " (" + senderEmail + ")" : "");
        String schoolLine = (schoolName != null && !schoolName.isBlank()) ? schoolName : "Notiflow";
        String recipientEmail = (recipientName != null && !recipientName.isBlank()) ? recipientName : "";
        String recipientLabel = formatRecipient(recipientEmail);
        String recipientLine = recipientLabel.isBlank() ? (recipientEmail.isBlank() ? "Destinatario" : recipientEmail) : recipientLabel + " · " + recipientEmail;

        String template = """
                <div style="margin:0; padding:0; background:#f5f7fb; width:100%; font-family:'Inter','Helvetica Neue',Arial,sans-serif;">
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="width:100%; max-width:720px; margin:0 auto; padding:18px 14px;">
                    <tr>
                      <td>
                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width:100%; background:#ffffff; border-radius:18px; overflow:hidden; border:1px solid #e5e7eb; box-shadow:0 16px 48px rgba(15,23,42,0.14);">
                          <tr>
                            <td style="padding:0; background:linear-gradient(135deg,#ff9f5a 0%,#ffc778 55%,#ffe9c7 100%);">
                              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="padding:18px 20px;">
                                <tr>
                                  <td style="vertical-align:middle; width:68%; padding-right:8px;">
                                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width:100%;">
                                      <tr>
                                        <td style="width:1%; padding-right:12px;">
                                          <div style="background:rgba(255,255,255,0.98); border-radius:14px; padding:12px 14px; display:inline-block; box-shadow:0 10px 22px rgba(0,0,0,0.12);">
                                            {SCHOOL_LOGO}
                                          </div>
                                        </td>
                                        <td style="vertical-align:middle;">
                                          <div style="font-size:17px; font-weight:800; color:#0f172a; letter-spacing:0.01em; line-height:1.2;">{SCHOOL}</div>
                                          <div style="font-size:12px; font-weight:700; color:#1f2937; opacity:0.95; line-height:1.4;">Asunto: {SUBJECT}</div>
                                        </td>
                                      </tr>
                                    </table>
                                  </td>
                                  <td style="vertical-align:middle; text-align:right; width:32%; padding-left:8px;">
                                    <div style="font-size:12px; color:#0f172a; font-weight:700; opacity:0.95;">Enviado por</div>
                                    <div style="font-size:13px; color:#0f172a; font-weight:800; line-height:1.4;">{SENDER}</div>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>

                          <tr>
                            <td style="padding:22px 22px 6px 22px; background:#f7f8fb;">
                              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#ffffff; border:1px solid #e5e7eb; border-radius:14px; padding:18px; box-shadow:inset 0 1px 0 rgba(255,255,255,0.8);">
                                <tr>
                                  <td style="padding-bottom:10px;">
                                    <span style="font-size:11px; font-weight:800; letter-spacing:0.08em; text-transform:uppercase; color:#6b7280; margin-right:6px;">Para</span>
                                    <span style="font-size:12px; font-weight:700; color:#0f172a; background:#dbeafe; border-radius:999px; padding:6px 12px; border:1px solid #cbd5e1; display:inline-block;">{RECIPIENT}</span>
                                  </td>
                                </tr>
                                <tr>
                                  <td style="font-size:15px; color:#0f172a; line-height:1.6; word-break:break-word;">{CONTENT}</td>
                                </tr>
                              </table>

                              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:16px; border-collapse:separate; border-spacing:0 10px;">
                                <tr>
                                  <td style="padding:0;">
                                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #e2e8f0; border-radius:12px; overflow:hidden;">
                                      <tr>
                                        <td style="background:#ffffff; color:#0f172a; padding:12px 14px; vertical-align:middle;">
                                          <div style="font-size:11px; letter-spacing:0.08em; text-transform:uppercase; color:#64748b; margin-bottom:6px;">Aviso</div>
                                          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width:100%;">
                                            <tr>
                                              <td style="width:1%; padding-right:10px; vertical-align:top;">
                                                <div style="border:1px solid #e2e8f0; background:#fff; border-radius:12px; padding:6px; display:inline-block;">
                                                  <img src="{FOOTER_BADGE}" alt="Notiflow" style="height:32px; width:auto; display:block;" />
                                                </div>
                                              </td>
                                              <td style="vertical-align:middle; font-size:12px; color:#0f172a; line-height:1.5;">
                                                No responda este correo; el buzón no se monitorea. Ante dudas, contacte a su colegio por los canales oficiales.
                                              </td>
                                            </tr>
                                          </table>
                                        </td>
                                      </tr>
                                    </table>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </div>
                """;

        return template
                .replace("{LOGO_BADGE}", nullSafe(notiflowBadge))
                .replace("{SCHOOL_LOGO}", schoolLogoBlock)
                .replace("{SCHOOL}", nullSafe(schoolLine))
                .replace("{SUBJECT}", nullSafe(headerText))
                .replace("{SENDER}", nullSafe(senderLine))
                .replace("{RECIPIENT}", nullSafe(recipientLine))
                .replace("{CONTENT}", nullSafe(htmlContent))
                .replace("{FOOTER_BADGE}", nullSafe(notiflowBadge));
    }

    private String nullSafe(String value) {
        return value == null ? "" : value;
    }

    private String appendTrackingPixel(String html, String messageId, String recipient) {
        String base = html == null ? "" : html;
        String url = buildTrackingUrl(messageId, recipient);
        if (url == null || url.isBlank()) return base;
        return base + "<img src=\"" + url + "\" alt=\"\" style=\"width:1px;height:1px;display:block;opacity:0;\" />";
    }

    private String buildTrackingUrl(String messageId, String recipient) {
        if (messageId == null || recipient == null || recipient.isBlank()) return null;
        String normalizedBase = trackingBaseUrl.endsWith("/") ? trackingBaseUrl.substring(0, trackingBaseUrl.length() - 1) : trackingBaseUrl;
        String safeRecipient = java.net.URLEncoder.encode(recipient, java.nio.charset.StandardCharsets.UTF_8);
        return normalizedBase + "/messages/" + messageId + "/track?recipient=" + safeRecipient;
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

    private String formatRecipient(String recipient) {
        if (recipient == null || recipient.isBlank()) return "";
        if (!recipient.contains("@")) return recipient;
        String local = recipient.split("@")[0];
        local = local.replace(".", " ").replace("_", " ").replace("-", " ");
        String[] parts = local.split("\\s+");
        StringBuilder sb = new StringBuilder();
        for (String p : parts) {
            if (p.isBlank()) continue;
            sb.append(Character.toUpperCase(p.charAt(0))).append(p.substring(1).toLowerCase()).append(" ");
        }
        return sb.toString().trim();
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
