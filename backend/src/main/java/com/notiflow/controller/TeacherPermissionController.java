package com.notiflow.controller;

import com.notiflow.dto.TeacherPermissionDto;
import com.notiflow.service.AccessControlService;
import com.notiflow.service.TeacherPermissionService;
import com.notiflow.util.CurrentUser;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Optional;

@RestController
@RequestMapping("/teacher-permissions")
public class TeacherPermissionController {

    private final TeacherPermissionService teacherPermissionService;
    private final AccessControlService accessControlService;

    public TeacherPermissionController(TeacherPermissionService teacherPermissionService, AccessControlService accessControlService) {
        this.teacherPermissionService = teacherPermissionService;
        this.accessControlService = accessControlService;
    }

    @GetMapping
    public ResponseEntity<List<TeacherPermissionDto>> list() {
        CurrentUser user = CurrentUser.fromContext()
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(HttpStatus.UNAUTHORIZED));
        // Solo admin/superadmin/coordinador con permiso de users.manage (o similar)
        accessControlService.check(user, "users.create", user.schoolId(), Optional.empty());
        String schoolId = user.schoolId();
        return ResponseEntity.ok(teacherPermissionService.list(schoolId));
    }

    @PutMapping("/{email}")
    public ResponseEntity<Void> update(
            @PathVariable String email,
            @RequestBody TeacherPermissionDto body
    ) {
        CurrentUser user = CurrentUser.fromContext()
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(HttpStatus.UNAUTHORIZED));
        accessControlService.check(user, "users.create", user.schoolId(), Optional.empty());
        String schoolId = user.schoolId();
        teacherPermissionService.setAllowedGroups(schoolId, email, body.allowedGroupIds());
        return ResponseEntity.noContent().build();
    }
}
