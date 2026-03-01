package com.notiflow.service;

import com.google.api.core.ApiFuture;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.Query;
import com.google.cloud.firestore.QueryDocumentSnapshot;
import com.google.cloud.firestore.QuerySnapshot;
import com.notiflow.dto.EventDto;
import com.notiflow.dto.EventRequest;
import com.notiflow.model.EventDocument;
import com.notiflow.model.StudentDocument;
import com.notiflow.model.UserDocument;
import com.notiflow.util.CurrentUser;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ExecutionException;
import java.util.stream.Collectors;

@Service
public class EventService {

    private final Firestore firestore;
    private final GroupService groupService;
    private final TeacherPermissionService teacherPermissionService;
    private final UserService userService;
    private final StudentService studentService;

    public EventService(Firestore firestore, GroupService groupService, TeacherPermissionService teacherPermissionService, UserService userService, StudentService studentService) {
        this.firestore = firestore;
        this.groupService = groupService;
        this.teacherPermissionService = teacherPermissionService;
        this.userService = userService;
        this.studentService = studentService;
    }

    public List<EventDto> listForUser(CurrentUser user, String fromIso, String toIso, String type, int page, int pageSize, String studentId) {
        int safePage = Math.max(1, page);
        int safeSize = Math.min(Math.max(1, pageSize), 200);
        Query query = firestore.collectionGroup("events");
        String role = user.role() != null ? user.role().toUpperCase() : "";
        boolean isTeacher = role.equals("TEACHER");
        String teacherUserId = null;
        if (isTeacher && user.email() != null) {
            teacherUserId = userService.findByEmail(user.email()).map(UserDocument::getId).orElse(null);
        }
        StudentDocument selectedStudent = null;
        if (shouldRestrictToAudience(user) && studentId != null && !studentId.isBlank() && studentService != null) {
            selectedStudent = studentService.findById(studentId).orElse(null);
            if (selectedStudent == null || !isLinkedToStudent(selectedStudent, user.email())) {
                return List.of();
            }
        }
        List<String> allowedGroups = isTeacher
                ? teacherPermissionService.getAllowedGroups(user.schoolId(), user.email())
                : List.of();

        // scope por colegio, salvo superadmin (schoolId global)
        boolean restrictSchool = !shouldRestrictToAudience(user);
        if (selectedStudent != null && selectedStudent.getSchoolId() != null && !selectedStudent.getSchoolId().isBlank()) {
            query = query.whereEqualTo("schoolId", selectedStudent.getSchoolId());
        } else if (restrictSchool && user.schoolId() != null && !"global".equalsIgnoreCase(user.schoolId())) {
            query = query.whereEqualTo("schoolId", user.schoolId());
        }
        if (type != null && !type.isBlank()) {
            query = query.whereEqualTo("type", type);
        }
        Instant from = parseInstant(fromIso).orElse(null);
        Instant to = parseInstant(toIso).orElse(null);
        if (from != null) {
            query = query.whereGreaterThanOrEqualTo("startDateTime", from);
        }
        if (to != null) {
            query = query.whereLessThanOrEqualTo("startDateTime", to);
        }

        try {
            ApiFuture<QuerySnapshot> future = query
                    .orderBy("startDateTime", Query.Direction.ASCENDING)
                    .offset((safePage - 1) * safeSize)
                    .limit(safeSize)
                    .get();
            List<QueryDocumentSnapshot> docs = future.get().getDocuments();
            List<EventDto> all = docs.stream().map(doc -> {
                EventDocument ev = doc.toObject(EventDocument.class);
                ev.setId(doc.getId());
                return toDto(ev);
            }).collect(Collectors.toList());

            if (isTeacher) {
                final String email = user.email();
                final String uid = teacherUserId;
                return all.stream()
                        .filter(ev -> isTeacherEvent(ev, email, uid, allowedGroups))
                        .collect(Collectors.toList());
            }

            // Filtrado por audiencia para guardian/student u otros roles sin permiso explícito
            if (shouldRestrictToAudience(user)) {
                AudienceContext ctx = resolveAudienceContext(user, studentId);
                return all.stream()
                        .filter(ev -> isAudience(ctx.audienceKeys, ctx.groupIds, ev))
                        .collect(Collectors.toList());
            }

            return all;
        } catch (InterruptedException | ExecutionException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("Error listando eventos", e);
        } catch (Exception ex) {
            // si hay errores de índice, hacer fallback sin orderBy
            try {
                ApiFuture<QuerySnapshot> future = query
                        .offset((safePage - 1) * safeSize)
                        .limit(safeSize)
                        .get();
                List<QueryDocumentSnapshot> docs = future.get().getDocuments();
                List<EventDto> all = docs.stream().map(doc -> {
                    EventDocument ev = doc.toObject(EventDocument.class);
                    ev.setId(doc.getId());
                    return toDto(ev);
                }).collect(Collectors.toList());
                if (isTeacher) {
                    final String email = user.email();
                    final String uid = teacherUserId;
                    return all.stream()
                            .filter(ev -> isTeacherEvent(ev, email, uid, allowedGroups))
                            .collect(Collectors.toList());
                }
                if (shouldRestrictToAudience(user)) {
                    AudienceContext ctx = resolveAudienceContext(user, studentId);
                    return all.stream()
                            .filter(ev -> isAudience(ctx.audienceKeys, ctx.groupIds, ev))
                            .collect(Collectors.toList());
                }
                return all;
            } catch (InterruptedException | ExecutionException e2) {
                Thread.currentThread().interrupt();
                throw new RuntimeException("Error listando eventos", e2);
            }
        }
    }

