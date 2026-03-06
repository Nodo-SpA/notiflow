package com.notiflow.controller;

import com.notiflow.dto.AuthResponse;
import com.notiflow.dto.ForgotPasswordRequest;
import com.notiflow.dto.LoginRequest;
import com.notiflow.dto.ResetPasswordRequest;
import com.notiflow.dto.UserDto;
import com.notiflow.model.UserRole;
import com.notiflow.dto.OtpRequest;
import com.notiflow.dto.OtpVerifyRequest;
import com.notiflow.dto.RefreshRequest;
import com.notiflow.service.OtpService;
import com.notiflow.service.UserService;
import com.notiflow.service.StudentService;
import com.notiflow.service.UsageService;
import com.notiflow.service.AuthService;
import com.notiflow.service.JwtService;
import com.notiflow.service.RefreshJwtService;
import com.notiflow.service.RefreshTokenStore;
import com.notiflow.service.PasswordResetService;
import com.notiflow.service.MultiStudentMatchException;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/auth")
public class AuthController {

    private final AuthService authService;
    private final JwtService jwtService;
    private final RefreshJwtService refreshJwtService;
    private final RefreshTokenStore refreshTokenStore;
    private final PasswordResetService passwordResetService;
    private final OtpService otpService;
    private final StudentService studentService;
    private final UserService userService;
    private final UsageService usageService;

