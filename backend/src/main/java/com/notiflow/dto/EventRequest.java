package com.notiflow.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.Instant;
import java.util.List;

public record EventRequest(
        @NotBlank String title,
        String description,
        @NotNull Instant startDateTime,
        Instant endDateTime,
        String type,
        String schoolId,
        Audience audience,
        String id // opcional: permite actualizar eventos existentes
) {
    public record Audience(
            List<String> userIds,
            List<String> groupIds
    ) {
    }
}
