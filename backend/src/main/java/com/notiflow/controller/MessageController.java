package com.notiflow.controller;

import com.notiflow.dto.MessageDto;
import com.notiflow.dto.MessageListResponse;
import com.notiflow.dto.MessageRequest;
import com.notiflow.service.AccessControlService;
import com.notiflow.service.MessageService;
import com.notiflow.util.CurrentUser;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.security.Principal;
import java.util.Optional;

@RestController
@RequestMapping("/messages")
public class MessageController {

    private final MessageService messageService;
    private final AccessControlService accessControlService;

    public MessageController(MessageService messageService, AccessControlService accessControlService) {
        this.messageService = messageService;
        this.accessControlService = accessControlService;
    }

    @GetMapping
    public ResponseEntity<MessageListResponse> list(
            @RequestParam(value = "year", required = false) String year,
            @RequestParam(value = "page", defaultValue = "1") int page,
            @RequestParam(value = "pageSize", defaultValue = "20") int pageSize,
            @RequestParam(value = "q", required = false) String query,
            @RequestParam(value = "self", defaultValue = "false") boolean self
    ) {
        CurrentUser user = CurrentUser.fromContext()
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(HttpStatus.UNAUTHORIZED));
        // Permite mensajes.list o mensajes.list.self (filtrando por remitente)
        String senderFilter = null;
        try {
            accessControlService.check(user, "messages.list", user.schoolId(), Optional.empty());
        } catch (org.springframework.web.server.ResponseStatusException ex) {
            // si no tiene list, intentar self
            accessControlService.check(user, "messages.list", user.schoolId(), Optional.ofNullable(user.email()));
            senderFilter = user.email();
        }
        if (self) {
            senderFilter = user.email();
        }
        boolean isGlobal = user.isGlobalAdmin() || user.isSuperAdmin();
        return ResponseEntity.ok(messageService.list(user.schoolId(), isGlobal, year, senderFilter, query, page, pageSize));
    }

    @PostMapping
    public ResponseEntity<MessageDto> create(@Valid @RequestBody MessageRequest request, Principal principal) {
        CurrentUser user = CurrentUser.fromContext()
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(HttpStatus.UNAUTHORIZED));
        accessControlService.check(user, "messages.create", request.schoolId() != null ? request.schoolId() : user.schoolId(), Optional.empty());
        String senderEmail = user.email() != null ? user.email() : (principal != null ? principal.getName() : "anon@notiflow.app");
        String senderName = user.name() != null && !user.name().isBlank()
                ? user.name()
                : (principal != null && principal.getName() != null ? principal.getName() : senderEmail.split("@")[0]);
        MessageDto created = messageService.create(request, senderEmail, senderName);
        return ResponseEntity.ok(created);
    }

    @GetMapping("/{id}")
    public ResponseEntity<MessageDto> getOne(@PathVariable("id") String id) {
        CurrentUser user = CurrentUser.fromContext()
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(HttpStatus.UNAUTHORIZED));
        MessageDto dto = messageService.getById(id);
        // permitir si tiene permiso o si es destinatario
        try {
            accessControlService.check(user, "messages.list", dto.schoolId(), Optional.empty());
        } catch (org.springframework.web.server.ResponseStatusException ex) {
            if (dto.recipients() == null || user.email() == null || !dto.recipients().contains(user.email())) {
                throw ex;
            }
        }
        return ResponseEntity.ok(dto);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable("id") String id) {
        CurrentUser user = CurrentUser.fromContext()
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(HttpStatus.UNAUTHORIZED));
        MessageDto dto = messageService.getById(id);
        String role = (user.role() == null) ? "" : user.role().toLowerCase();

        boolean allowed = false;
        if (user.isSuperAdmin() || user.isGlobalAdmin()) {
            allowed = true;
        } else if ("admin".equals(role)) {
            allowed = user.hasSchoolScope(dto.schoolId());
        } else if ("teacher".equals(role)) {
            allowed = user.email() != null && user.email().equalsIgnoreCase(dto.senderEmail());
        }

        if (!allowed) {
            throw new org.springframework.web.server.ResponseStatusException(HttpStatus.FORBIDDEN, "No puedes eliminar este mensaje");
        }

        messageService.delete(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/read")
    public ResponseEntity<Void> markRead(@PathVariable("id") String messageId) {
        CurrentUser user = CurrentUser.fromContext()
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(HttpStatus.UNAUTHORIZED));
        // Solo destinatarios o roles con permiso de listado pueden marcar
        try {
            accessControlService.check(user, "messages.list", user.schoolId(), Optional.empty());
        } catch (org.springframework.web.server.ResponseStatusException ex) {
            // si no tiene permisos amplios, permitimos si es el destinatario
        }
        if (user.email() == null || user.email().isBlank()) {
            throw new org.springframework.web.server.ResponseStatusException(HttpStatus.BAD_REQUEST, "Email requerido");
        }
        messageService.markAsRead(messageId, user.email());
        return ResponseEntity.ok().build();
    }

    @PostMapping("/process-scheduled")
    public ResponseEntity<java.util.Map<String, Integer>> processScheduled() {
        CurrentUser user = CurrentUser.fromContext()
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(HttpStatus.UNAUTHORIZED));
        if (!user.isSuperAdmin() && !user.isGlobalAdmin()) {
            throw new org.springframework.web.server.ResponseStatusException(HttpStatus.FORBIDDEN, "Solo superadmin");
        }
        int processed = messageService.processScheduled();
        return ResponseEntity.ok(java.util.Map.of("processed", processed));
    }
}
