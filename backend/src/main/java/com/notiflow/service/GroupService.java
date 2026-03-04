package com.notiflow.service;

import com.google.api.core.ApiFuture;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.FirestoreException;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.AggregateQuery;
import com.google.cloud.firestore.AggregateQuerySnapshot;
import com.google.cloud.firestore.QueryDocumentSnapshot;
import com.google.cloud.firestore.QuerySnapshot;
import com.notiflow.dto.GroupDto;
import com.notiflow.dto.GroupListResponse;
import com.notiflow.dto.GroupRequest;
import com.notiflow.model.GroupDocument;
import com.notiflow.util.SearchUtils;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.Year;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutionException;
import java.util.stream.Collectors;

@Service
public class GroupService {

    private final Firestore firestore;
    private final StudentService studentService;
    private final UserService userService;
    private static final int MAX_SEARCH_SCAN = 5000;
    public static final String SYSTEM_ALL_STUDENTS = "ALL_STUDENTS";
    public static final String SYSTEM_ALL_COMMUNITY = "ALL_COMMUNITY";
    public static final String SYSTEM_STAFF = "STAFF";

    public GroupService(Firestore firestore, StudentService studentService, UserService userService) {
        this.firestore = firestore;
        this.studentService = studentService;
        this.userService = userService;
    }

    public List<String> findGroupsForMember(String email, String schoolId) {
        if (email == null || email.isBlank()) return List.of();
        try {
            var query = firestore.collectionGroup("groups")
                    .whereEqualTo("schoolId", schoolId)
                    .whereArrayContains("memberIds", email);
            ApiFuture<QuerySnapshot> future = query.limit(50).get();
            return future.get().getDocuments().stream().map(QueryDocumentSnapshot::getId).collect(Collectors.toList());
        } catch (Exception e) {
            return List.of();
        }
    }

    public GroupListResponse listBySchool(String schoolId, String year, String query, int page, int pageSize) {
        ensureDefaultGroups(schoolId, year);
        var baseCollection = tenantGroups(schoolId);
        var filtered = (year != null && !year.isBlank())
                ? baseCollection.whereEqualTo("year", year)
                : baseCollection;
        return fetch(filtered, query, page, pageSize);
    }

    public int rebuildCourseGroups(String schoolId, String year) {
        if (schoolId == null || schoolId.isBlank()) return 0;
        String resolvedYear = (year == null || year.isBlank()) ? String.valueOf(Year.now().getValue()) : year;
        ensureDefaultGroups(schoolId, resolvedYear);
        List<com.notiflow.model.StudentDocument> students = studentService.listAllBySchoolAndYear(schoolId, resolvedYear);
        java.util.Map<String, java.util.Set<String>> byCourse = new java.util.HashMap<>();

        for (com.notiflow.model.StudentDocument s : students) {
            if (s == null) continue;
            String course = s.getCourse();
            if (course == null || course.isBlank()) {
                course = "N/A";
            }
            java.util.Set<String> members = new java.util.HashSet<>();
            if (s.getId() != null && !s.getId().isBlank()) {
                members.add(s.getId().trim());
            }
            if (members.isEmpty()) {
                continue;
            }
            byCourse.computeIfAbsent(course, k -> new java.util.HashSet<>()).addAll(members);
        }

        int updated = 0;
        for (var entry : byCourse.entrySet()) {
            String course = entry.getKey();
            java.util.List<String> members = entry.getValue().stream().toList();
            upsertCourseGroup(course, members, schoolId, resolvedYear);
            updated++;
        }
        return updated;
    }

    public GroupListResponse listAll(String year, String query, int page, int pageSize) {
        var baseCollection = firestore.collectionGroup("groups");
        var filtered = (year != null && !year.isBlank())
                ? baseCollection.whereEqualTo("year", year)
                : baseCollection;
        return fetch(filtered, query, page, pageSize);
    }

