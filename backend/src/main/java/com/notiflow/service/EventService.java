package com.notiflow.service;

import com.google.api.core.ApiFuture;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.Query;
import com.google.cloud.firestore.QueryDocumentSnapshot;
import com.google.cloud.firestore.QuerySnapshot;
import com.google.cloud.firestore.FieldPath;
import com.notiflow.dto.EventDto;
import com.notiflow.dto.EventRequest;
import com.notiflow.model.EventDocument;
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

    public EventService(Firestore firestore, GroupService groupService) {
        this.firestore = firestore;
        this.groupService = groupService;
    }

    public List<EventDto> listForUser(CurrentUser user, String fromIso, String toIso, String type, int page, int pageSize) {
        int safePage = Math.max(1, page);
        int safeSize = Math.min(Math.max(1, pageSize), 200);
        Query query = firestore.collectionGroup("events");

        // scope por colegio, salvo superadmin (schoolId global)
        if (user.schoolId() != null && !"global".equalsIgnoreCase(user.schoolId())) {
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

            // Filtrado por audiencia para guardian/student u otros roles sin permiso explícito
            if (shouldRestrictToAudience(user)) {
                List<String> myGroupIds = groupService.findGroupsForMember(user.email(), user.schoolId());
                return all.stream()
                        .filter(ev -> isAudience(user.email(), myGroupIds, ev))
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
                if (shouldRestrictToAudience(user)) {
                    List<String> myGroupIds = groupService.findGroupsForMember(user.email(), user.schoolId());
                    return all.stream()
                            .filter(ev -> isAudience(user.email(), myGroupIds, ev))
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

    private boolean isAudience(String email, List<String> groupIds, EventDto ev) {
        if (email == null || email.isBlank()) return false;
        if (ev.audienceUserIds() != null && ev.audienceUserIds().contains(email)) return true;
        if (ev.audienceGroupIds() != null && !ev.audienceGroupIds().isEmpty()) {
            for (String gid : ev.audienceGroupIds()) {
                if (groupIds.contains(gid)) return true;
            }
        }
        // si no hay audiencia definida, no lo mostramos
        return false;
    }

    public EventDto create(EventRequest request, CurrentUser user) {
        String role = user.role() != null ? user.role().toUpperCase() : "";
        boolean canCreate = role.equals("SUPERADMIN") || role.equals("ADMIN") || role.equals("TEACHER");
        if (!canCreate) {
            throw new org.springframework.web.server.ResponseStatusException(HttpStatus.FORBIDDEN, "Solo profesores o administradores pueden crear eventos");
        }
        String schoolId = request.schoolId() != null && !request.schoolId().isBlank()
                ? request.schoolId()
                : user.schoolId();
        if (schoolId == null || schoolId.isBlank()) {
            schoolId = "global";
        }
        if (!"global".equalsIgnoreCase(user.schoolId()) && !schoolId.equalsIgnoreCase(user.schoolId())) {
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
        ev.setAudienceUserIds(normalizeList(audUsers));
        ev.setAudienceGroupIds(normalizeList(audGroups));

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
                .map(String::trim)
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
