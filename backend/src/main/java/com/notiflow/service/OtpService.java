package com.notiflow.service;

import com.google.api.core.ApiFuture;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.QueryDocumentSnapshot;
import com.google.cloud.firestore.QuerySnapshot;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.Collections;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutionException;
import java.util.stream.Collectors;

@Service
public class OtpService {

    private final Firestore firestore;
    private final EmailService emailService;
    private final Set<String> reviewerEmails;
    private final String reviewerCode;
    private final SecureRandom random = new SecureRandom();
    private static final int TTL_MINUTES = 10;

    public OtpService(
            Firestore firestore,
            EmailService emailService,
            @Value("${app.otp.reviewer-emails:${OTP_REVIEWER_EMAILS:}}") String reviewerEmails,
            @Value("${app.otp.reviewer-code:${OTP_REVIEWER_CODE:000000}}") String reviewerCode
    ) {
        this.firestore = firestore;
        this.emailService = emailService;
        this.reviewerEmails = parseReviewerEmails(reviewerEmails);
        this.reviewerCode = normalizeReviewerCode(reviewerCode);
    }

    public String requestCode(String email) {
        String normalized = email == null ? "" : email.trim().toLowerCase();
        boolean reviewer = isReviewer(normalized);
        String code = reviewer ? reviewerCode : String.format("%06d", random.nextInt(1_000_000));
        Instant expires = Instant.now().plusSeconds(TTL_MINUTES * 60L);
        try {
            DocumentReference ref = firestore.collection("loginCodes").document(normalized);
            java.util.Map<String, Object> data = new java.util.HashMap<>();
            data.put("email", normalized);
            data.put("code", code);
            data.put("expiresAt", expires.toString());
            data.put("attempts", 0);
            ref.set(data).get();
        } catch (InterruptedException | ExecutionException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("No se pudo generar código", e);
        }
        if (!reviewer) {
            // Enviar correo con el código
            emailService.sendMessageEmail(
                    normalized,
                    "Tu código de acceso a Notiflow",
                    """
                    <div style="font-family: Arial, sans-serif; padding:20px; background:#fff6ef;">
                      <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;border:1px solid #fde2d2;overflow:hidden;">
                        <div style="padding:18px 22px;background:linear-gradient(135deg,#ff6b00,#ff8a3d);color:#fff;">
                          <div style="font-size:18px;font-weight:800;letter-spacing:0.4px;">Notiflow</div>
                          <div style="font-size:12px;opacity:0.9;">Acceso seguro</div>
                        </div>
                        <div style="padding:22px;">
                          <h2 style="margin:0 0 8px 0;color:#1f2937;">Código de acceso</h2>
                          <p style="margin:0 0 14px 0;color:#374151;">Usa este código para ingresar a la app:</p>
                          <div style="font-size:30px;font-weight:800;letter-spacing:6px;color:#ff6b00;text-align:center;padding:12px 0;border:1px dashed #ffd2b6;border-radius:12px;background:#fff7f0;">%s</div>
                          <p style="margin:14px 0 0 0;color:#6b7280;font-size:12px;">Caduca en %d minutos.</p>
                        </div>
                      </div>
                    </div>
                    """.formatted(code, TTL_MINUTES),
                    "Tu código de acceso es: " + code,
                    null
            );
        }
        return reviewer ? code : null;
    }

    public boolean verifyCode(String email, String code) {
        String normalized = email == null ? "" : email.trim().toLowerCase();
        String normalizedCode = code == null ? "" : code.trim();
        if (isReviewer(normalized) && reviewerCode.equals(normalizedCode)) {
            return true;
        }
        try {
            ApiFuture<QuerySnapshot> query = firestore.collection("loginCodes")
                    .whereEqualTo("email", normalized)
                    .limit(1)
                    .get();
            List<QueryDocumentSnapshot> docs = query.get().getDocuments();
            if (docs.isEmpty()) return false;
            var doc = docs.get(0);
            String stored = doc.getString("code");
            String expires = doc.getString("expiresAt");
            Long attempts = doc.getLong("attempts");
            if (attempts != null && attempts > 5) return false;
            if (expires != null && Instant.parse(expires).isBefore(Instant.now())) {
                firestore.collection("loginCodes").document(doc.getId()).delete();
                return false;
            }
            if (stored != null && stored.equals(normalizedCode)) {
                firestore.collection("loginCodes").document(doc.getId()).delete();
                return true;
            } else {
                firestore.collection("loginCodes").document(doc.getId()).update("attempts", (attempts == null ? 0 : attempts) + 1);
                return false;
            }
        } catch (InterruptedException | ExecutionException e) {
            Thread.currentThread().interrupt();
            return false;
        }
    }

    private boolean isReviewer(String email) {
        return !reviewerEmails.isEmpty() && reviewerEmails.contains(email);
    }

    public boolean isReviewerEmail(String email) {
        String normalized = email == null ? "" : email.trim().toLowerCase();
        return isReviewer(normalized);
    }

    private static Set<String> parseReviewerEmails(String raw) {
        if (raw == null || raw.isBlank()) {
            return Collections.emptySet();
        }
        return java.util.Arrays.stream(raw.split("[,;\\s]+"))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .map(String::toLowerCase)
                .collect(Collectors.toSet());
    }

    private static String normalizeReviewerCode(String raw) {
        if (raw == null) return "000000";
        String trimmed = raw.trim();
        if (trimmed.matches("\\d{6}")) {
            return trimmed;
        }
        if (trimmed.matches("\\d{4,5}")) {
            int value = Integer.parseInt(trimmed);
            return String.format("%06d", value);
        }
        return "000000";
    }
}
