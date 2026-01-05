package com.notiflow.service;

import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.QuerySnapshot;
import com.notiflow.dto.TeacherPermissionDto;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutionException;

@Service
public class TeacherPermissionService {
    private final Firestore firestore;

    public TeacherPermissionService(Firestore firestore) {
        this.firestore = firestore;
    }

    public List<String> getAllowedGroups(String schoolId, String email) {
        if (schoolId == null || schoolId.isBlank() || email == null || email.isBlank()) return List.of();
        try {
            String safeTenant = schoolId.trim().toLowerCase();
            String docId = normalizeEmail(email);
            DocumentSnapshot snap = firestore.collection("tenants")
                    .document(safeTenant)
                    .collection("teacherPermissions")
                    .document(docId)
                    .get()
                    .get();
            if (!snap.exists()) return List.of();
            List<String> allowed = (List<String>) snap.get("allowedGroupIds");
            return allowed == null ? List.of() : allowed;
        } catch (InterruptedException | ExecutionException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("Error obteniendo permisos de profesor", e);
        }
    }

    public void setAllowedGroups(String schoolId, String email, List<String> groupIds) {
        if (schoolId == null || schoolId.isBlank() || email == null || email.isBlank()) {
            throw new IllegalArgumentException("Colegio y email requeridos");
        }
        try {
            String safeTenant = schoolId.trim().toLowerCase();
            String docId = normalizeEmail(email);
            List<String> clean = new ArrayList<>();
            if (groupIds != null) {
                for (String g : groupIds) {
                    if (g != null && !g.isBlank()) clean.add(g.trim());
                }
            }
            firestore.collection("tenants")
                    .document(safeTenant)
                    .collection("teacherPermissions")
                    .document(docId)
                    .set(java.util.Map.of(
                            "email", normalizeEmail(email),
                            "allowedGroupIds", clean
                    ))
                    .get();
        } catch (InterruptedException | ExecutionException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("Error guardando permisos de profesor", e);
        }
    }

    public List<TeacherPermissionDto> list(String schoolId) {
        if (schoolId == null || schoolId.isBlank()) return List.of();
        try {
            String safeTenant = schoolId.trim().toLowerCase();
            QuerySnapshot snap = firestore.collection("tenants")
                    .document(safeTenant)
                    .collection("teacherPermissions")
                    .get()
                    .get();
            List<TeacherPermissionDto> result = new ArrayList<>();
            for (DocumentSnapshot doc : snap.getDocuments()) {
                List<String> allowed = (List<String>) doc.get("allowedGroupIds");
                result.add(new TeacherPermissionDto(doc.getId(), allowed == null ? List.of() : allowed));
            }
            return result;
        } catch (InterruptedException | ExecutionException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("Error listando permisos de profesores", e);
        }
    }

    private String normalizeEmail(String email) {
        return email == null ? "" : email.trim().toLowerCase();
    }
}
