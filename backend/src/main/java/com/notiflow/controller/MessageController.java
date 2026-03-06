package com.notiflow.controller;

import com.notiflow.dto.MessageDto;
import com.notiflow.dto.MessageListResponse;
import com.notiflow.dto.MessageRequest;
import com.notiflow.service.AccessControlService;
import com.notiflow.service.MessageService;
import com.notiflow.util.CurrentUser;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Value;
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
    private final String cronSecret;

    public MessageController(
            MessageService messageService,
            AccessControlService accessControlService,
            @Value("${app.cron.secret:}") String cronSecret
    ) {
        this.messageService = messageService;
        this.accessControlService = accessControlService;
        this.cronSecret = cronSecret;
    }

    @GetMapping
    public ResponseEntity<MessageListResponse> list(
            @RequestParam(value = "year", required = false) String year,
            @RequestParam(value = "page", defaultValue = "1") int page,
            @RequestParam(value = "pageSize", defaultValue = "20") int pageSize,
            @RequestParam(value = "q", required = false) String query,
            @RequestParam(value = "self", defaultValue = "false") boolean self,
            @RequestParam(value = "studentId", required = false) String studentId
    ) {
        CurrentUser user = CurrentUser.fromContext()
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(HttpStatus.UNAUTHORIZED));
        String role = user.role() == null ? "" : user.role().toLowerCase();
        if ("teacher".equals(role)) {
            boolean isGlobal = user.isGlobalAdmin() || user.isSuperAdmin();
            return ResponseEntity.ok(messageService.list(
                    user.schoolId(),
                    isGlobal,
                    year,
                    user.email(),
                    null,
                    query,
                    page,
                    pageSize,
                    null
            ));
        }
        if ("student".equals(role) || "guardian".equals(role)) {
            return ResponseEntity.ok(messageService.list(
                    null,
                    true,
                    year,
                    null,
                    user.email(),
                    query,
                    page,
                    pageSize,
                    studentId
            ));
        }
        // Permite mensajes.list o mensajes.list.self (filtrando por remitente)
        String senderFilter = null;
        String recipientFilter = null;
        try {
            accessControlService.check(user, "messages.list", user.schoolId(), Optional.empty());
        } catch (org.springframework.web.server.ResponseStatusException ex) {
            // si no tiene list, intentar self
            accessControlService.check(user, "messages.list", user.schoolId(), Optional.ofNullable(user.email()));
            recipientFilter = user.email();
        }
        if (self) {
            recipientFilter = user.email();
        }
        boolean isGlobal = user.isGlobalAdmin() || user.isSuperAdmin();
        return ResponseEntity.ok(messageService.list(user.schoolId(), isGlobal, year, senderFilter, recipientFilter, query, page, pageSize, null));
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
    public ResponseEntity<java.util.Map<String, Integer>> processScheduled(
            @RequestHeader(value = "X-Cron-Secret", required = false) String headerSecret,
            @RequestParam(value = "cronKey", required = false) String paramSecret
    ) {
        boolean cronAllowed = cronSecret != null && !cronSecret.isBlank()
                && ((headerSecret != null && headerSecret.equals(cronSecret)) || (paramSecret != null && paramSecret.equals(cronSecret)));

        CurrentUser user = CurrentUser.fromContext().orElse(null);

        if (!cronAllowed) {
            if (user == null) {
                throw new org.springframework.web.server.ResponseStatusException(HttpStatus.UNAUTHORIZED);
            }
            if (!user.isSuperAdmin() && !user.isGlobalAdmin()) {
                throw new org.springframework.web.server.ResponseStatusException(HttpStatus.FORBIDDEN, "Solo superadmin");
            }
        }
        int processed = messageService.processScheduled();
        return ResponseEntity.ok(java.util.Map.of("processed", processed));
    }

    // Tracking de apertura de correo: píxel 1x1, sin auth
    @GetMapping(value = "/{id}/track", produces = org.springframework.http.MediaType.IMAGE_PNG_VALUE)
    public ResponseEntity<byte[]> trackEmail(
            @PathVariable("id") String messageId,
            @RequestParam("recipient") String recipient,
            @RequestParam(value = "schoolId", required = false) String schoolId
    ) {
        messageService.markEmailOpened(messageId, recipient, schoolId);
        // Píxel transparente 1x1
        byte[] pixel = new byte[]{
                (byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
                0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
                0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
                0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, (byte) 0xC4, (byte) 0x89,
                0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, 0x54,
                0x78, (byte) 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01,
                0x0D, 0x0A, 0x2D, (byte) 0xB4, 0x00, 0x00, 0x00, 0x00,
                0x49, 0x45, 0x4E, 0x44, (byte) 0xAE, 0x42, 0x60, (byte) 0x82
        };
        return ResponseEntity
                .ok()
                .cacheControl(org.springframework.http.CacheControl.noCache())
                .body(pixel);
    }
}
