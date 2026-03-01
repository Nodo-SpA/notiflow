package com.notiflow.controller;

import com.notiflow.dto.StudentDto;
import com.notiflow.dto.StudentListResponse;
import com.notiflow.dto.StudentRequest;
import com.notiflow.service.AccessControlService;
import com.notiflow.service.StudentService;
import com.notiflow.util.CurrentUser;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;
import java.util.Optional;

@RestController
@RequestMapping("/students")
public class StudentController {

    private final StudentService studentService;
    private final AccessControlService accessControlService;

    public StudentController(StudentService studentService, AccessControlService accessControlService) {
        this.studentService = studentService;
        this.accessControlService = accessControlService;
    }

    @GetMapping
    public ResponseEntity<StudentListResponse> list(
            @RequestParam(value = "schoolId", required = false) String schoolId,
            @RequestParam(value = "year", required = false) String year,
            @RequestParam(value = "q", required = false) String query,
            @RequestParam(value = "page", defaultValue = "1") int page,
            @RequestParam(value = "pageSize", defaultValue = "50") int pageSize
    ) {
        CurrentUser user = CurrentUser.fromContext()
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(HttpStatus.UNAUTHORIZED));
        String targetSchool = (schoolId == null || schoolId.isBlank()) ? user.schoolId() : schoolId;

        // Superadmin (schoolId=global) puede ver todos los colegios si no se especifica schoolId
        if ("global".equalsIgnoreCase(user.schoolId()) && (targetSchool == null || targetSchool.isBlank() || "global".equalsIgnoreCase(targetSchool))) {
            accessControlService.check(user, "students.list", "global", Optional.empty());
            StudentListResponse data = studentService.listAll(year, query, page, pageSize);
            return ResponseEntity.ok(data);
        }

        // Permiso: preferimos students.list, y si no existe, usamos students.create como fallback
        try {
            accessControlService.check(user, "students.list", targetSchool, Optional.empty());
        } catch (org.springframework.web.server.ResponseStatusException ex) {
            accessControlService.check(user, "students.create", targetSchool, Optional.empty());
        }

        StudentListResponse data = studentService.list(targetSchool, year, query, page, pageSize);
        return ResponseEntity.ok(data);
    }

    @PostMapping
    public ResponseEntity<StudentDto> create(@Valid @RequestBody StudentRequest request) {
        CurrentUser user = CurrentUser.fromContext()
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(HttpStatus.UNAUTHORIZED));
        String requesterSchool = user.schoolId();
        String targetSchool = request.schoolId();

        if (!"global".equalsIgnoreCase(requesterSchool)) {
            targetSchool = requesterSchool;
            if (request.schoolId() != null && !request.schoolId().isBlank() && !request.schoolId().equalsIgnoreCase(requesterSchool)) {
                throw new org.springframework.web.server.ResponseStatusException(HttpStatus.FORBIDDEN, "No puedes crear estudiantes en otro colegio");
            }
        } else {
            if (targetSchool == null || targetSchool.isBlank()) {
                throw new org.springframework.web.server.ResponseStatusException(HttpStatus.BAD_REQUEST, "Debes indicar schoolId");
            }
        }

        accessControlService.check(user, "students.create", targetSchool, Optional.empty());
        StudentDto saved = studentService.create(request, targetSchool);
        return ResponseEntity.status(HttpStatus.CREATED).body(saved);
    }

    @PutMapping("/{id}")
    public ResponseEntity<StudentDto> update(
            @PathVariable String id,
            @Valid @RequestBody StudentRequest request
    ) {
        CurrentUser user = CurrentUser.fromContext()
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(HttpStatus.UNAUTHORIZED));
        String requesterSchool = user.schoolId();
        if ("global".equalsIgnoreCase(requesterSchool)) {
            accessControlService.check(user, "students.update", "global", Optional.empty());
        } else {
            accessControlService.check(user, "students.update", requesterSchool, Optional.empty());
        }
        StudentDto saved = studentService.update(id, request, requesterSchool, "global".equalsIgnoreCase(requesterSchool));
        return ResponseEntity.ok(saved);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        CurrentUser user = CurrentUser.fromContext()
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(HttpStatus.UNAUTHORIZED));
        String role = user.role() != null ? user.role().toUpperCase() : "";
        if (!"SUPERADMIN".equals(role) && !"ADMIN".equals(role)) {
            throw new org.springframework.web.server.ResponseStatusException(HttpStatus.FORBIDDEN, "No tienes permisos para eliminar estudiantes");
        }
        StudentDto student = studentService.getById(id)
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(HttpStatus.NOT_FOUND, "Estudiante no encontrado"));
        String targetSchool = student.schoolId() == null || student.schoolId().isBlank() ? "global" : student.schoolId();
        if (!"SUPERADMIN".equals(role) && user.schoolId() != null && !user.schoolId().equalsIgnoreCase(targetSchool)) {
            throw new org.springframework.web.server.ResponseStatusException(HttpStatus.FORBIDDEN, "No puedes eliminar estudiantes de otro colegio");
        }
        studentService.delete(id, user.schoolId(), "SUPERADMIN".equals(role));
        return ResponseEntity.noContent().build();
    }
}
