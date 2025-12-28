package com.notiflow.controller;

import com.notiflow.dto.TemplateDto;
import com.notiflow.dto.TemplateRequest;
import com.notiflow.service.TemplateService;
import com.notiflow.service.AccessControlService;
import com.notiflow.util.CurrentUser;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/templates")
public class TemplateController {

    private final TemplateService templateService;
    private final AccessControlService accessControlService;

    public TemplateController(TemplateService templateService, AccessControlService accessControlService) {
        this.templateService = templateService;
        this.accessControlService = accessControlService;
    }

    @GetMapping
    public ResponseEntity<List<TemplateDto>> list() {
        CurrentUser user = CurrentUser.fromContext()
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(HttpStatus.UNAUTHORIZED));
        accessControlService.check(user, "messages.create", user.schoolId(), java.util.Optional.empty());
        return ResponseEntity.ok(templateService.listByOwner(user.email(), user.schoolId()));
    }

    @PostMapping
    public ResponseEntity<TemplateDto> create(@Valid @RequestBody TemplateRequest request) {
        CurrentUser user = CurrentUser.fromContext()
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(HttpStatus.UNAUTHORIZED));
        accessControlService.check(user, "messages.create", user.schoolId(), java.util.Optional.empty());
        return ResponseEntity.ok(templateService.create(request, user.email(), user.schoolId()));
    }

    @PutMapping("/{id}")
    public ResponseEntity<TemplateDto> update(@PathVariable String id, @Valid @RequestBody TemplateRequest request) {
        CurrentUser user = CurrentUser.fromContext()
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(HttpStatus.UNAUTHORIZED));
        accessControlService.check(user, "messages.create", user.schoolId(), java.util.Optional.empty());
        return ResponseEntity.ok(templateService.update(id, request, user.email(), user.schoolId()));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        CurrentUser user = CurrentUser.fromContext()
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(HttpStatus.UNAUTHORIZED));
        accessControlService.check(user, "messages.create", user.schoolId(), java.util.Optional.empty());
        templateService.delete(id, user.email(), user.schoolId());
        return ResponseEntity.noContent().build();
    }
}