    private GroupListResponse fetch(com.google.cloud.firestore.Query baseQuery, String query, int page, int size) {
        int safePage = Math.max(1, page);
        int safeSize = Math.min(Math.max(1, size), 100);
        String normalizedQuery = query == null ? "" : query.trim().toLowerCase();
        boolean hasSearch = !normalizedQuery.isBlank();
        com.google.cloud.firestore.Query sortedQuery = applyOrderSafely(baseQuery);

        try {
            if (hasSearch) {
                ApiFuture<QuerySnapshot> future = baseQuery.limit(MAX_SEARCH_SCAN).get();
                List<QueryDocumentSnapshot> docs = future.get().getDocuments();
                List<GroupDto> filtered = docs.stream()
                        .map(doc -> {
                            GroupDocument g = doc.toObject(GroupDocument.class);
                            if (g == null) return null;
                            g.setId(doc.getId());
                            return new GroupDto(g.getId(), g.getName(), g.getDescription(), g.getMemberIds(), g.getSchoolId(), g.getYear(), g.getCreatedAt(), g.getSystem(), g.getSystemType());
                        })
                        .filter(g -> g != null && matchesQuery(g, normalizedQuery))
                        .collect(Collectors.toList());
                boolean reachedLimit = docs.size() == MAX_SEARCH_SCAN;
                int from = Math.min((safePage - 1) * safeSize, filtered.size());
                int to = Math.min(from + safeSize, filtered.size());
                List<GroupDto> pageItems = filtered.subList(from, to);
                boolean hasMore = reachedLimit || to < filtered.size();
                long total = filtered.size() + (reachedLimit ? 1 : 0);
                return new GroupListResponse(pageItems, total, safePage, safeSize, hasMore);
            } else {
                long total = count(sortedQuery);
                ApiFuture<QuerySnapshot> future = sortedQuery
                        .offset((safePage - 1) * safeSize)
                        .limit(safeSize)
                        .get();
                List<QueryDocumentSnapshot> docs = future.get().getDocuments();
                List<GroupDto> items = docs.stream().map(doc -> {
                    GroupDocument g = doc.toObject(GroupDocument.class);
                    if (g == null) return null;
                    g.setId(doc.getId());
                    return new GroupDto(g.getId(), g.getName(), g.getDescription(), g.getMemberIds(), g.getSchoolId(), g.getYear(), g.getCreatedAt(), g.getSystem(), g.getSystemType());
                }).filter(Objects::nonNull).collect(Collectors.toList());
                boolean hasMore = (long) safePage * safeSize < total;
                return new GroupListResponse(items, total, safePage, safeSize, hasMore);
            }
        } catch (InterruptedException | ExecutionException e) {
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            throw new RuntimeException("Error listando grupos", e);
        }
    }

    private boolean matchesQuery(GroupDto g, String q) {
        return SearchUtils.matchesQuery(q, g.name(), g.description(), g.schoolId(), g.year());
    }

    private com.google.cloud.firestore.Query applyOrderSafely(com.google.cloud.firestore.Query base) {
        try {
            return base.orderBy("createdAt", com.google.cloud.firestore.Query.Direction.DESCENDING);
        } catch (RuntimeException ex) {
            if (isMissingIndex(ex)) {
                return base;
            }
            throw ex;
        }
    }

    private boolean isMissingIndex(Throwable ex) {
        if (ex instanceof RuntimeException && ex.getCause() != null) {
            return isMissingIndex(ex.getCause());
        }
        if (ex instanceof FirestoreException fe) {
            String code = fe.getStatus() != null && fe.getStatus().getCode() != null
                    ? fe.getStatus().getCode().name()
                    : "";
            String msg = fe.getMessage() != null ? fe.getMessage().toLowerCase() : "";
            return "failed_precondition".equalsIgnoreCase(code) && msg.contains("index");
        }
        if (ex instanceof io.grpc.StatusRuntimeException sre) {
            String code = sre.getStatus() != null && sre.getStatus().getCode() != null
                    ? sre.getStatus().getCode().name()
                    : "";
            String msg = sre.getMessage() != null ? sre.getMessage().toLowerCase() : "";
            return "failed_precondition".equalsIgnoreCase(code) && msg.contains("index");
        }
        return false;
    }

    private long count(com.google.cloud.firestore.Query q) throws ExecutionException, InterruptedException {
        AggregateQuery countQuery = q.count();
        AggregateQuerySnapshot snapshot = countQuery.get().get();
        return snapshot.getCount();
    }

    private com.google.cloud.firestore.CollectionReference tenantGroups(String tenantId) {
        String safeTenant = tenantId == null || tenantId.isBlank() ? "global" : tenantId;
        return firestore.collection("tenants").document(safeTenant).collection("groups");
    }

    public GroupDto create(GroupRequest request, String schoolId) {
        try {
            GroupDocument g = new GroupDocument();
            g.setId(UUID.randomUUID().toString());
            g.setName(request.name());
            g.setDescription(request.description());
            g.setMemberIds(request.memberIds());
            g.setSchoolId(schoolId);
            g.setYear(request.year() != null && !request.year().isBlank()
                    ? request.year()
                    : String.valueOf(java.time.Year.now().getValue()));
            g.setCreatedAt(Instant.now());
            g.setSystem(false);
            g.setSystemType(null);

            DocumentReference ref = tenantGroups(schoolId).document(g.getId());
            ref.set(g).get();

            return new GroupDto(g.getId(), g.getName(), g.getDescription(), g.getMemberIds(), g.getSchoolId(), g.getYear(), g.getCreatedAt(), g.getSystem(), g.getSystemType());
        } catch (InterruptedException | ExecutionException e) {
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            throw new RuntimeException("Error creando grupo", e);
        }
    }

