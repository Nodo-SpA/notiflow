package com.notiflow.service;

import com.notiflow.dto.AuthResponse;
import com.notiflow.dto.LoginRequest;
import com.notiflow.dto.StudentOption;
import com.notiflow.dto.UserDto;
import com.notiflow.model.UserDocument;
import com.notiflow.model.UserRole;
import com.notiflow.service.AccessControlService;
import com.notiflow.service.SchoolService;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Map;
import java.util.Set;

@Service
public class AuthService {

    private final JwtService jwtService;
    private final UserService userService;
    private final PasswordEncoder passwordEncoder;
    private final String superAdminEmail;
    private final AccessControlService accessControlService;
    private final UsageService usageService;
    private final StudentService studentService;
    private final RefreshJwtService refreshJwtService;
    private final RefreshTokenStore refreshTokenStore;
    private final SchoolService schoolService;
    private static final Logger log = LoggerFactory.getLogger(AuthService.class);

    public AuthService(JwtService jwtService, RefreshJwtService refreshJwtService, RefreshTokenStore refreshTokenStore, UserService userService, PasswordEncoder passwordEncoder, AccessControlService accessControlService, UsageService usageService, StudentService studentService, SchoolService schoolService) {
        this.jwtService = jwtService;
        this.refreshJwtService = refreshJwtService;
        this.refreshTokenStore = refreshTokenStore;
        this.userService = userService;
        this.passwordEncoder = passwordEncoder;
        this.superAdminEmail = System.getenv().getOrDefault("SUPER_ADMIN_EMAIL", "").toLowerCase();
        this.accessControlService = accessControlService;
        this.usageService = usageService;
        this.studentService = studentService;
        this.schoolService = schoolService;
    }