    public void delete(String eventId, CurrentUser user) {
        if (eventId == null || eventId.isBlank()) {
            throw new org.springframework.web.server.ResponseStatusException(HttpStatus.BAD_REQUEST, "ID requerido");
        }
        String role = user.role() != null ? user.role().toUpperCase() : "";
        try {
            EventDocument ev = null;
            QueryDocumentSnapshot docSnapshot = null;

            // 1) Buscar por campo "id" en collectionGroup (evita problemas de documentId en group)
            QuerySnapshot snapshot = firestore
                    .collectionGroup("events")
                    .whereEqualTo("id", eventId)
                    .limit(1)
                    .get()
                    .get();
            if (!snapshot.isEmpty()) {
                docSnapshot = snapshot.getDocuments().get(0);
                ev = docSnapshot.toObject(EventDocument.class);
                if (ev != null) {
                    ev.setId(docSnapshot.getId());
                }
            }

            // 2) Si no se encontró, intentar directamente en el colegio del usuario
            if (ev == null) {
                String userSchool = user.schoolId() == null || user.schoolId().isBlank() ? "global" : user.schoolId();
                var snap = tenantEvents(userSchool).document(eventId).get().get();
                if (snap.exists()) {
                    ev = snap.toObject(EventDocument.class);
                    if (ev != null) ev.setId(eventId);
                }
            }

            if (ev == null) {
                throw new org.springframework.web.server.ResponseStatusException(HttpStatus.NOT_FOUND, "Evento no encontrado");
            }

            String schoolId = ev.getSchoolId() == null || ev.getSchoolId().isBlank() ? "global" : ev.getSchoolId();
            boolean allow = false;
            if ("SUPERADMIN".equals(role)) {
                allow = user.email() != null && user.email().equalsIgnoreCase(ev.getCreatedByEmail());
            } else if ("ADMIN".equals(role)) {
                allow = user.schoolId() != null && user.schoolId().equalsIgnoreCase(schoolId);
            } else if ("TEACHER".equals(role)) {
                allow = user.email() != null && user.email().equalsIgnoreCase(ev.getCreatedByEmail())
                        && user.schoolId() != null && user.schoolId().equalsIgnoreCase(schoolId);
            }
            if (!allow) {
                throw new org.springframework.web.server.ResponseStatusException(HttpStatus.FORBIDDEN, "No puedes eliminar este evento");
            }

            // Usar la ruta de tenant/{schoolId}/events/{id} como fuente de verdad
            DocumentReference tenantRef = tenantEvents(schoolId).document(eventId);
            var tenantSnap = tenantRef.get().get();
            if (tenantSnap.exists()) {
                tenantRef.delete().get();
            } else if (docSnapshot != null) {
                // fallback: borrar donde realmente está si vino del collectionGroup
                docSnapshot.getReference().delete().get();
            } else {
                throw new org.springframework.web.server.ResponseStatusException(HttpStatus.NOT_FOUND, "Evento no encontrado");
            }
        } catch (InterruptedException | ExecutionException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("Error eliminando evento", e);
        }
    }


    private boolean shouldRestrictToAudience(CurrentUser user) {
        String role = user.role() != null ? user.role().toUpperCase() : "";
        return role.equals("GUARDIAN") || role.equals("STUDENT");
    }