    public AuthController(AuthService authService, JwtService jwtService, RefreshJwtService refreshJwtService, RefreshTokenStore refreshTokenStore, PasswordResetService passwordResetService, OtpService otpService, StudentService studentService, UserService userService, UsageService usageService) {
        this.authService = authService;
        this.jwtService = jwtService;
        this.refreshJwtService = refreshJwtService;
        this.refreshTokenStore = refreshTokenStore;
        this.passwordResetService = passwordResetService;
        this.otpService = otpService;
        this.studentService = studentService;
        this.userService = userService;
        this.usageService = usageService;
    }

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request) {
        return ResponseEntity.ok(authService.login(request));
    }

    @PostMapping("/refresh")
    public ResponseEntity<AuthResponse> refresh(@RequestBody RefreshRequest request) {
        if (request == null || request.refreshToken() == null || request.refreshToken().isBlank()) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(null);
        }
        try {
            Claims claims = refreshJwtService.parseClaims(request.refreshToken());
            String jti = claims.get("jti", String.class);
            if (jti == null || !refreshTokenStore.isValid(jti)) {
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(null);
            }
            UserDto user = new UserDto(
                    claims.getSubject(),
                    claims.get("name", String.class),
                    claims.getSubject(),
                    UserRole.valueOf(claims.get("role", String.class)),
                    claims.get("schoolId", String.class),
                    claims.get("schoolName", String.class),
                    claims.get("rut", String.class)
            );
            Map<String, Object> map = new HashMap<>(claims);
            String access = jwtService.generateToken(map, user.email());
            String refresh = refreshJwtService.generateToken(map, user.email());
            try { refreshTokenStore.revoke(jti); } catch (Exception ignored) {}
            try {
                String newJti = (String) map.get("jti");
                java.time.Instant exp = java.time.Instant.now().plusSeconds(refreshJwtService.getExpirationSeconds());
                refreshTokenStore.save(newJti, user.email(), exp);
            } catch (Exception ignored) {}
            return ResponseEntity.ok(new AuthResponse(access, refresh, user, java.util.List.of()));
        } catch (Exception ex) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(null);
        }
    }

    @PostMapping("/logout")
    public ResponseEntity<?> logout(@RequestBody(required = false) RefreshRequest request) {
        try {
            String refreshToken = request != null ? request.refreshToken() : null;
            if (refreshToken != null && !refreshToken.isBlank()) {
                Claims claims = refreshJwtService.parseClaims(refreshToken);
                String jti = claims.get("jti", String.class);
                if (jti != null && !jti.isBlank()) {
                    refreshTokenStore.revoke(jti);
                }
            }
        } catch (Exception ignored) {
            // Logout idempotente: aunque el token sea inválido o ya esté vencido, respondemos OK.
        }
        return ResponseEntity.ok(Map.of("message", "Sesión cerrada"));
    }

    @GetMapping("/me")
    public ResponseEntity<UserDto> me(@RequestHeader(HttpHeaders.AUTHORIZATION) Optional<String> authHeader) {
        if (authHeader.isEmpty() || !authHeader.get().startsWith("Bearer ")) {
            return ResponseEntity.status(401).build();
        }
        try {
            String token = authHeader.get().substring(7);
            Claims claims = jwtService.parseClaims(token);

            UserDto user = new UserDto(
                    claims.getSubject(), // usamos el email como ID base
                    claims.get("name", String.class),
                    claims.getSubject(),
                    UserRole.valueOf(claims.get("role", String.class)),
                    claims.get("schoolId", String.class),
                    claims.get("schoolName", String.class),
                    claims.get("rut", String.class)
            );

            return ResponseEntity.ok(user);
        } catch (JwtException ex) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(null);
        }
    }

    @PostMapping("/forgot")
    public ResponseEntity<?> forgot(@Valid @RequestBody ForgotPasswordRequest request) {
        try {
            var result = passwordResetService.createResetToken(request.email());
            Map<String, Object> body = new HashMap<>();
            body.put("message", result.emailed()
                    ? "Revisa tu correo con el enlace de recuperación"
                    : "Token generado (correo no configurado)");
            body.put("expiresMinutes", passwordResetService.getExpirationMinutes());
            if (!result.emailed()) {
                body.put("token", result.token());
            }
            return ResponseEntity.ok().body(body);
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(java.util.Map.of("message", ex.getMessage()));
        }
    }

    @PostMapping("/reset")
    public ResponseEntity<?> reset(@Valid @RequestBody ResetPasswordRequest request) {
        try {
            passwordResetService.resetPassword(request.token(), request.newPassword());
            return ResponseEntity.ok().body(java.util.Map.of("message", "Contraseña actualizada"));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(java.util.Map.of("message", ex.getMessage()));
        }
    }

    @PostMapping("/otp/request")
    public ResponseEntity<?> requestOtp(@Valid @RequestBody OtpRequest request) {
        String email = request.email() == null ? "" : request.email().trim().toLowerCase();
        boolean reviewer = otpService.isReviewerEmail(email);
        boolean studentsOnly = Boolean.TRUE.equals(request.studentsOnly());
        if (!reviewer) {
            try {
                if (studentsOnly) {
                    if (studentService == null || studentService.findAllByEmail(email).isEmpty()) {
                        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                                .body(Map.of("message", "Tu correo no está registrado. Contacta al administrador para que te incorpore."));
                    }
                } else if (userService == null || userService.findByEmail(email).isEmpty()) {
                    return ResponseEntity.status(HttpStatus.NOT_FOUND)
                            .body(Map.of("message", "Tu correo no está registrado en la plataforma."));
                }
            } catch (Exception ex) {
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("message", "No se pudo validar tu correo. Intenta nuevamente."));
            }
        }
        String reviewerCode = otpService.requestCode(email);
        java.util.Map<String, Object> body = new java.util.HashMap<>();
        body.put("message", "Código enviado si el correo existe");
        if (reviewerCode != null) {
            body.put("reviewer", true);
            body.put("reviewerCode", reviewerCode);
        }
        return ResponseEntity.ok(body);
    }

    @PostMapping("/otp/verify")
    public ResponseEntity<?> verifyOtp(@Valid @RequestBody OtpVerifyRequest request) {
        boolean ok = otpService.verifyCode(request.email(), request.code());
        if (!ok) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("message", "Código incorrecto o expirado. Solicita uno nuevo."));
        }
        // OTP válido, devolvemos un token como login con password
        try {
            AuthResponse resp = authService.loginWithoutPassword(
                    request.email(),
                    request.studentId(),
                    Boolean.TRUE.equals(request.studentsOnly())
            );
            // Solo contar login de app aquí
            try { usageService.recordAppLogin(request.email()); } catch (Exception ignored) {}
            return ResponseEntity.ok(resp);
        } catch (MultiStudentMatchException ex) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(
                    java.util.Map.of(
                            "message", ex.getMessage(),
                            "options", ex.getOptions()
                    )
            );
        } catch (Exception ex) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("message", ex.getMessage() != null ? ex.getMessage() : "No se pudo validar el código"));
        }
    }
}
