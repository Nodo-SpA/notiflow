package com.notiflow.dto;

import java.util.List;

public record TeacherPermissionDto(
        String email,
        List<String> allowedGroupIds
) {
}
