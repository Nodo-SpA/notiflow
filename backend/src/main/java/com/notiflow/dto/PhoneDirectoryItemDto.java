package com.notiflow.dto;

import java.util.List;

public record PhoneDirectoryItemDto(
        String studentId,
        String schoolId,
        String year,
        String course,
        String run,
        String studentName,
        String studentPhone,
        List<GuardianContact> guardians
) {
}
