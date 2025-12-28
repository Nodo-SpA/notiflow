package com.notiflow.service;

import com.google.api.core.ApiFuture;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.QueryDocumentSnapshot;
import com.google.cloud.firestore.QuerySnapshot;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.concurrent.ExecutionException;

@Service
public class UsageService {

    private final Firestore firestore;

    public UsageService(Firestore firestore) {
        this.firestore = firestore;
    }

    public void recordAppLogin(String email) {
        if (email == null || email.isBlank()) return;
        String normalized = email.toLowerCase();
        try {
            // Buscar el usuario para obtener schoolId
            ApiFuture<QuerySnapshot> userQuery = firestore.collectionGroup("users")
                    .whereEqualTo("email", normalized)
                    .limit(1)
                    .get();
            String schoolId = "desconocido";
            List<QueryDocumentSnapshot> userDocs = userQuery.get().getDocuments();
            if (!userDocs.isEmpty()) {
                Object sid = userDocs.get(0).get("schoolId");
                if (sid != null) {
                    schoolId = sid.toString();
                }
            }

            DocumentReference ref = tenantAppLogins(schoolId).document(normalized);
            java.util.Map<String, Object> data = new java.util.HashMap<>();
            data.put("userEmail", normalized);
            data.put("lastLogin", Instant.now().toString());
            data.put("schoolId", schoolId);
            ref.set(data).get();
        } catch (InterruptedException | ExecutionException e) {
            Thread.currentThread().interrupt();
            // No bloquear login por tracking
        }
    }

    public long countAppActiveUsers() {
        try {
            ApiFuture<QuerySnapshot> query = firestore.collectionGroup("appLogins").get();
            List<QueryDocumentSnapshot> docs = query.get().getDocuments();
            return docs.size();
        } catch (InterruptedException | ExecutionException e) {
            Thread.currentThread().interrupt();
            return 0;
        }
    }

    public long countUsersWithEmail() {
        try {
            ApiFuture<QuerySnapshot> query = firestore.collectionGroup("users")
                    .whereNotEqualTo("email", null)
                    .get();
            List<QueryDocumentSnapshot> docs = query.get().getDocuments();
            return docs.size();
        } catch (InterruptedException | ExecutionException e) {
            Thread.currentThread().interrupt();
            return 0;
        }
    }

    public java.util.Map<String, Long> countAppActiveBySchool() {
        java.util.Map<String, Long> counts = new java.util.HashMap<>();
        try {
            ApiFuture<QuerySnapshot> query = firestore.collectionGroup("appLogins").get();
            List<QueryDocumentSnapshot> docs = query.get().getDocuments();
            for (QueryDocumentSnapshot doc : docs) {
                String schoolId = doc.getString("schoolId");
                if (schoolId == null || schoolId.isBlank()) {
                    schoolId = "desconocido";
                }
                counts.put(schoolId, counts.getOrDefault(schoolId, 0L) + 1);
            }
        } catch (InterruptedException | ExecutionException e) {
            Thread.currentThread().interrupt();
        }
        return counts;
    }

    private com.google.cloud.firestore.CollectionReference tenantAppLogins(String tenantId) {
        String safeTenant = tenantId == null || tenantId.isBlank() ? "global" : tenantId;
        return firestore.collection("tenants").document(safeTenant).collection("appLogins");
    }
}
