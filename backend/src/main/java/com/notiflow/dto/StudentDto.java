package com.notiflow.dto;

import java.time.Instant;
import java.util.List;

public record StudentDto(
        String id,
        String schoolId,
        String year,
        String course,
        String run,
        String gender,
        String firstName,
        String lastNameFather,
        String lastNameMother,
        String address,
        String commune,
        String email,
        String phone,
        String guardianFirstName, // deprecated
        String guardianLastName,  // deprecated
        List<GuardianContact> guardians,
        List<String> guardianEmails,
        Instant createdAt,
        Instant updatedAt
) {
}
