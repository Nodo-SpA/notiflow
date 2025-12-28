package com.notiflow.service;

import com.google.api.core.ApiFuture;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.QueryDocumentSnapshot;
import com.google.cloud.firestore.QuerySnapshot;
import com.notiflow.dto.UserCreateRequest;
import com.notiflow.dto.UserDto;
import com.notiflow.model.UserDocument;
import com.notiflow.model.UserRole;
import com.notiflow.service.PasswordResetService.PasswordResetResult;
import org.springframework.context.annotation.Lazy;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ExecutionException;
import java.util.stream.Collectors;

@Service
public class UserService {

    private final Firestore firestore;
    private final PasswordEncoder passwordEncoder;
    private final PasswordResetService passwordResetService;
    private final EmailService emailService;

    public UserService(Firestore firestore, PasswordEncoder passwordEncoder, @Lazy PasswordResetService passwordResetService, EmailService emailService) {
        this.firestore = firestore;
        this.passwordEncoder = passwordEncoder;
        this.passwordResetService = passwordResetService;
        this.emailService = emailService;
    }

    public Optional<UserDocument> findByEmail(String email) {
        try {
            String normalizedEmail = email.toLowerCase();
            ApiFuture<QuerySnapshot> query = firestore.collectionGroup("users")
                    .whereEqualTo("email", normalizedEmail)
                    .orderBy("email")
                    .limit(1)
                    .get();
            List<QueryDocumentSnapshot> docs = query.get().getDocuments();
            if (docs.isEmpty()) {
                return Optional.empty();
            }
            UserDocument user = docs.get(0).toObject(UserDocument.class);
            user.setId(docs.get(0).getId());
            return Optional.of(user);
        } catch (InterruptedException | ExecutionException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("Error consultando usuario", e);
        }
    }

    public UserDocument upsert(UserDocument user) {
        try {
            String docId = user.getId() != null ? user.getId() : UUID.randomUUID().toString();
            user.setId(docId);
            String tenant = user.getSchoolId() == null || user.getSchoolId().isBlank() ? "global" : user.getSchoolId();
            DocumentReference ref = tenantUsers(tenant).document(docId);
            ref.set(user).get();
            return user;
        } catch (InterruptedException | ExecutionException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("Error guardando usuario", e);
        }
    }

    public void deleteById(String id) {
        try {
            QueryDocumentSnapshot snap = firestore.collectionGroup("users")
                    .whereEqualTo("id", id)
                    .limit(1)
                    .get()
                    .get()
                    .getDocuments()
                    .stream()
                    .findFirst()
                    .orElse(null);
            if (snap != null) {
                snap.getReference().delete().get();
            }
        } catch (InterruptedException | ExecutionException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("Error eliminando usuario", e);
        }
    }

    public List<UserDto> listAll(int page, int pageSize, String schoolId, boolean isGlobal) {
        try {
            int safePage = Math.max(1, page);
            int safeSize = Math.min(Math.max(1, pageSize), 100);
            com.google.cloud.firestore.Query queryRef;
            if (isGlobal && (schoolId == null || schoolId.isBlank())) {
                queryRef = firestore.collectionGroup("users");
            } else {
                String target = schoolId == null || schoolId.isBlank() ? "global" : schoolId;
                queryRef = tenantUsers(target);
            }
            if (schoolId != null && !schoolId.isBlank()) {
                queryRef = queryRef.whereEqualTo("schoolId", schoolId);
            }
            ApiFuture<QuerySnapshot> query = queryRef
                    .orderBy("name")
                    .offset((safePage - 1) * safeSize)
                    .limit(safeSize)
                    .get();
            List<QueryDocumentSnapshot> docs = query.get().getDocuments();
            return docs.stream().map(doc -> {
                UserDocument u = doc.toObject(UserDocument.class);
                u.setId(doc.getId());
                return new UserDto(
                        u.getId(),
                        u.getName(),
                        u.getEmail(),
                        u.getRole(),
                        u.getSchoolId(),
                        u.getSchoolName(),
                        u.getRut()
                );
            }).collect(Collectors.toList());
        } catch (InterruptedException | ExecutionException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("Error listando usuarios", e);
        }
    }

    public UserDto create(UserCreateRequest request) {
        UserDocument doc = new UserDocument();
        doc.setName(request.name());
        doc.setEmail(request.email().toLowerCase());
        doc.setPasswordHash(passwordEncoder.encode(request.password()));
        doc.setRole(request.role());
        doc.setSchoolId(request.schoolId());
        doc.setSchoolName(request.schoolName());
        doc.setRut(request.rut());
        UserDocument saved = upsert(doc);
        // Enviar correo de bienvenida con link de reseteo
        try {
            if (emailService.isEnabled()) {
                PasswordResetResult pr = passwordResetService.createResetToken(saved.getEmail(), false);
                emailService.sendWelcomeEmail(saved.getEmail(), saved.getName(), pr.token());
            }
        } catch (Exception e) {
            org.slf4j.LoggerFactory.getLogger(UserService.class)
                    .warn("No se pudo enviar correo de bienvenida a {}", saved.getEmail(), e);
        }
        return new UserDto(
                saved.getId(),
                saved.getName(),
                saved.getEmail(),
                saved.getRole(),
                saved.getSchoolId(),
                saved.getSchoolName(),
                saved.getRut()
        );
    }

    private com.google.cloud.firestore.CollectionReference tenantUsers(String tenantId) {
        String safeTenant = tenantId == null || tenantId.isBlank() ? "global" : tenantId;
        return firestore.collection("tenants").document(safeTenant).collection("users");
    }
}
