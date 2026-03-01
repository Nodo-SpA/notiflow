package com.notiflow.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import java.util.List;

public record StudentRequest(
        String schoolId,
        String year,
        @NotBlank(message = "Curso es obligatorio")
        String course,
        String run,
        String gender,
        @NotBlank(message = "Nombres es obligatorio")
        String firstName,
        @NotBlank(message = "Apellido paterno es obligatorio")
        String lastNameFather,
        @NotBlank(message = "Apellido materno es obligatorio")
        String lastNameMother,
        String address,
        String commune,
        String email,
        String phone,
        String guardianFirstName, // deprecated: usar guardians
        String guardianLastName,  // deprecated: usar guardians
        @NotEmpty(message = "Debes agregar al menos un apoderado")
        List<GuardianContact> guardians
) {
}