    public GroupDto update(String id, GroupRequest request, String schoolId, boolean isGlobalAdmin) {
        try {
            DocumentReference ref = tenantGroups(schoolId).document(id);
            var snap = ref.get().get();
            if (!snap.exists()) {
                QueryDocumentSnapshot cg = firestore.collectionGroup("groups")
                        .whereEqualTo("id", id)
                        .limit(1)
                        .get()
                        .get()
                        .getDocuments()
                        .stream()
                        .findFirst()
                        .orElse(null);
                if (cg != null) {
                    ref = cg.getReference();
                    snap = cg;
                }
            }
            if (!snap.exists()) {
                throw new IllegalArgumentException("Grupo no encontrado");
            }
            GroupDocument existing = snap.toObject(GroupDocument.class);
            if (existing == null) {
                throw new IllegalArgumentException("Grupo inválido");
            }
            String originalSchoolId = existing.getSchoolId();
            if (!isGlobalAdmin && originalSchoolId != null && !originalSchoolId.equalsIgnoreCase(schoolId)) {
                throw new IllegalArgumentException("No puedes editar grupos de otro colegio");
            }

            String targetSchoolId = originalSchoolId;
            if (isGlobalAdmin && request.schoolId() != null && !request.schoolId().isBlank()) {
                targetSchoolId = request.schoolId();
            }

            existing.setName(request.name());
            existing.setDescription(request.description());
            existing.setMemberIds(request.memberIds());
            existing.setSchoolId(targetSchoolId);
            existing.setYear(request.year() != null && !request.year().isBlank()
                    ? request.year()
                    : existing.getYear());
            existing.setSystem(Boolean.FALSE.equals(existing.getSystem()) ? existing.getSystem() : existing.getSystem());

            if (originalSchoolId != null && !originalSchoolId.equalsIgnoreCase(targetSchoolId)) {
                tenantGroups(targetSchoolId).document(id).set(existing).get();
                ref.delete().get();
            } else {
                ref.set(existing).get();
            }
            return new GroupDto(existing.getId(), existing.getName(), existing.getDescription(), existing.getMemberIds(), existing.getSchoolId(), existing.getYear(), existing.getCreatedAt(), existing.getSystem(), existing.getSystemType());
        } catch (InterruptedException | ExecutionException e) {
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            throw new RuntimeException("Error actualizando grupo", e);
        }
    }

    public void delete(String id, String schoolId, boolean isGlobalAdmin) {
        try {
            DocumentReference ref = tenantGroups(schoolId).document(id);
            var snap = ref.get().get();
            if (!snap.exists()) {
                // fallback: collectionGroup por si el grupo está en otro tenant o legacy
                QueryDocumentSnapshot cg = firestore.collectionGroup("groups")
                        .whereEqualTo("id", id)
                        .whereEqualTo("schoolId", schoolId)
                        .limit(1)
                        .get()
                        .get()
                        .getDocuments()
                        .stream()
                        .findFirst()
                        .orElse(null);
                if (cg != null) {
                    ref = cg.getReference();
                    snap = cg;
                }
            }
            if (snap == null || !snap.exists()) {
                throw new IllegalArgumentException("Grupo no encontrado");
            }
            GroupDocument existing = snap.toObject(GroupDocument.class);
            if (existing == null) {
                throw new IllegalArgumentException("Grupo inválido");
            }
            if (!isGlobalAdmin && existing.getSchoolId() != null && !existing.getSchoolId().equalsIgnoreCase(schoolId)) {
                throw new IllegalArgumentException("No puedes borrar grupos de otro colegio");
            }
            ref.delete().get();
        } catch (InterruptedException | ExecutionException e) {
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            throw new RuntimeException("Error eliminando grupo", e);
        }
    }

    public Optional<GroupDocument> findById(String id, String schoolId) {
        try {
            DocumentReference ref = tenantGroups(schoolId).document(id);
            var snap = ref.get().get();
            if (snap.exists()) {
                GroupDocument g = snap.toObject(GroupDocument.class);
                if (g != null) {
                    g.setId(id);
                    return Optional.of(g);
                }
            }
            QueryDocumentSnapshot cg = firestore.collectionGroup("groups")
                    .whereEqualTo("id", id)
                    .limit(1)
                    .get()
                    .get()
                    .getDocuments()
                    .stream()
                    .findFirst()
                    .orElse(null);
            if (cg != null) {
                GroupDocument g = cg.toObject(GroupDocument.class);
                if (g != null) {
                    g.setId(cg.getId());
                    return Optional.of(g);
                }
            }
            return Optional.empty();
        } catch (InterruptedException | ExecutionException e) {
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            throw new RuntimeException("Error consultando grupo", e);
        }
    }

