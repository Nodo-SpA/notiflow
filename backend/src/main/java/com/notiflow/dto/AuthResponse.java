package com.notiflow.dto;

import java.util.List;

public record AuthResponse(
        String token,
        UserDto user,
        List<StudentOption> students
) {
    public AuthResponse(String token, UserDto user) {
        this(token, user, List.of());
    }
}
