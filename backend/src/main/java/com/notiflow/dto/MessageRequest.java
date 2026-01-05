package com.notiflow.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;

import java.util.List;

public record MessageRequest(
        @NotBlank String content,
        @NotEmpty List<String> recipients,
        List<String> channels,
        String year,
        String schoolId,
        String reason,
        List<AttachmentRequest> attachments,
        List<String> groupIds,
        String scheduleAt
) {
}
