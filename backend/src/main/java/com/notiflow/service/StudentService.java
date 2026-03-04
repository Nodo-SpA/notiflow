package com.notiflow.service;

import com.google.api.core.ApiFuture;
import com.google.cloud.firestore.AggregateQuery;
import com.google.cloud.firestore.AggregateQuerySnapshot;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.Query;
import com.google.cloud.firestore.QueryDocumentSnapshot;
import com.google.cloud.firestore.QuerySnapshot;
import com.notiflow.dto.StudentDto;
import com.notiflow.dto.StudentListResponse;
import com.notiflow.dto.StudentRequest;
import com.notiflow.dto.GuardianContact;
import com.notiflow.model.StudentDocument;
import com.notiflow.util.SearchUtils;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ExecutionException;
import java.util.stream.Collectors;

@Service
public class StudentService {

    private final Firestore firestore;
    private static final int MAX_SEARCH_SCAN = 5000;
    private static final Logger log = LoggerFactory.getLogger(StudentService.class);

    public StudentService(Firestore firestore) {
        this.firestore = firestore;
    }

    public StudentDto create(StudentRequest request, String schoolId) {
        try {
            validateRequiredFields(request);
            StudentDocument s = new StudentDocument();
            s.setSchoolId(schoolId);
            s.setYear(String.valueOf(java.time.Year.now().getValue()));
            s.setCourse(defaultValue(request.course(), "N/A"));
            s.setRun(cleanRun(request.run()));
            s.setGender(defaultValue(request.gender(), ""));
            s.setFirstName(capitalize(defaultValue(request.firstName(), "")));
            s.setLastNameFather(capitalize(defaultValue(request.lastNameFather(), "")));
            s.setLastNameMother(capitalize(defaultValue(request.lastNameMother(), "")));
            s.setAddress(defaultValue(request.address(), ""));
            s.setCommune(defaultValue(request.commune(), ""));
            s.setEmail(normalizeEmail(defaultValue(request.email(), "")));
            s.setPhone(defaultValue(request.phone(), ""));
            applyGuardians(s, request, null);
            s.setUpdatedAt(Instant.now());
            s.setCreatedAt(Instant.now());

            String id = s.getRun();
            if (id == null || id.isBlank()) {
                id = s.getEmail() != null && !s.getEmail().isBlank() ? s.getEmail() : UUID.randomUUID().toString();
            }
            s.setId(id);

            var ref = tenantStudents(schoolId).document(id);
            var snap = ref.get().get();
            if (snap.exists()) {
                StudentDocument existing = snap.toObject(StudentDocument.class);
                if (existing != null && existing.getCreatedAt() != null) {
                    s.setCreatedAt(existing.getCreatedAt());
                }
            }
            ref.set(s).get();
            return toDto(s);
        } catch (InterruptedException | ExecutionException e) {
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            throw new RuntimeException("Error creando estudiante", e);
        }
    }

    public StudentListResponse list(String schoolId, String year, String query, int page, int size) {
        Query q = tenantStudents(schoolId);
        if (year != null && !year.isBlank()) {
            q = q.whereEqualTo("year", year);
        }
        return fetch(q, query, page, size);
    }

    public StudentListResponse listAll(String year, String query, int page, int size) {
        Query q = firestore.collectionGroup("students");
        if (year != null && !year.isBlank()) {
            q = q.whereEqualTo("year", year);
        }
        return fetch(q, query, page, size);
    }

