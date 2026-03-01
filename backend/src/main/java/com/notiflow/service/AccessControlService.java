package com.notiflow.service;

import com.google.api.core.ApiFuture;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.Firestore;
import com.notiflow.util.CurrentUser;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ExecutionException;
import java.util.stream.Collectors;

@Service
public class AccessControlService {

    private static final Logger log = LoggerFactory.getLogger(AccessControlService.class);
    private final Firestore firestore;
    private final Map<String, CachedPermissions> cache = new HashMap<>();
    private static final long CACHE_TTL_SECONDS = 300; // 5 minutos

    public AccessControlService(Firestore firestore) {
        this.firestore = firestore;
    }

    public void check(CurrentUser user, String permission, String resourceSchoolId, Optional<String> ownerId) {
        if (user == null) {
            throw forbidden("Sin usuario en contexto");
        }
        // Superadmin (schoolId global) tiene paso libre
        if ("global".equalsIgnoreCase(user.schoolId())) {
            return;
        }
        Set<String> perms = getPermissions(user.role());
        if (perms.contains("*")) {
            return;
        }

        // Scope por colegio
        if (resourceSchoolId != null && !resourceSchoolId.isBlank()) {
            if (!"global".equalsIgnoreCase(user.schoolId()) && !resourceSchoolId.equalsIgnoreCase(user.schoolId())) {
                throw forbidden("No puedes operar sobre otro colegio");
            }
        }

        // Coincidencia directa
        if (perms.contains(permission.toLowerCase())) {
            return;
        }
        // Coincidencia self (ej: messages.list con permiso messages.list.self)
        String selfPerm = permission.toLowerCase() + ".self";
        if (perms.contains(selfPerm)) {
            if (ownerId.isPresent() && ownerId.get().equalsIgnoreCase(user.email())) {
                return;
            } else {
                throw forbidden("Acceso solo a recursos propios");
            }
        }

        throw forbidden("No tienes el permiso requerido: " + permission);
    }

    public Set<String> getPermissions(String role) {
        if (role == null) return Collections.emptySet();
        String key = role.toUpperCase();
        CachedPermissions cached = cache.get(key);
        if (cached != null && cached.expiresAt().isAfter(Instant.now())) {
            return cached.permissions();
        }
        try {
            List<String> candidates = permissionRoleCandidates(key);
            for (String candidate : candidates) {
                DocumentReference ref = firestore.collection("rolePermissions").document(candidate);
                ApiFuture<DocumentSnapshot> future = ref.get();
                DocumentSnapshot snap = future.get();
                if (!snap.exists()) {
                    continue;
                }
                @SuppressWarnings("unchecked")
                List<String> raw = (List<String>) snap.get("permissions");
                Set<String> perms = raw == null
                        ? Collections.emptySet()
                        : raw.stream().map(String::toLowerCase).collect(Collectors.toSet());
                CachedPermissions fresh = new CachedPermissions(perms, Instant.now().plusSeconds(CACHE_TTL_SECONDS));
                cache.put(key, fresh);
                if (!candidate.equals(key)) {
                    log.info("Permisos para rol {} resueltos usando alias {}", key, candidate);
                }
                return fresh.permissions();
            }
            log.warn("No hay permisos definidos para el rol {} (candidatos: {})", key, candidates);
            cache.put(key, new CachedPermissions(Collections.emptySet(), Instant.now().plusSeconds(CACHE_TTL_SECONDS)));
            return Collections.emptySet();
        } catch (InterruptedException | ExecutionException e) {
            Thread.currentThread().interrupt();
            log.error("Error cargando permisos para rol {}", key, e);
            return Collections.emptySet();
        }
    }

    private List<String> permissionRoleCandidates(String roleKey) {
        List<String> candidates = new java.util.ArrayList<>();
        candidates.add(roleKey);
        if ("DIRECTOR".equals(roleKey) || "GESTION_ESCOLAR".equals(roleKey)) {
            candidates.add("COORDINATOR");
        } else if ("COORDINATOR".equals(roleKey)) {
            candidates.add("DIRECTOR");
        }
        return candidates;
    }

    private org.springframework.web.server.ResponseStatusException forbidden(String reason) {
        return new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.FORBIDDEN, reason);
    }

    private record CachedPermissions(Set<String> permissions, Instant expiresAt) {}
}