    private boolean isAudience(List<String> audienceKeys, List<String> groupIds, EventDto ev) {
        if (audienceKeys == null || audienceKeys.isEmpty()) return false;
        if (ev.audienceUserIds() != null && !ev.audienceUserIds().isEmpty()) {
            for (String key : audienceKeys) {
                if (key == null || key.isBlank()) continue;
                for (String aud : ev.audienceUserIds()) {
                    if (matchesAudienceKey(aud, key)) return true;
                }
            }
        }
        if (ev.audienceGroupIds() != null && !ev.audienceGroupIds().isEmpty()) {
            for (String gid : ev.audienceGroupIds()) {
                if (groupIds.contains(gid)) return true;
            }
        }
        // si no hay audiencia definida, no lo mostramos
        return false;
    }

    private boolean matchesAudienceKey(String aud, String key) {
        if (aud == null || key == null) return false;
        String a = aud.trim();
        String k = key.trim();
        if (a.isEmpty() || k.isEmpty()) return false;
        boolean emailLike = a.contains("@") || k.contains("@");
        return emailLike ? a.equalsIgnoreCase(k) : a.equals(k);
    }

    private record AudienceContext(List<String> audienceKeys, List<String> groupIds) {}

    private AudienceContext resolveAudienceContext(CurrentUser user, String studentId) {
        if (user == null || user.email() == null || user.email().isBlank()) {
            return new AudienceContext(List.of(), List.of());
        }
        String email = user.email().trim().toLowerCase();
        if (studentId != null && !studentId.isBlank()) {
            StudentDocument student = studentService != null ? studentService.findById(studentId).orElse(null) : null;
            if (student == null) {
                return new AudienceContext(List.of(), List.of());
            }
            if (!isLinkedToStudent(student, email)) {
                return new AudienceContext(List.of(), List.of());
            }
            java.util.Set<String> keys = new java.util.HashSet<>();
            keys.add(student.getId());
            if (student.getEmail() != null && !student.getEmail().isBlank()) {
                keys.add(student.getEmail().trim().toLowerCase());
            }
            keys.add(email);
            List<String> groups = resolveGroupIdsForKeys(keys, student.getSchoolId());
            return new AudienceContext(new ArrayList<>(keys), groups);
        }
        java.util.Set<String> keys = new java.util.HashSet<>();
        keys.add(email);
        if (studentService != null) {
            List<StudentDocument> linked = studentService.findAllByEmail(email);
            for (StudentDocument s : linked) {
                if (s == null) continue;
                if (s.getId() != null && !s.getId().isBlank()) {
                    keys.add(s.getId());
                }
                if (s.getEmail() != null && !s.getEmail().isBlank()) {
                    keys.add(s.getEmail().trim().toLowerCase());
                }
            }
        }
        List<String> groups = resolveGroupIdsForKeys(keys, user.schoolId());
        return new AudienceContext(new ArrayList<>(keys), groups);
    }

    private boolean isLinkedToStudent(StudentDocument student, String email) {
        if (student == null || email == null || email.isBlank()) return false;
        String normalized = email.trim().toLowerCase();
        if (student.getEmail() != null && student.getEmail().equalsIgnoreCase(normalized)) {
            return true;
        }
        if (student.getGuardianEmails() != null) {
            return student.getGuardianEmails().stream().anyMatch(g -> g != null && g.equalsIgnoreCase(normalized));
        }
        return false;
    }

    private List<String> resolveGroupIdsForKeys(java.util.Set<String> keys, String schoolId) {
        if (keys == null || keys.isEmpty()) return List.of();
        java.util.Set<String> groups = new java.util.HashSet<>();
        String targetSchool = (schoolId == null || schoolId.isBlank()) ? "global" : schoolId;
        for (String key : keys) {
            if (key == null || key.isBlank()) continue;
            groups.addAll(groupService.findGroupsForMember(key, targetSchool));
        }
        return new ArrayList<>(groups);
    }

