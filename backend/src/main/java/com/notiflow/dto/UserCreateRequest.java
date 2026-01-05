package com.notiflow.dto;

import com.notiflow.model.UserRole;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record UserCreateRequest(
        @NotBlank String name,
        @Email @NotBlank String email,
        @NotNull UserRole role,
        @NotBlank String schoolId,
        @NotBlank String schoolName,
        @NotBlank String rut
) {
}