    public AuthResponse login(LoginRequest request) {
        if (request.email() == null || request.email().isBlank() || request.password() == null || request.password().isBlank()) {
            throw new IllegalArgumentException("Credenciales inválidas");
        }

        String email = request.email().toLowerCase();
        UserDocument doc = userService.findByEmail(email)
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.UNAUTHORIZED, "Correo o contraseña inválidos"));

        if (doc.getPasswordHash() == null || !passwordEncoder.matches(request.password(), doc.getPasswordHash())) {
            throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.UNAUTHORIZED, "Correo o contraseña inválidos");
        }

        return buildAuthResponse(doc, java.util.List.of());
    }

    public AuthResponse loginWithoutPassword(String email) {
        return loginWithoutPassword(email, null, false);
    }

    public AuthResponse loginWithoutPassword(String email, String studentId) {
        return loginWithoutPassword(email, studentId, false);
    }

    public AuthResponse loginWithoutPassword(String email, String studentId, boolean studentsOnly) {
        if (email == null || email.isBlank()) {
            throw new IllegalArgumentException("Correo requerido");
        }
        String normalized = email.trim().toLowerCase();

        if (!studentsOnly) {
            java.util.Optional<UserDocument> userOpt = userService.findByEmail(normalized);
            if (userOpt.isPresent()) {
                UserDocument doc = userOpt.get();
                // Elevación de super admin para el correo definido
                if (!superAdminEmail.isBlank() && superAdminEmail.equalsIgnoreCase(doc.getEmail())) {
                    doc.setRole(UserRole.ADMIN);
                    doc.setSchoolId("global");
                    doc.setSchoolName("Global");
                    userService.upsert(doc);
                }
                return buildAuthResponse(doc, java.util.List.of());
            }
        }

        // Permitir login OTP para apoderados/estudiantes (correo de apoderado).
        java.util.List<com.notiflow.model.StudentDocument> students = java.util.Collections.emptyList();
        try {
            students = studentService.findAllByEmail(normalized);
        } catch (Exception ex) {
            log.warn("No se pudo consultar estudiantes para login OTP: {}", ex.getMessage());
        }
        if (!students.isEmpty()) {
            var chosen = students;
            if (studentId != null && !studentId.isBlank()) {
                chosen = students.stream().filter(s -> studentId.equals(s.getId())).toList();
                if (chosen.isEmpty()) {
                    chosen = students;
                }
            }
            var first = chosen.get(0);
            String schoolId = first.getSchoolId() == null ? "" : first.getSchoolId();
            String schoolName = resolveSchoolName(schoolId);
            var options = students.stream()
                    .map(s -> new StudentOption(
                            s.getId(),
                            buildStudentDisplayName(s),
                            s.getSchoolId(),
                            resolveSchoolName(s.getSchoolId()),
                            s.getCourse()
                    ))
                    .toList();
            UserDocument doc = new UserDocument();
            doc.setId(first.getId());
            doc.setName(buildGuardianDisplayName(first, normalized));
            doc.setEmail(normalized);
            doc.setRole(UserRole.STUDENT);
            doc.setSchoolId(schoolId);
            doc.setSchoolName(schoolName);
            return buildAuthResponse(doc, options);
        }

        throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.UNAUTHORIZED, "Correo no asociado a apoderados ni usuarios");
    }

    private String resolveSchoolName(String schoolId) {
        String fallback = "Colegio";
        if (schoolService == null || schoolId == null || schoolId.isBlank()) return fallback;
        try {
            var school = schoolService.getById(schoolId);
            if (school != null && school.getName() != null && !school.getName().isBlank()) {
                return school.getName();
            }
        } catch (Exception ex) {
            log.warn("No se pudo obtener nombre de colegio para {}: {}", schoolId, ex.getMessage());
        }
        return fallback;
    }

    private String buildGuardianDisplayName(com.notiflow.model.StudentDocument s, String email) {
        // Si el correo coincide con un apoderado específico, usar ese nombre
        if (s.getGuardians() != null && !s.getGuardians().isEmpty()) {
            var match = s.getGuardians().stream()
                    .filter(g -> g.getEmail() != null && g.getEmail().equalsIgnoreCase(email))
                    .findFirst();
            if (match.isPresent()) {
                String name = match.get().getName();
                if (name != null && !name.isBlank()) return name;
            }
            // si no hay match exacto, usar el primero con nombre
            var first = s.getGuardians().stream().filter(g -> g.getName() != null && !g.getName().isBlank()).findFirst();
            if (first.isPresent()) return first.get().getName();
        }
        // fallback a campos antiguos o nombre del estudiante
        String legacy = ((s.getGuardianFirstName() == null ? "" : s.getGuardianFirstName()) + " " +
                (s.getGuardianLastName() == null ? "" : s.getGuardianLastName())).trim();
        if (!legacy.isBlank()) return legacy;
        return (s.getFirstName() == null ? "" : s.getFirstName()) + " " + (s.getLastNameFather() == null ? "" : s.getLastNameFather());
    }

    private String buildStudentDisplayName(com.notiflow.model.StudentDocument s) {
        if (s == null) return "Alumno";
        String first = s.getFirstName() == null ? "" : s.getFirstName();
        String lastF = s.getLastNameFather() == null ? "" : s.getLastNameFather();
        String lastM = s.getLastNameMother() == null ? "" : s.getLastNameMother();
        String name = (first + " " + lastF + " " + lastM).trim().replaceAll(" +", " ");
        return name.isBlank() ? "Alumno" : name;
    }

    private AuthResponse buildAuthResponse(UserDocument doc, java.util.List<StudentOption> linkedStudents) {
        UserDto user = new UserDto(
                doc.getId(),
                doc.getName(),
                doc.getEmail(),
                doc.getRole(),
                doc.getSchoolId(),
                doc.getSchoolName(),
                doc.getRut()
        );

        Map<String, Object> claims = new java.util.HashMap<>();
        claims.put("role", user.role().name());
        claims.put("name", user.name());
        claims.put("schoolId", user.schoolId());
        claims.put("schoolName", user.schoolName());
        if (user.rut() != null) {
            claims.put("rut", user.rut());
        }
        // Opcional: incluir permisos en el token (útil para UI)
        try {
            Set<String> perms = accessControlService != null ? accessControlService.getPermissions(user.role().name()) : Set.of();
            claims.put("permissions", perms);
        } catch (Exception ignored) {}
        if (linkedStudents != null && !linkedStudents.isEmpty()) {
            claims.put("studentIds", linkedStudents.stream().map(StudentOption::studentId).toList());
            claims.put("schools", linkedStudents.stream().map(StudentOption::schoolId).toList());
        }

        String token = jwtService.generateToken(claims, user.email());
        String refresh = refreshJwtService.generateToken(claims, user.email());
        try {
            String jti = (String) claims.get("jti");
            java.time.Instant exp = java.time.Instant.now().plusSeconds(refreshJwtService.getExpirationSeconds());
            refreshTokenStore.save(jti, user.email(), exp);
        } catch (Exception ignored) {}
        return new AuthResponse(token, refresh, user, linkedStudents == null ? java.util.List.of() : linkedStudents);
    }
}