    public EventDto create(EventRequest request, CurrentUser user) {
        String role = user.role() != null ? user.role().toUpperCase() : "";
        String schoolId = request.schoolId() != null && !request.schoolId().isBlank()
                ? request.schoolId()
                : user.schoolId();
        if (schoolId == null || schoolId.isBlank()) {
            schoolId = user.schoolId() != null && !user.schoolId().isBlank() ? user.schoolId() : "global";
        }
        boolean isGlobalAdmin = user.isSuperAdmin() || user.isGlobalAdmin();
        if (!isGlobalAdmin && user.schoolId() != null && !user.schoolId().isBlank() && !schoolId.equalsIgnoreCase(user.schoolId())) {
            throw new org.springframework.web.server.ResponseStatusException(HttpStatus.FORBIDDEN, "No puedes crear eventos en otro colegio");
        }

        String targetId = (request.id() != null && !request.id().isBlank()) ? request.id() : UUID.randomUUID().toString();

        EventDocument ev = new EventDocument();
        ev.setId(targetId);
        ev.setTitle(request.title());
        ev.setDescription(request.description());
        ev.setStartDateTime(request.startDateTime());
        ev.setEndDateTime(request.endDateTime());
        ev.setType(request.type() != null && !request.type().isBlank() ? request.type() : "general");
        ev.setSchoolId(schoolId);
        ev.setCreatedAt(Instant.now());
        ev.setCreatedByEmail(user.email());
        ev.setCreatedByName(user.email() != null ? user.email().split("@")[0] : "Desconocido");

        List<String> audUsers = request.audience() != null ? request.audience().userIds() : null;
        List<String> audGroups = request.audience() != null ? request.audience().groupIds() : null;
        List<String> normalizedUsers = normalizeList(audUsers);
        List<String> normalizedGroups = normalizeList(audGroups);

        if (role.equals("TEACHER") && !normalizedGroups.isEmpty()) {
            List<String> allowed = teacherPermissionService.getAllowedGroups(schoolId, user.email());
            if (allowed == null || allowed.isEmpty()) {
                throw new org.springframework.web.server.ResponseStatusException(HttpStatus.FORBIDDEN, "No tienes permisos para enviar a estos grupos");
            }
            boolean subset = normalizedGroups.stream().allMatch(allowed::contains);
            if (!subset) {
                throw new org.springframework.web.server.ResponseStatusException(HttpStatus.FORBIDDEN, "No puedes enviar a grupos fuera de tus permisos");
            }
        }

        ev.setAudienceUserIds(normalizedUsers);
        ev.setAudienceGroupIds(normalizedGroups);

        if ((ev.getAudienceUserIds() == null || ev.getAudienceUserIds().isEmpty()) &&
                (ev.getAudienceGroupIds() == null || ev.getAudienceGroupIds().isEmpty())) {
            throw new org.springframework.web.server.ResponseStatusException(HttpStatus.BAD_REQUEST, "Debes seleccionar al menos un destinatario (personas o grupos)");
        }

        try {
            DocumentReference ref = tenantEvents(schoolId).document(ev.getId());
            ref.set(ev).get();
            return toDto(ev);
        } catch (InterruptedException | ExecutionException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("Error creando evento", e);
        }
    }

    private List<String> normalizeList(List<String> list) {
        if (list == null) return new ArrayList<>();
        return list.stream()
                .filter(s -> s != null && !s.isBlank())
                .map(s -> {
                    String trimmed = s.trim();
                    return trimmed.contains("@") ? trimmed.toLowerCase() : trimmed;
                })
                .distinct()
                .collect(Collectors.toList());
    }

    private Optional<Instant> parseInstant(String iso) {
        if (iso == null || iso.isBlank()) return Optional.empty();
        try {
            return Optional.of(Instant.parse(iso));
        } catch (DateTimeParseException ex) {
            return Optional.empty();
        }
    }

    private boolean isTeacherEvent(EventDto ev, String email, String userId, List<String> allowedGroups) {
        if (email != null && ev.createdByEmail() != null && ev.createdByEmail().equalsIgnoreCase(email)) {
            return true;
        }
        List<String> audUsers = ev.audienceUserIds();
        if (audUsers != null) {
            if (email != null && audUsers.contains(email)) return true;
            if (userId != null && audUsers.contains(userId)) return true;
        }
        List<String> audGroups = ev.audienceGroupIds();
        if (audGroups != null && allowedGroups != null && !allowedGroups.isEmpty()) {
            for (String g : audGroups) {
                if (allowedGroups.contains(g)) return true;
            }
        }
        return false;
    }

    private EventDto toDto(EventDocument ev) {
        return new EventDto(
                ev.getId(),
                ev.getTitle(),
                ev.getDescription(),
                ev.getStartDateTime(),
                ev.getEndDateTime(),
                ev.getType(),
                ev.getSchoolId(),
                ev.getCreatedByEmail(),
                ev.getCreatedByName(),
                ev.getCreatedAt(),
                ev.getAudienceUserIds(),
                ev.getAudienceGroupIds()
        );
    }

    private com.google.cloud.firestore.CollectionReference tenantEvents(String tenantId) {
        String safeTenant = tenantId == null || tenantId.isBlank() ? "global" : tenantId;
        return firestore.collection("tenants").document(safeTenant).collection("events");
    }
}
