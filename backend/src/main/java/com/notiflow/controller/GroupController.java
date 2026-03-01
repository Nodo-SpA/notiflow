package com.notiflow.controller;

import com.notiflow.dto.GroupRequest;
import com.notiflow.dto.GroupDto;
import com.notiflow.dto.GroupListResponse;
import com.notiflow.service.GroupService;
import com.notiflow.service.AccessControlService;
import com.notiflow.util.CurrentUser;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Optional;

@RestController
@RequestMapping("/groups")
public class GroupController {

    private final GroupService groupService;
    private final AccessControlService accessControlService;

    public GroupController(GroupService groupService, AccessControlService accessControlService) {
        this.groupService = groupService;
        this.accessControlService = accessControlService;
    }

    @GetMapping
    public ResponseEntity<GroupListResponse> list(
            @RequestParam(value = "schoolId", required = false) String schoolIdParam,
            @RequestParam(value = "year", required = false) String year,
            @RequestParam(value = "q", required = false) String query,
            @RequestParam(value = "page", defaultValue = "1") int page,
            @RequestParam(value = "pageSize", defaultValue = "50") int pageSize
    ) {
        CurrentUser user = CurrentUser.fromContext()
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(HttpStatus.UNAUTHORIZED));
        String requestedSchool = (schoolIdParam == null || schoolIdParam.isBlank()) ? user.schoolId() : schoolIdParam;

        // Si es superadmin (schoolId=global) y no se especifica colegio, listamos todo
        if ("global".equalsIgnoreCase(user.schoolId()) && (schoolIdParam == null || schoolIdParam.isBlank())) {
            accessControlService.check(user, "groups.list", "global", Optional.empty());
            return ResponseEntity.ok(groupService.listAll(year, query, page, pageSize));
        }

        accessControlService.check(user, "groups.list", requestedSchool, Optional.empty());
        return ResponseEntity.ok(groupService.listBySchool(requestedSchool, year, query, page, pageSize));
    }

    @PostMapping
    public ResponseEntity<GroupDto> create(@Valid @RequestBody GroupRequest request) {
        CurrentUser user = CurrentUser.fromContext()
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(HttpStatus.UNAUTHORIZED));
        accessControlService.check(user, "groups.create", request.schoolId() != null ? request.schoolId() : user.schoolId(), Optional.empty());
        String schoolId = user.schoolId();
        if ("global".equalsIgnoreCase(schoolId) && request.schoolId() != null && !request.schoolId().isBlank()) {
            schoolId = request.schoolId();
        }
        if (!"global".equalsIgnoreCase(user.schoolId()) && request.schoolId() != null && !request.schoolId().isBlank()
                && !user.schoolId().equalsIgnoreCase(request.schoolId())) {
            throw new org.springframework.web.server.ResponseStatusException(HttpStatus.FORBIDDEN, "No puedes crear grupos en otro colegio");
        }
        return ResponseEntity.ok(groupService.create(request, schoolId));
    }

    @PutMapping("/{id}")
    public ResponseEntity<GroupDto> update(@PathVariable String id, @Valid @RequestBody GroupRequest request) {
        CurrentUser user = CurrentUser.fromContext()
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(HttpStatus.UNAUTHORIZED));
        accessControlService.check(user, "groups.update", request.schoolId() != null ? request.schoolId() : user.schoolId(), Optional.empty());
        String schoolId = user.schoolId();
        if ("global".equalsIgnoreCase(schoolId) && request.schoolId() != null && !request.schoolId().isBlank()) {
            schoolId = request.schoolId();
        }
        if (!"global".equalsIgnoreCase(user.schoolId()) && request.schoolId() != null && !request.schoolId().isBlank()
                && !user.schoolId().equalsIgnoreCase(request.schoolId())) {
            throw new org.springframework.web.server.ResponseStatusException(HttpStatus.FORBIDDEN, "No puedes editar grupos de otro colegio");
        }
        return ResponseEntity.ok(groupService.update(id, request, schoolId, "global".equalsIgnoreCase(user.schoolId())));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        CurrentUser user = CurrentUser.fromContext()
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(HttpStatus.UNAUTHORIZED));
        accessControlService.check(user, "groups.delete", user.schoolId(), Optional.empty());
        groupService.delete(id, user.schoolId(), "global".equalsIgnoreCase(user.schoolId()));
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/rebuild-courses")
    public ResponseEntity<?> rebuildCourses(
            @RequestParam(value = "schoolId", required = false) String schoolId,
            @RequestParam(value = "year", required = false) String year
    ) {
        CurrentUser user = CurrentUser.fromContext()
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(HttpStatus.UNAUTHORIZED));
        String role = user.role() != null ? user.role().toUpperCase() : "";
        if (!"SUPERADMIN".equals(role) && !"ADMIN".equals(role)) {
            throw new org.springframework.web.server.ResponseStatusException(HttpStatus.FORBIDDEN, "No tienes permisos para recrear grupos");
        }
        String targetSchool = (schoolId == null || schoolId.isBlank()) ? user.schoolId() : schoolId;
        if (targetSchool == null || targetSchool.isBlank()) {
            throw new org.springframework.web.server.ResponseStatusException(HttpStatus.BAD_REQUEST, "Debes indicar schoolId");
        }
        if (!"SUPERADMIN".equals(role) && user.schoolId() != null && !user.schoolId().equalsIgnoreCase(targetSchool)) {
            throw new org.springframework.web.server.ResponseStatusException(HttpStatus.FORBIDDEN, "No puedes recrear grupos de otro colegio");
        }
        int updated = groupService.rebuildCourseGroups(targetSchool, year);
        return ResponseEntity.ok(java.util.Map.of("updated", updated));
    }
}
