package com.notiflow.dto;

import com.notiflow.model.MessageStatus;
import com.notiflow.model.AttachmentMetadata;

import java.time.Instant;
import java.util.List;
import java.util.Map;

public record MessageDto(
        String id,
        String content,
        String senderName,
        String senderEmail,
        List<String> recipients,
        List<String> channels,
        MessageStatus emailStatus,
        MessageStatus appStatus,
        List<String> appReadBy,
        Map<String, MessageStatus> appStatuses,
        String schoolId,
        String year,
        List<String> groupIds,
        MessageStatus status,
        Instant scheduledAt,
        Instant createdAt,
        List<AttachmentMetadata> attachments,
        String reason,
        Boolean canDelete
) {
}
