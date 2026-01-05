package com.notiflow.controller;

import com.notiflow.dto.AiModerationRequest;
import com.notiflow.dto.AiModerationResponse;
import com.notiflow.dto.AiRewriteRequest;
import com.notiflow.dto.AiRewriteResponse;
import com.notiflow.dto.AiRewriteModerateResponse;
import com.notiflow.dto.AiPolicyRequest;
import com.notiflow.dto.AiPolicyResponse;
import com.notiflow.service.AiPolicyService;
import com.notiflow.service.AccessControlService;
import com.notiflow.service.VertexAiService;
import com.notiflow.util.CurrentUser;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Optional;

@RestController
@RequestMapping("/ai")
public class AiController {

    private final VertexAiService vertexAiService;
    private final AccessControlService accessControlService;
    private final AiPolicyService aiPolicyService;

    public AiController(VertexAiService vertexAiService, AccessControlService accessControlService, AiPolicyService aiPolicyService) {
        this.vertexAiService = vertexAiService;
        this.accessControlService = accessControlService;
        this.aiPolicyService = aiPolicyService;
    }

    @PostMapping("/rewrite")
    public ResponseEntity<AiRewriteResponse> rewrite(@Valid @RequestBody AiRewriteRequest request) {
        CurrentUser user = CurrentUser.fromContext()
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(HttpStatus.UNAUTHORIZED));
        accessControlService.check(user, "messages.create", user.schoolId(), Optional.empty());
        String schoolId = user.schoolId() == null ? "global" : user.schoolId();
        String suggestion = vertexAiService.rewrite(request.text(), request.tone(), schoolId);
        return ResponseEntity.ok(new AiRewriteResponse(suggestion));
    }

    @PostMapping("/moderate")
    public ResponseEntity<AiModerationResponse> moderate(@Valid @RequestBody AiModerationRequest request) {
        CurrentUser user = CurrentUser.fromContext()
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(HttpStatus.UNAUTHORIZED));
        accessControlService.check(user, "messages.create", user.schoolId(), Optional.empty());
        String schoolId = user.schoolId() == null ? "global" : user.schoolId();
        VertexAiService.ModerationResult result = vertexAiService.moderate(request.text(), schoolId);
        return ResponseEntity.ok(new AiModerationResponse(result.allowed(), result.reasons()));
    }

    @PostMapping("/rewrite-moderate")
    public ResponseEntity<AiRewriteModerateResponse> rewriteModerate(@Valid @RequestBody AiRewriteRequest request) {
        CurrentUser user = CurrentUser.fromContext()
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(HttpStatus.UNAUTHORIZED));
        accessControlService.check(user, "messages.create", user.schoolId(), Optional.empty());
        String schoolId = user.schoolId() == null ? "global" : user.schoolId();
        VertexAiService.RewriteModerateResult result = vertexAiService.rewriteAndModerate(
                request.text(),
                request.subject(),
                request.tone(),
                schoolId
        );
        return ResponseEntity.ok(new AiRewriteModerateResponse(
                result.suggestion(),
                result.subjectSuggestion(),
                result.allowed(),
                result.reasons()
        ));
    }

    @GetMapping("/policy")
    public ResponseEntity<AiPolicyResponse> getPolicy(@RequestParam(value = "schoolId", required = false) String schoolId) {
        CurrentUser user = CurrentUser.fromContext()
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(HttpStatus.UNAUTHORIZED));
        String targetSchool = (schoolId == null || schoolId.isBlank()) ? user.schoolId() : schoolId;
        if (targetSchool == null) targetSchool = "global";
        try {
            accessControlService.check(user, "schools.manage", targetSchool, Optional.empty());
        } catch (org.springframework.web.server.ResponseStatusException ex) {
            // Permitir lectura de política a quienes pueden crear mensajes del colegio
            accessControlService.check(user, "messages.create", targetSchool, Optional.empty());
        }
        return ResponseEntity.ok(aiPolicyService.getPolicy(targetSchool));
    }

    @PutMapping("/policy")
    public ResponseEntity<AiPolicyResponse> updatePolicy(@Valid @RequestBody AiPolicyRequest request) {
        CurrentUser user = CurrentUser.fromContext()
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(HttpStatus.UNAUTHORIZED));
        String targetSchool = (request.schoolId() == null || request.schoolId().isBlank()) ? user.schoolId() : request.schoolId();
        if (targetSchool == null) targetSchool = "global";
        accessControlService.check(user, "schools.manage", targetSchool, Optional.empty());
        AiPolicyResponse saved = aiPolicyService.savePolicy(
                targetSchool,
                request.rewritePrompt(),
                request.moderationRules(),
                user.email() == null ? user.name() : user.email()
        );
        return ResponseEntity.ok(saved);
    }
}