    public StudentDto update(String id, StudentRequest request, String requesterSchoolId, boolean isGlobalAdmin) {
        try {
            validateRequiredFields(request);
            var currentRef = firestore.collectionGroup("students")
                    .whereEqualTo("id", id)
                    .limit(1)
                    .get()
                    .get()
                    .getDocuments()
                    .stream()
                    .findFirst()
                    .map(QueryDocumentSnapshot::getReference)
                    .orElse(null);
            if (currentRef == null) {
                throw new IllegalArgumentException("Estudiante no encontrado");
            }
            StudentDocument existing = currentRef.get().get().toObject(StudentDocument.class);
            if (existing == null) {
                throw new IllegalArgumentException("Estudiante inválido");
            }
            if (!isGlobalAdmin && existing.getSchoolId() != null && !existing.getSchoolId().equalsIgnoreCase(requesterSchoolId)) {
                throw new IllegalArgumentException("No puedes editar estudiantes de otro colegio");
            }

            String targetSchoolId = existing.getSchoolId();
            if (isGlobalAdmin && request.schoolId() != null && !request.schoolId().isBlank()) {
                targetSchoolId = request.schoolId();
            }

            StudentDocument s = new StudentDocument();
            s.setId(existing.getId());
            s.setSchoolId(targetSchoolId);
            s.setYear(String.valueOf(java.time.Year.now().getValue()));
            s.setCourse(defaultValue(request.course(), existing.getCourse()));
            s.setRun(request.run() != null ? cleanRun(request.run()) : existing.getRun());
            s.setGender(defaultValue(request.gender(), existing.getGender()));
            s.setFirstName(capitalize(defaultValue(request.firstName(), existing.getFirstName())));
            s.setLastNameFather(capitalize(defaultValue(request.lastNameFather(), existing.getLastNameFather())));
            s.setLastNameMother(capitalize(defaultValue(request.lastNameMother(), existing.getLastNameMother())));
            s.setAddress(defaultValue(request.address(), existing.getAddress()));
            s.setCommune(defaultValue(request.commune(), existing.getCommune()));
            s.setEmail(normalizeEmail(defaultValue(request.email(), existing.getEmail())));
            s.setPhone(defaultValue(request.phone(), existing.getPhone()));
            applyGuardians(s, request, existing);
            s.setCreatedAt(existing.getCreatedAt() != null ? existing.getCreatedAt() : Instant.now());
            s.setUpdatedAt(Instant.now());

            // Si cambia de tenant, mover el documento
            if (existing.getSchoolId() != null && !existing.getSchoolId().equalsIgnoreCase(targetSchoolId)) {
                tenantStudents(targetSchoolId).document(s.getId()).set(s).get();
                currentRef.delete().get();
            } else {
                tenantStudents(targetSchoolId).document(s.getId()).set(s).get();
            }
            return toDto(s);
        } catch (InterruptedException | ExecutionException e) {
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            throw new RuntimeException("Error actualizando estudiante", e);
        }
    }

    public List<StudentDocument> listAllBySchoolAndYear(String schoolId, String year) {
        try {
            Query q = tenantStudents(schoolId);
            if (year != null && !year.isBlank()) {
                q = q.whereEqualTo("year", year);
            }
            List<QueryDocumentSnapshot> docs = q.get().get().getDocuments();
            List<StudentDocument> result = new ArrayList<>();
            for (QueryDocumentSnapshot doc : docs) {
                StudentDocument s = doc.toObject(StudentDocument.class);
                if (s == null) continue;
                s.setId(doc.getId());
                result.add(s);
            }
            return result;
        } catch (InterruptedException | ExecutionException e) {
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            log.warn("Error listando estudiantes para grupos: {}", e.getMessage());
            return List.of();
        }
    }

    public java.util.Optional<StudentDto> getById(String id) {
        if (id == null || id.isBlank()) return java.util.Optional.empty();
        try {
            QuerySnapshot snap = firestore.collectionGroup("students")
                    .whereEqualTo("id", id)
                    .limit(1)
                    .get()
                    .get();
            if (snap.isEmpty()) return java.util.Optional.empty();
            QueryDocumentSnapshot doc = snap.getDocuments().get(0);
            StudentDocument s = doc.toObject(StudentDocument.class);
            if (s == null) return java.util.Optional.empty();
            s.setId(doc.getId());
            return java.util.Optional.of(toDto(s));
        } catch (InterruptedException | ExecutionException e) {
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            log.warn("Error obteniendo estudiante {}: {}", id, e.getMessage());
            return java.util.Optional.empty();
        }
    }

