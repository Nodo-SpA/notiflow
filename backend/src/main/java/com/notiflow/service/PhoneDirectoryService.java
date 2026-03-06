package com.notiflow.service;

import com.google.api.core.ApiFuture;
import com.google.cloud.firestore.AggregateQuery;
import com.google.cloud.firestore.AggregateQuerySnapshot;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.Query;
import com.google.cloud.firestore.QueryDocumentSnapshot;
import com.google.cloud.firestore.QuerySnapshot;
import com.notiflow.dto.GuardianContact;
import com.notiflow.dto.PhoneDirectoryItemDto;
import com.notiflow.dto.PhoneDirectoryListResponse;
import com.notiflow.model.StudentDocument;
import com.notiflow.util.CurrentUser;
import com.notiflow.util.SearchUtils;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.ExecutionException;
import java.util.stream.Collectors;

@Service
public class PhoneDirectoryService {

    private static final int MAX_SEARCH_SCAN = 5000;

    private final Firestore firestore;
    private final TeacherPermissionService teacherPermissionService;
    private final GroupService groupService;

    public PhoneDirectoryService(
            Firestore firestore,
            TeacherPermissionService teacherPermissionService,
            GroupService groupService
    ) {
        this.firestore = firestore;
        this.teacherPermissionService = teacherPermissionService;
        this.groupService = groupService;
    }

