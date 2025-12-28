package com.notiflow.service;

import com.google.api.core.ApiFuture;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.Firestore;
import com.notiflow.dto.ImportResult;
import com.notiflow.model.GroupDocument;
import com.notiflow.model.StudentDocument;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVRecord;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ExecutionException;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
public class StudentImportService {

    private static final Logger log = LoggerFactory.getLogger(StudentImportService.class);
    private final Firestore firestore;

    private static final Pattern NON_ALNUM = Pattern.compile("[^0-9A-Za-z]");

    public StudentImportService(Firestore firestore) {
        this.firestore = firestore;
    }

    public ImportResult importCsv(MultipartFile file, String schoolId) {
        int processed = 0;
        int created = 0;
        int updated = 0;
        List<String> errors = new ArrayList<>();
        String targetSchool = (schoolId == null || schoolId.isBlank()) ? "global" : schoolId;

        Map<String, List<String>> courseMembers = new HashMap<>();
        List<String> allMembers = new ArrayList<>();
        String defaultYear = String.valueOf(java.time.Year.now().getValue());

        try (BufferedReader reader = new BufferedReader(new InputStreamReader(file.getInputStream(), StandardCharsets.UTF_8));
             CSVParser parser = CSVFormat.DEFAULT
                     .withFirstRecordAsHeader()
                     .withIgnoreEmptyLines()
                     .withTrim()
                     .parse(reader)) {

            for (CSVRecord record : parser) {
                processed++;
                try {
                    StudentDocument doc = toStudent(record, targetSchool, defaultYear);
                    if (doc.getEmail() != null && !doc.getEmail().isBlank()) {
                        allMembers.add(doc.getEmail());
                    }
                    courseMembers.computeIfAbsent(doc.getCourse(), k -> new ArrayList<>());
                    if (doc.getEmail() != null && !doc.getEmail().isBlank()) {
                        courseMembers.get(doc.getCourse()).add(doc.getEmail());
                    }

                    boolean existed = upsertStudent(doc);
                    if (existed) updated++; else created++;
                } catch (Exception rowEx) {
                    errors.add("Fila " + record.getRecordNumber() + ": " + rowEx.getMessage());
                }
            }

            // Grupos: Todo el colegio + por curso
            createOrUpdateGroup(allMembers, "Todo el colegio", targetSchool, defaultYear, slug(targetSchool + "-all-" + defaultYear));
            for (Map.Entry<String, List<String>> entry : courseMembers.entrySet()) {
                String course = entry.getKey();
                String id = slug(targetSchool + "-" + course + "-" + defaultYear);
                createOrUpdateGroup(entry.getValue(), course, targetSchool, defaultYear, id);
            }

        } catch (Exception e) {
            log.error("Error importando CSV", e);
            errors.add("Error general: " + e.getMessage());
        }

        return new ImportResult(processed, created, updated, errors.size() > 50 ? errors.subList(0, 50) : errors);
    }

    private StudentDocument toStudent(CSVRecord r, String schoolId, String defaultYear) {
        StudentDocument s = new StudentDocument();
        s.setSchoolId(schoolId);
        s.setYear(get(r, "Año", defaultYear));
        s.setCourse(get(r, "Curso", "N/A"));
        s.setRun(cleanRun(get(r, "RUN", "")));
        s.setGender(get(r, "Genero", ""));
        s.setFirstName(capitalize(get(r, "Nombres", "")));
        s.setLastNameFather(capitalize(get(r, "Apellido Paterno", "")));
        s.setLastNameMother(capitalize(get(r, "Apellido Materno", "")));
        s.setAddress(get(r, "Direccion", ""));
        s.setCommune(get(r, "Comuna Residencia", ""));
        s.setEmail(normalizeEmail(get(r, "Email", "")));
        s.setPhone(get(r, "Celular", ""));
        s.setGuardianFirstName("");
        s.setGuardianLastName("");
        s.setUpdatedAt(Instant.now());
        s.setCreatedAt(Instant.now());

        // Id preferente: RUN; fallback email; fallback random
        String id = s.getRun();
        if (id == null || id.isBlank()) {
            id = s.getEmail() != null ? s.getEmail() : UUID.randomUUID().toString();
        }
        s.setId(id);
        return s;
    }

    private boolean upsertStudent(StudentDocument s) throws ExecutionException, InterruptedException {
        DocumentReference ref = tenantStudents(s.getSchoolId()).document(s.getId());
        ApiFuture<DocumentSnapshot> snapFut = ref.get();
        DocumentSnapshot snap = snapFut.get();
        if (snap.exists()) {
            StudentDocument existing = snap.toObject(StudentDocument.class);
            if (existing != null && existing.getCreatedAt() != null) {
                s.setCreatedAt(existing.getCreatedAt());
            }
            ref.set(s).get();
            return true;
        } else {
            ref.set(s).get();
            return false;
        }
    }

    private void createOrUpdateGroup(List<String> memberEmails, String name, String schoolId, String year, String id) {
        List<String> members = memberEmails.stream()
                .filter(Objects::nonNull)
                .map(String::trim)
                .filter(e -> !e.isBlank())
                .distinct()
                .collect(Collectors.toList());
        try {
            DocumentReference ref = tenantGroups(schoolId).document(id);
            ApiFuture<DocumentSnapshot> fut = ref.get();
            DocumentSnapshot snap = fut.get();
            GroupDocument g = snap.exists() ? snap.toObject(GroupDocument.class) : new GroupDocument();
            if (g == null) g = new GroupDocument();
            g.setId(id);
            g.setName(name);
            g.setDescription(name);
            g.setMemberIds(members);
            g.setSchoolId(schoolId);
            g.setYear(year);
            if (g.getCreatedAt() == null) g.setCreatedAt(Instant.now());
            ref.set(g).get();
        } catch (Exception e) {
            log.warn("No se pudo crear/actualizar grupo {}: {}", name, e.getMessage());
        }
    }

    private String get(CSVRecord r, String header, String defaultVal) {
        try {
            String v = r.get(header);
            return v == null ? defaultVal : v.trim();
        } catch (IllegalArgumentException e) {
            return defaultVal;
        }
    }

    private String cleanRun(String run) {
        if (run == null) return "";
        String cleaned = NON_ALNUM.matcher(run).replaceAll("").toUpperCase();
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

    private String normalizeEmail(String email) {
        if (email == null) return "";
        return email.trim().toLowerCase();
    }

    private String capitalize(String text) {
        if (text == null || text.isBlank()) return text == null ? "" : text.trim();
        String lower = text.trim().toLowerCase();
        return Arrays.stream(lower.split(" "))
                .filter(s -> !s.isBlank())
                .map(s -> s.substring(0, 1).toUpperCase() + s.substring(1))
                .collect(Collectors.joining(" "));
    }

    private String slug(String text) {
        return NON_ALNUM.matcher(text.toLowerCase()).replaceAll("-");
    }

    private com.google.cloud.firestore.CollectionReference tenantStudents(String tenantId) {
        String safeTenant = tenantId == null || tenantId.isBlank() ? "global" : tenantId;
        return firestore.collection("tenants").document(safeTenant).collection("students");
    }

    private com.google.cloud.firestore.CollectionReference tenantGroups(String tenantId) {
        String safeTenant = tenantId == null || tenantId.isBlank() ? "global" : tenantId;
        return firestore.collection("tenants").document(safeTenant).collection("groups");
    }
}