    public void delete(String id, String requesterSchoolId, boolean isGlobalAdmin) {
        if (id == null || id.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "ID requerido");
        }
        try {
            QuerySnapshot snap = firestore.collectionGroup("students")
                    .whereEqualTo("id", id)
                    .limit(1)
                    .get()
                    .get();
            if (snap.isEmpty()) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Estudiante no encontrado");
            }
            QueryDocumentSnapshot doc = snap.getDocuments().get(0);
            StudentDocument s = doc.toObject(StudentDocument.class);
            if (s == null) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Estudiante inválido");
            }
            String targetSchool = s.getSchoolId() == null || s.getSchoolId().isBlank() ? "global" : s.getSchoolId();
            if (!isGlobalAdmin && requesterSchoolId != null && !requesterSchoolId.equalsIgnoreCase(targetSchool)) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "No puedes eliminar estudiantes de otro colegio");
            }
            doc.getReference().delete().get();
        } catch (InterruptedException | ExecutionException e) {
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            throw new RuntimeException("Error eliminando estudiante", e);
        }
    }

    private void validateRequiredFields(StudentRequest request) {
        if (request == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Datos del estudiante inválidos");
        }
        if (isBlank(request.firstName())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Nombres es obligatorio");
        }
        if (isBlank(request.lastNameFather())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Apellido paterno es obligatorio");
        }
        if (isBlank(request.lastNameMother())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Apellido materno es obligatorio");
        }
        if (isBlank(request.course())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Curso es obligatorio");
        }
        if (request.guardians() == null || request.guardians().isEmpty() || !hasGuardianData(request.guardians())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Debes agregar al menos un apoderado");
        }
    }

    private boolean hasGuardianData(List<GuardianContact> guardians) {
        for (GuardianContact g : guardians) {
            if (g == null) continue;
            if (!isBlank(g.getName()) || !isBlank(g.getEmail()) || !isBlank(g.getPhone())) {
                return true;
            }
        }
        return false;
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }

    private StudentDto toDto(StudentDocument s) {
        List<GuardianContact> guardians = s.getGuardians() == null ? java.util.Collections.emptyList() : s.getGuardians();
        List<String> guardianEmails = s.getGuardianEmails() == null ? java.util.Collections.emptyList() : s.getGuardianEmails();
        return new StudentDto(
                s.getId(),
                s.getSchoolId(),
                s.getYear(),
                s.getCourse(),
                s.getRun(),
                s.getGender(),
                s.getFirstName(),
                s.getLastNameFather(),
                s.getLastNameMother(),
                s.getAddress(),
                s.getCommune(),
                s.getEmail(),
                s.getPhone(),
                s.getGuardianFirstName(),
                s.getGuardianLastName(),
                guardians,
                guardianEmails,
                s.getCreatedAt(),
                s.getUpdatedAt()
        );
    }

    private StudentListResponse fetch(Query baseQuery, String query, int page, int size) {
        int safePage = Math.max(1, page);
        int safeSize = Math.min(Math.max(1, size), 200);
        String normalizedQuery = query == null ? "" : query.trim().toLowerCase();
        boolean hasSearch = !normalizedQuery.isBlank();

        try {
            if (hasSearch) {
                ApiFuture<QuerySnapshot> fut = baseQuery.limit(MAX_SEARCH_SCAN).get();
                List<QueryDocumentSnapshot> docs = fut.get().getDocuments();
                List<StudentDto> filtered = new ArrayList<>();
                boolean reachedLimit = docs.size() == MAX_SEARCH_SCAN;
                for (QueryDocumentSnapshot doc : docs) {
                    StudentDocument s = doc.toObject(StudentDocument.class);
                    if (s == null) continue;
                    s.setId(doc.getId());
                    if (matchesQuery(s, normalizedQuery)) {
                        filtered.add(toDto(s));
                    }
                }
                int from = Math.min((safePage - 1) * safeSize, filtered.size());
                int to = Math.min(from + safeSize, filtered.size());
                List<StudentDto> pageItems = filtered.subList(from, to);
                boolean hasMore = reachedLimit || to < filtered.size();
                long total = filtered.size() + (reachedLimit ? 1 : 0);
                return new StudentListResponse(pageItems, total, safePage, safeSize, hasMore);
            } else {
                long total = count(baseQuery);
                ApiFuture<QuerySnapshot> fut = baseQuery
                        .offset((safePage - 1) * safeSize)
                        .limit(safeSize)
                        .get();
                List<QueryDocumentSnapshot> docs = fut.get().getDocuments();
                List<StudentDto> result = new ArrayList<>();
                for (QueryDocumentSnapshot doc : docs) {
                    StudentDocument s = doc.toObject(StudentDocument.class);
                    if (s == null) continue;
                    s.setId(doc.getId());
                    result.add(toDto(s));
                }
                boolean hasMore = (long) safePage * safeSize < total;
                return new StudentListResponse(result, total, safePage, safeSize, hasMore);
            }
        } catch (InterruptedException | ExecutionException e) {
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            throw new RuntimeException("Error listando estudiantes", e);
        }
    }

    private boolean matchesQuery(StudentDocument s, String q) {
        String fullName = String.join(" ",
                s.getFirstName() == null ? "" : s.getFirstName(),
                s.getLastNameFather() == null ? "" : s.getLastNameFather(),
                s.getLastNameMother() == null ? "" : s.getLastNameMother()
        );
        String email = s.getEmail() == null ? "" : s.getEmail();
        String course = s.getCourse() == null ? "" : s.getCourse();
        String run = s.getRun() == null ? "" : s.getRun();
        String commune = s.getCommune() == null ? "" : s.getCommune();
        String address = s.getAddress() == null ? "" : s.getAddress();
        String guardianName = String.join(" ",
                s.getGuardianFirstName() == null ? "" : s.getGuardianFirstName(),
                s.getGuardianLastName() == null ? "" : s.getGuardianLastName()
        );
        String guardiansConcat = "";
        if (s.getGuardians() != null) {
            guardiansConcat = s.getGuardians().stream()
                    .map(g -> (g.getName() == null ? "" : g.getName()) + " " + (g.getEmail() == null ? "" : g.getEmail()))
                    .collect(Collectors.joining(" "));
        }

        return SearchUtils.matchesQuery(q, fullName, guardianName, guardiansConcat, email, course, run, commune, address);
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

    public java.util.List<StudentDocument> findAllByEmail(String email) {
        if (email == null || email.isBlank()) return java.util.Collections.emptyList();
        try {
            String normalized = email.trim().toLowerCase();
            java.util.Set<String> seenIds = new java.util.HashSet<>();
            java.util.List<StudentDocument> result = new java.util.ArrayList<>();

            // buscar por email principal
            ApiFuture<QuerySnapshot> queryEmail = firestore.collectionGroup("students")
                    .whereEqualTo("email", normalized)
                    .get();
            List<QueryDocumentSnapshot> docsEmail = queryEmail.get().getDocuments();
            for (QueryDocumentSnapshot doc : docsEmail) {
                StudentDocument s = doc.toObject(StudentDocument.class);
                if (s != null && seenIds.add(doc.getId())) {
                    s.setId(doc.getId());
                    result.add(s);
                }
            }

            // buscar en guardianEmails (array)
            ApiFuture<QuerySnapshot> queryGuardian = firestore.collectionGroup("students")
                    .whereArrayContains("guardianEmails", normalized)
                    .get();
            List<QueryDocumentSnapshot> docsGuardian = queryGuardian.get().getDocuments();
            for (QueryDocumentSnapshot doc : docsGuardian) {
                StudentDocument s = doc.toObject(StudentDocument.class);
                if (s != null && seenIds.add(doc.getId())) {
                    s.setId(doc.getId());
                    result.add(s);
                }
            }
            return result;
        } catch (InterruptedException | ExecutionException e) {
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            log.warn("Error consultando estudiantes por email {}: {}", email, e.getMessage());
            return java.util.Collections.emptyList();
        }
    }

    public java.util.Optional<StudentDocument> findByEmail(String email) {
        if (email == null || email.isBlank()) return java.util.Optional.empty();
        String normalized = email.trim().toLowerCase();
        List<StudentDocument> all = findAllByEmail(normalized);
        if (all.isEmpty()) return java.util.Optional.empty();
        return java.util.Optional.ofNullable(all.get(0));
    }

    public java.util.Optional<StudentDocument> findById(String id) {
        if (id == null || id.isBlank()) return java.util.Optional.empty();
        try {
            QuerySnapshot snap = firestore.collectionGroup("students")
                    .whereEqualTo("id", id)
                    .limit(1)
                    .get()
                    .get();
            if (snap.isEmpty()) return java.util.Optional.empty();
            QueryDocumentSnapshot doc = snap.getDocuments().get(0);
            StudentDocument s = doc.toObject(StudentDocument.class);
            if (s == null) return java.util.Optional.empty();
            s.setId(doc.getId());
            return java.util.Optional.of(s);
        } catch (InterruptedException | ExecutionException e) {
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            log.warn("Error consultando estudiante por id {}: {}", id, e.getMessage());
            return java.util.Optional.empty();
        }
    }

    private String defaultValue(String value, String fallback) {
        return value == null ? fallback : value.trim();
    }

    private String normalizeEmail(String email) {
        if (email == null) return "";
        return email.trim().toLowerCase();
    }

    public List<String> collectRecipientEmails(String schoolId, String year) {
        try {
            Query q = tenantStudents(schoolId);
            if (year != null && !year.isBlank()) {
                q = q.whereEqualTo("year", year);
            }
            List<QueryDocumentSnapshot> docs = q.get().get().getDocuments();
            List<String> emails = new ArrayList<>();
            for (QueryDocumentSnapshot doc : docs) {
                StudentDocument s = doc.toObject(StudentDocument.class);
                if (s == null) continue;
                List<String> guardianEmails = s.getGuardianEmails() == null ? java.util.Collections.emptyList() : s.getGuardianEmails();
                guardianEmails.stream()
                        .filter(e -> e != null && !e.isBlank())
                        .map(String::trim)
                        .map(String::toLowerCase)
                        .forEach(emails::add);
                if (s.getGuardians() != null) {
                    for (com.notiflow.dto.GuardianContact g : s.getGuardians()) {
                        if (g != null && g.getEmail() != null && !g.getEmail().isBlank()) {
                            emails.add(g.getEmail().trim().toLowerCase());
                        }
                    }
                }
            }
            return emails.stream()
                    .filter(e -> e != null && !e.isBlank())
                    .map(String::toLowerCase)
                    .distinct()
                    .toList();
        } catch (InterruptedException | ExecutionException e) {
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            throw new RuntimeException("Error recopilando correos de estudiantes/apoderados", e);
        }
    }

    private void applyGuardians(StudentDocument s, StudentRequest request, StudentDocument existing) {
        List<GuardianContact> guardians = request.guardians();
        List<GuardianContact> result = new ArrayList<>();

        if (guardians != null && !guardians.isEmpty()) {
            for (GuardianContact g : guardians) {
                if (g == null) continue;
                String name = capitalize(defaultValue(g.getName(), ""));
                String email = normalizeEmail(g.getEmail());
                String phone = defaultValue(g.getPhone(), "");
                if (email.isBlank() && name.isBlank() && phone.isBlank()) continue;
                result.add(new GuardianContact(name, email, phone));
            }
        }

        // fallback a campos antiguos si no se envían guardians
        if (result.isEmpty()) {
            String oldName = capitalize(defaultValue(request.guardianFirstName(), existing != null ? existing.getGuardianFirstName() : ""));
            String oldLast = capitalize(defaultValue(request.guardianLastName(), existing != null ? existing.getGuardianLastName() : ""));
            String combined = (oldName + " " + oldLast).trim();
            if (!combined.isBlank() || (existing != null && existing.getGuardianEmails() != null && !existing.getGuardianEmails().isEmpty())) {
                result.add(new GuardianContact(combined.isBlank() ? "Apoderado" : combined, "", ""));
            }
        }

        List<String> emails = result.stream()
                .map(g -> normalizeEmail(g.getEmail()))
                .filter(e -> !e.isBlank())
                .distinct()
                .collect(Collectors.toList());

        s.setGuardianFirstName(result.isEmpty() ? "" : result.get(0).getName());
        s.setGuardianLastName(""); // deprecated; se deja vacío
        s.setGuardians(result);
        s.setGuardianEmails(emails);
    }
    private String cleanRun(String run) {
        if (run == null) return "";
        String cleaned = run.replaceAll("[^0-9kK]", "").toUpperCase();
        if (cleaned.endsWith("K")) {
            return cleaned.substring(0, cleaned.length() - 1) + "-K";
        }
        if (cleaned.length() > 1) {
            String body = cleaned.substring(0, cleaned.length() - 1);
            String dv = cleaned.substring(cleaned.length() - 1);
            return body + "-" + dv;
        }
        return cleaned;
    }

    private String capitalize(String text) {
        if (text == null || text.isBlank()) return text == null ? "" : text.trim();
        String lower = text.trim().toLowerCase();
        String[] parts = lower.split(" ");
        List<String> capitalized = new ArrayList<>();
        for (String p : parts) {
            if (p.isBlank()) continue;
            capitalized.add(p.substring(0, 1).toUpperCase() + p.substring(1));
        }
        return String.join(" ", capitalized);
    }
}