    public PhoneDirectoryListResponse list(
            CurrentUser user,
            String schoolId,
            String year,
            String query,
            int page,
            int pageSize
    ) {
        if (user == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }

        String role = (user.role() == null ? "" : user.role().trim().toUpperCase());
        boolean globalScope = user.isGlobalAdmin() || user.isSuperAdmin();
        boolean isTeacher = "TEACHER".equals(role);
        boolean isDirectoryRole = isDirectoryRole(role);

        if (!isDirectoryRole && !globalScope) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "No tienes permisos para ver el directorio telefónico");
        }

        String targetSchool;
        boolean allSchools;
        if (globalScope) {
            targetSchool = normalizeSchool(schoolId);
            allSchools = targetSchool == null || targetSchool.isBlank() || "global".equalsIgnoreCase(targetSchool);
            if (allSchools) {
                targetSchool = "global";
            }
        } else {
            targetSchool = normalizeSchool(user.schoolId());
            allSchools = false;
            String requested = normalizeSchool(schoolId);
            if (requested != null && !requested.isBlank() && !requested.equalsIgnoreCase(targetSchool)) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "No puedes consultar otro colegio");
            }
            if (targetSchool == null || targetSchool.isBlank() || "global".equalsIgnoreCase(targetSchool)) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Colegio no válido para este usuario");
            }
        }

        if (isTeacher && allSchools) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Profesor no puede consultar todos los colegios");
        }

        Query base = allSchools ? firestore.collectionGroup("students") : tenantStudents(targetSchool);
        if (year != null && !year.isBlank()) {
            base = base.whereEqualTo("year", year.trim());
        }

        int safePage = Math.max(1, page);
        int safeSize = Math.min(Math.max(1, pageSize), 200);
        String normalizedQuery = query == null ? "" : query.trim();
        boolean hasSearch = !normalizedQuery.isBlank();

        TeacherAudience teacherAudience = null;
        if (isTeacher) {
            List<String> allowedGroupIds = teacherPermissionService.getAllowedGroups(targetSchool, user.email());
            if (allowedGroupIds == null || allowedGroupIds.isEmpty()) {
                return new PhoneDirectoryListResponse(List.of(), 0, safePage, safeSize, false);
            }
            teacherAudience = resolveTeacherAudience(targetSchool, allowedGroupIds);
            if (teacherAudience.studentIds().isEmpty() && teacherAudience.emails().isEmpty()) {
                return new PhoneDirectoryListResponse(List.of(), 0, safePage, safeSize, false);
            }
        }

        boolean inMemoryMode = isTeacher || hasSearch;
        if (inMemoryMode) {
            try {
                ApiFuture<QuerySnapshot> fut = base.limit(MAX_SEARCH_SCAN).get();
                List<QueryDocumentSnapshot> docs = fut.get().getDocuments();
                List<PhoneDirectoryItemDto> filtered = new ArrayList<>();
                boolean reachedLimit = docs.size() == MAX_SEARCH_SCAN;
                for (QueryDocumentSnapshot doc : docs) {
                    StudentDocument student = doc.toObject(StudentDocument.class);
                    if (student == null) continue;
                    student.setId(doc.getId());

                    if (isTeacher && !isTeacherAllowedStudent(student, teacherAudience)) {
                        continue;
                    }

                    PhoneDirectoryItemDto item = toDirectoryItem(student);
                    if (hasSearch && !matchesQuery(item, normalizedQuery)) {
                        continue;
                    }
                    filtered.add(item);
                }

                int from = Math.min((safePage - 1) * safeSize, filtered.size());
                int to = Math.min(from + safeSize, filtered.size());
                List<PhoneDirectoryItemDto> pageItems = filtered.subList(from, to);
                boolean hasMore = reachedLimit || to < filtered.size();
                long total = filtered.size() + (reachedLimit ? 1 : 0);
                return new PhoneDirectoryListResponse(pageItems, total, safePage, safeSize, hasMore);
            } catch (InterruptedException | ExecutionException e) {
                if (e instanceof InterruptedException) {
                    Thread.currentThread().interrupt();
                }
                throw new RuntimeException("Error listando directorio telefónico", e);
            }
        }

        try {
            long total = count(base);
            ApiFuture<QuerySnapshot> fut = base
                    .offset((safePage - 1) * safeSize)
                    .limit(safeSize)
                    .get();
            List<QueryDocumentSnapshot> docs = fut.get().getDocuments();
            List<PhoneDirectoryItemDto> items = new ArrayList<>();
            for (QueryDocumentSnapshot doc : docs) {
                StudentDocument student = doc.toObject(StudentDocument.class);
                if (student == null) continue;
                student.setId(doc.getId());
                items.add(toDirectoryItem(student));
            }
            boolean hasMore = (long) safePage * safeSize < total;
            return new PhoneDirectoryListResponse(items, total, safePage, safeSize, hasMore);
        } catch (InterruptedException | ExecutionException e) {
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            throw new RuntimeException("Error listando directorio telefónico", e);
        }
    }

    private boolean isDirectoryRole(String role) {
        return "SUPERADMIN".equals(role)
                || "ADMIN".equals(role)
                || "COORDINATOR".equals(role)
                || "GESTION_ESCOLAR".equals(role)
                || "DIRECTOR".equals(role)
                || "TEACHER".equals(role);
    }

    private String normalizeSchool(String schoolId) {
        if (schoolId == null) return null;
        String trimmed = schoolId.trim();
        return trimmed.isBlank() ? null : trimmed.toLowerCase();
    }

    private long count(Query q) throws ExecutionException, InterruptedException {
        AggregateQuery countQuery = q.count();
        AggregateQuerySnapshot snapshot = countQuery.get().get();
        return snapshot.getCount();
    }

    private com.google.cloud.firestore.CollectionReference tenantStudents(String tenantId) {
        String safeTenant = tenantId == null || tenantId.isBlank() ? "global" : tenantId;
        return firestore.collection("tenants").document(safeTenant).collection("students");
    }

    private TeacherAudience resolveTeacherAudience(String schoolId, List<String> allowedGroupIds) {
        Set<String> studentIds = new HashSet<>();
        Set<String> emails = new HashSet<>();
        for (String groupId : allowedGroupIds) {
            if (groupId == null || groupId.isBlank()) continue;
            try {
                var groupOpt = groupService.findById(groupId.trim(), schoolId);
                if (groupOpt.isEmpty()) continue;
                List<String> members = groupOpt.get().getMemberIds();
                if (members == null || members.isEmpty()) continue;
                for (String member : members) {
                    if (member == null || member.isBlank()) continue;
                    String value = member.trim();
                    if (value.contains("@")) {
                        emails.add(value.toLowerCase());
                    } else {
                        studentIds.add(value);
                    }
                }
            } catch (Exception ignored) {
                // Un grupo inválido no debe romper el directorio completo
            }
        }
        return new TeacherAudience(studentIds, emails);
    }

    private boolean isTeacherAllowedStudent(StudentDocument student, TeacherAudience audience) {
        if (student == null || audience == null) return false;

        if (student.getId() != null && audience.studentIds().contains(student.getId().trim())) {
            return true;
        }
        if (student.getEmail() != null && audience.emails().contains(student.getEmail().trim().toLowerCase())) {
            return true;
        }
        if (student.getGuardianEmails() != null) {
            for (String email : student.getGuardianEmails()) {
                if (email != null && audience.emails().contains(email.trim().toLowerCase())) {
                    return true;
                }
            }
        }
        if (student.getGuardians() != null) {
            for (GuardianContact guardian : student.getGuardians()) {
                if (guardian == null || guardian.getEmail() == null) continue;
                String ge = guardian.getEmail().trim().toLowerCase();
                if (!ge.isBlank() && audience.emails().contains(ge)) {
                    return true;
                }
            }
        }
        return false;
    }

    private PhoneDirectoryItemDto toDirectoryItem(StudentDocument student) {
        List<GuardianContact> guardians = student.getGuardians() == null
                ? List.of()
                : student.getGuardians().stream()
                .filter(Objects::nonNull)
                .map(g -> new GuardianContact(
                        safe(g.getName()),
                        safe(g.getEmail()),
                        safe(g.getPhone())
                ))
                .collect(Collectors.toList());

        String studentName = String.join(" ",
                safe(student.getFirstName()),
                safe(student.getLastNameFather()),
                safe(student.getLastNameMother())
        ).trim();

        return new PhoneDirectoryItemDto(
                student.getId(),
                student.getSchoolId(),
                student.getYear(),
                student.getCourse(),
                student.getRun(),
                studentName,
                student.getPhone(),
                guardians
        );
    }

    private boolean matchesQuery(PhoneDirectoryItemDto item, String query) {
        String guardiansName = item.guardians() == null
                ? ""
                : item.guardians().stream()
                .map(g -> safe(g.getName()))
                .collect(Collectors.joining(" "));
        String guardiansPhone = item.guardians() == null
                ? ""
                : item.guardians().stream()
                .map(g -> safe(g.getPhone()))
                .collect(Collectors.joining(" "));
        return SearchUtils.matchesQuery(
                query,
                item.studentName(),
                item.course(),
                item.run(),
                item.studentPhone(),
                guardiansName,
                guardiansPhone
        );
    }

    private String safe(String value) {
        return value == null ? "" : value.trim();
    }

    private record TeacherAudience(Set<String> studentIds, Set<String> emails) {}
}