    public List<GroupDto> ensureDefaultGroups(String schoolId, String year) {
        if (schoolId == null || schoolId.isBlank()) return List.of();
        String resolvedYear = (year == null || year.isBlank()) ? String.valueOf(Year.now().getValue()) : year;
        List<GroupDto> created = new ArrayList<>();

        List<String> studentRecipients = studentService.collectRecipientEmails(schoolId, resolvedYear);
        List<String> userRecipients = userService.collectEmailsBySchool(schoolId);

        created.add(upsertSystemGroup(
                systemId(SYSTEM_ALL_STUDENTS, resolvedYear),
                "Todos los estudiantes",
                "Incluye a todos los estudiantes/apoderados del año " + resolvedYear,
                studentRecipients,
                schoolId,
                resolvedYear,
                SYSTEM_ALL_STUDENTS
        ));

        Set<String> community = new HashSet<>(studentRecipients);
        community.addAll(userRecipients);
        created.add(upsertSystemGroup(
                systemId(SYSTEM_ALL_COMMUNITY, resolvedYear),
                "Todo el establecimiento",
                "Todos los usuarios y estudiantes/apoderados del año " + resolvedYear,
                new ArrayList<>(community),
                schoolId,
                resolvedYear,
                SYSTEM_ALL_COMMUNITY
        ));

        created.add(upsertSystemGroup(
                systemId(SYSTEM_STAFF, resolvedYear),
                "Funcionarios",
                "Todos los usuarios internos del establecimiento",
                userRecipients,
                schoolId,
                resolvedYear,
                SYSTEM_STAFF
        ));

        return created.stream().filter(Objects::nonNull).toList();
    }

    private GroupDto upsertSystemGroup(String id, String name, String description, List<String> members, String schoolId, String year, String systemType) {
        try {
            DocumentReference ref = tenantGroups(schoolId).document(id);
            var snap = ref.get().get();
            GroupDocument g = snap.exists() ? snap.toObject(GroupDocument.class) : new GroupDocument();
            if (g == null) g = new GroupDocument();
            g.setId(id);
            g.setName(name);
            g.setDescription(description);
            g.setSchoolId(schoolId);
            g.setYear(year);
            g.setMemberIds(members == null ? List.of() : members.stream()
                    .filter(Objects::nonNull)
                    .map(String::trim)
                    .filter(s -> !s.isBlank())
                    .map(String::toLowerCase)
                    .distinct()
                    .toList());
            if (g.getCreatedAt() == null) {
                g.setCreatedAt(Instant.now());
            }
            g.setSystem(true);
            g.setSystemType(systemType);
            ref.set(g).get();
            return new GroupDto(g.getId(), g.getName(), g.getDescription(), g.getMemberIds(), g.getSchoolId(), g.getYear(), g.getCreatedAt(), g.getSystem(), g.getSystemType());
        } catch (InterruptedException | ExecutionException e) {
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            throw new RuntimeException("Error asegurando grupos por defecto", e);
        }
    }

    private void upsertCourseGroup(String course, List<String> members, String schoolId, String year) {
        try {
            String id = slug(schoolId + "-" + course + "-" + year);
            DocumentReference ref = tenantGroups(schoolId).document(id);
            var snap = ref.get().get();
            GroupDocument g = snap.exists() ? snap.toObject(GroupDocument.class) : new GroupDocument();
            if (g == null) g = new GroupDocument();
            g.setId(id);
            g.setName(course);
            g.setDescription(course);
            g.setSchoolId(schoolId);
            g.setYear(year);
            g.setMemberIds(members == null ? List.of() : members.stream()
                    .filter(Objects::nonNull)
                    .map(String::trim)
                    .filter(s -> !s.isBlank())
                    .map(this::normalizeGroupMember)
                    .distinct()
                    .toList());
            if (g.getCreatedAt() == null) {
                g.setCreatedAt(Instant.now());
            }
            if (g.getSystem() == null) {
                g.setSystem(false);
            }
            if (g.getSystemType() == null) {
                g.setSystemType(null);
            }
            ref.set(g).get();
        } catch (InterruptedException | ExecutionException e) {
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            throw new RuntimeException("Error recreando grupo de curso", e);
        }
    }

    private String slug(String text) {
        if (text == null) return "";
        return text.toLowerCase().replaceAll("[^0-9a-z]+", "-");
    }

    private String normalizeGroupMember(String member) {
        String value = member == null ? "" : member.trim();
        if (value.isBlank()) return value;
        return value.contains("@") ? value.toLowerCase() : value;
    }

    public String systemId(String type, String year) {
        return ("sys-" + type + "-" + year).toLowerCase();
    }
}
