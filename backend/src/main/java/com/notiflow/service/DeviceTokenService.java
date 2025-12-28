package com.notiflow.service;

import com.google.api.core.ApiFuture;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.QueryDocumentSnapshot;
import com.google.cloud.firestore.QuerySnapshot;
import com.notiflow.model.DeviceToken;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ExecutionException;
import java.util.stream.Collectors;

@Service
public class DeviceTokenService {
    private final Firestore firestore;

    public DeviceTokenService(Firestore firestore) {
        this.firestore = firestore;
    }

    public void register(String email, String token, String platform, String schoolId) {
        try {
            if (email == null || email.isBlank() || token == null || token.isBlank()) {
                return;
            }
            String tenant = schoolId == null || schoolId.isBlank() ? "global" : schoolId;
            // eliminar duplicados del mismo token
            ApiFuture<QuerySnapshot> existing = firestore.collectionGroup("deviceTokens")
                    .whereEqualTo("token", token)
                    .get();
            for (QueryDocumentSnapshot doc : existing.get().getDocuments()) {
                doc.getReference().delete();
            }
            DeviceToken dt = new DeviceToken(
                    UUID.randomUUID().toString(),
                    email.toLowerCase(),
                    token,
                    platform != null ? platform : "unknown",
                    Instant.now(),
                    tenant
            );
            tenantDeviceTokens(tenant).document(dt.getId()).set(dt);
        } catch (InterruptedException | ExecutionException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("No se pudo registrar token de dispositivo", e);
        }
    }

    public void unregister(String token) {
        try {
            if (token == null || token.isBlank()) return;
            ApiFuture<QuerySnapshot> existing = firestore.collectionGroup("deviceTokens")
                    .whereEqualTo("token", token)
                    .get();
            for (QueryDocumentSnapshot doc : existing.get().getDocuments()) {
                doc.getReference().delete();
            }
        } catch (InterruptedException | ExecutionException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("No se pudo eliminar token", e);
        }
    }

    public List<String> tokensForRecipients(List<String> recipients, String schoolId) {
        try {
            if (recipients == null || recipients.isEmpty()) return List.of();
            var emails = recipients.stream().map(String::toLowerCase).collect(Collectors.toList());
            com.google.cloud.firestore.Query base = firestore.collectionGroup("deviceTokens")
                    .whereIn("email", emails);
            if (schoolId != null && !schoolId.isBlank()) {
                base = base.whereEqualTo("schoolId", schoolId);
            }
            ApiFuture<QuerySnapshot> snap = base.get();
            return snap.get().getDocuments().stream()
                    .map(d -> d.toObject(DeviceToken.class).getToken())
                    .filter(t -> t != null && !t.isBlank())
                    .distinct()
                    .toList();
        } catch (InterruptedException | ExecutionException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("No se pudieron obtener tokens", e);
        }
    }

    private com.google.cloud.firestore.CollectionReference tenantDeviceTokens(String tenantId) {
        String safe = tenantId == null || tenantId.isBlank() ? "global" : tenantId;
        return firestore.collection("tenants").document(safe).collection("deviceTokens");
    }
}
