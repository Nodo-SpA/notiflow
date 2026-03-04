package com.notiflow.service;

import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.Firestore;
import com.notiflow.model.PasswordResetDocument;
import com.notiflow.model.UserDocument;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ExecutionException;

@Service
public class PasswordResetService {

    private final Firestore firestore;
    private final UserService userService;
    private final PasswordEncoder passwordEncoder;
    private final EmailService emailService;
    private final long expirationMinutes;

    public PasswordResetService(
            Firestore firestore,
            UserService userService,
            PasswordEncoder passwordEncoder,
            EmailService emailService,
            @Value("${app.password-reset.expires-minutes:1440}") long expirationMinutes
    ) {
        this.firestore = firestore;
        this.userService = userService;
        this.passwordEncoder = passwordEncoder;
        this.emailService = emailService;
        this.expirationMinutes = expirationMinutes;
    }

    public PasswordResetResult createResetToken(String email) {
        return createResetToken(email, true);
    }

    public PasswordResetResult createResetToken(String email, boolean sendEmail) {
        Optional<UserDocument> userOpt = userService.findByEmail(email.toLowerCase());
        if (userOpt.isEmpty()) {
            throw new IllegalArgumentException("Usuario no encontrado");
        }
        PasswordResetDocument doc = new PasswordResetDocument();
        doc.setToken(UUID.randomUUID().toString());
        doc.setEmail(email.toLowerCase());
        doc.setExpiresAt(Instant.now().plus(expirationMinutes, ChronoUnit.MINUTES));
        doc.setUsed(false);

        try {
            firestore.collection("passwordResets").document(doc.getToken()).set(doc).get();
            boolean emailed = false;
            if (sendEmail) {
                emailed = emailService.sendPasswordResetEmail(doc.getEmail(), doc.getToken(), doc.getExpiresAt());
            }
            return new PasswordResetResult(doc.getToken(), doc.getExpiresAt(), emailed);
        } catch (InterruptedException | ExecutionException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("No se pudo generar token de reseteo", e);
        }
    }

    public void resetPassword(String token, String newPassword) {
        try {
            DocumentReference ref = firestore.collection("passwordResets").document(token);
            DocumentSnapshot snap = ref.get().get();
            if (!snap.exists()) {
                throw new IllegalArgumentException("Token inválido");
            }
            PasswordResetDocument doc = snap.toObject(PasswordResetDocument.class);
            if (doc == null) {
                throw new IllegalArgumentException("Token inválido");
            }
            if (doc.isUsed() || doc.getExpiresAt() == null || doc.getExpiresAt().isBefore(Instant.now())) {
                throw new IllegalArgumentException("Token expirado o usado");
            }

            UserDocument user = userService.findByEmail(doc.getEmail())
                    .orElseThrow(() -> new IllegalArgumentException("Usuario no encontrado"));
            user.setPasswordHash(passwordEncoder.encode(newPassword));
            userService.upsert(user);

            doc.setUsed(true);
            ref.set(doc).get();
        } catch (InterruptedException | ExecutionException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("No se pudo resetear la contraseña", e);
        }
    }

    public long getExpirationMinutes() {
        return expirationMinutes;
    }

    public record PasswordResetResult(String token, Instant expiresAt, boolean emailed) {}
}
