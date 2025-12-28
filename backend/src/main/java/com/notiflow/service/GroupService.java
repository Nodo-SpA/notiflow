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
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.ExecutionException;
import java.util.stream.Collectors;

@Service
public class GroupService {

    private final Firestore firestore;
    private static final int MAX_SEARCH_SCAN = 5000;

    public GroupService(Firestore firestore) {
        this.firestore = firestore;
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
        var baseCollection = tenantGroups(schoolId);
        var filtered = (year != null && !year.isBlank())
                ? baseCollection.whereEqualTo("year", year)
                : baseCollection;
        return fetch(filtered, query, page, pageSize);
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
                            return new GroupDto(g.getId(), g.getName(), g.getDescription(), g.getMemberIds(), g.getSchoolId(), g.getYear(), g.getCreatedAt());
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
                    return new GroupDto(g.getId(), g.getName(), g.getDescription(), g.getMemberIds(), g.getSchoolId(), g.getYear(), g.getCreatedAt());
                }).filter(Objects::nonNull).collect(Collectors.toList());
                boolean hasMore = (long) safePage * safeSize < total;
                return new GroupListResponse(items, total, safePage, safeSize, hasMore);
            }
        } catch (InterruptedException | ExecutionException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("Error listando grupos", e);
        }
    }

    private boolean matchesQuery(GroupDto g, String q) {
        String name = g.name() == null ? "" : g.name().toLowerCase();
        String description = g.description() == null ? "" : g.description().toLowerCase();
        String school = g.schoolId() == null ? "" : g.schoolId().toLowerCase();
        String year = g.year() == null ? "" : g.year().toLowerCase();
        return name.contains(q) || description.contains(q) || school.contains(q) || year.contains(q);
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

            DocumentReference ref = tenantGroups(schoolId).document(g.getId());
            ref.set(g).get();

            return new GroupDto(g.getId(), g.getName(), g.getDescription(), g.getMemberIds(), g.getSchoolId(), g.getYear(), g.getCreatedAt());
        } catch (InterruptedException | ExecutionException e) {
            Thread.currentThread().interrupt();
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

            if (originalSchoolId != null && !originalSchoolId.equalsIgnoreCase(targetSchoolId)) {
                tenantGroups(targetSchoolId).document(id).set(existing).get();
                ref.delete().get();
            } else {
                ref.set(existing).get();
            }
            return new GroupDto(existing.getId(), existing.getName(), existing.getDescription(), existing.getMemberIds(), existing.getSchoolId(), existing.getYear(), existing.getCreatedAt());
        } catch (InterruptedException | ExecutionException e) {
            Thread.currentThread().interrupt();
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
            Thread.currentThread().interrupt();
            throw new RuntimeException("Error eliminando grupo", e);
        }
    }
}
