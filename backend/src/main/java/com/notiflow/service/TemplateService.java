package com.notiflow.service;

import com.google.api.core.ApiFuture;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.QueryDocumentSnapshot;
import com.google.cloud.firestore.QuerySnapshot;
import com.notiflow.dto.TemplateDto;
import com.notiflow.dto.TemplateRequest;
import com.notiflow.model.TemplateDocument;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ExecutionException;
import java.util.stream.Collectors;

@Service
public class TemplateService {

    private final Firestore firestore;

    public TemplateService(Firestore firestore) {
        this.firestore = firestore;
    }

    public List<TemplateDto> listByOwner(String ownerEmail, String schoolId) {
        try {
            com.google.cloud.firestore.Query base = firestore.collectionGroup("templates")
                    .whereEqualTo("ownerEmail", ownerEmail.toLowerCase());
            if (schoolId != null && !schoolId.isBlank() && !"global".equalsIgnoreCase(schoolId)) {
                base = base.whereEqualTo("schoolId", schoolId);
            }
            ApiFuture<QuerySnapshot> query = base
                    .orderBy("updatedAt", com.google.cloud.firestore.Query.Direction.DESCENDING)
                    .get();
            List<QueryDocumentSnapshot> docs = query.get().getDocuments();
            return docs.stream().map(doc -> {
                TemplateDocument t = doc.toObject(TemplateDocument.class);
                t.setId(doc.getId());
                return new TemplateDto(t.getId(), t.getName(), t.getContent(), t.getCreatedAt(), t.getUpdatedAt());
            }).collect(Collectors.toList());
        } catch (InterruptedException | ExecutionException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("Error listando plantillas", e);
        }
    }

    public TemplateDto create(TemplateRequest request, String ownerEmail, String schoolId) {
        try {
            TemplateDocument doc = new TemplateDocument();
            doc.setId(UUID.randomUUID().toString());
            doc.setName(request.name());
            doc.setContent(request.content());
            doc.setOwnerEmail(ownerEmail.toLowerCase());
            doc.setSchoolId(schoolId == null || schoolId.isBlank() ? "global" : schoolId);
            Instant now = Instant.now();
            doc.setCreatedAt(now);
            doc.setUpdatedAt(now);
            DocumentReference ref = tenantTemplates(doc.getSchoolId()).document(doc.getId());
            ref.set(doc).get();
            return new TemplateDto(doc.getId(), doc.getName(), doc.getContent(), doc.getCreatedAt(), doc.getUpdatedAt());
        } catch (InterruptedException | ExecutionException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("Error creando plantilla", e);
        }
    }

    public TemplateDto update(String id, TemplateRequest request, String ownerEmail, String schoolId) {
        try {
            DocumentReference ref = findTemplateRef(id, ownerEmail, schoolId);
            if (ref == null) {
                throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.NOT_FOUND, "Plantilla no encontrada");
            }
            TemplateDocument existing = ref.get().get().toObject(TemplateDocument.class);
            if (existing == null) {
                throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.NOT_FOUND, "Plantilla no encontrada");
            }
            existing.setName(request.name());
            existing.setContent(request.content());
            existing.setUpdatedAt(Instant.now());
            ref.set(existing).get();
            return new TemplateDto(existing.getId(), existing.getName(), existing.getContent(), existing.getCreatedAt(), existing.getUpdatedAt());
        } catch (InterruptedException | ExecutionException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("Error actualizando plantilla", e);
        }
    }

    public void delete(String id, String ownerEmail, String schoolId) {
        try {
            DocumentReference ref = findTemplateRef(id, ownerEmail, schoolId);
            if (ref == null) {
                throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.NOT_FOUND, "Plantilla no encontrada");
            }
            ref.delete().get();
        } catch (InterruptedException | ExecutionException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("Error eliminando plantilla", e);
        }
    }

    private DocumentReference findTemplateRef(String id, String ownerEmail, String schoolId) throws ExecutionException, InterruptedException {
        com.google.cloud.firestore.Query q = firestore.collectionGroup("templates")
                .whereEqualTo("id", id)
                .whereEqualTo("ownerEmail", ownerEmail.toLowerCase())
                .limit(1);
        if (schoolId != null && !schoolId.isBlank()) {
            q = q.whereEqualTo("schoolId", schoolId);
        }
        List<QueryDocumentSnapshot> docs = q.get().get().getDocuments();
        if (docs.isEmpty()) return null;
        return docs.get(0).getReference();
    }

    private com.google.cloud.firestore.CollectionReference tenantTemplates(String tenantId) {
        String safeTenant = tenantId == null || tenantId.isBlank() ? "global" : tenantId;
        return firestore.collection("tenants").document(safeTenant).collection("templates");
    }
}
