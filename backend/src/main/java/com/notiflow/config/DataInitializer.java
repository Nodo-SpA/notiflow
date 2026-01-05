package com.notiflow.config;

import com.notiflow.dto.UserCreateRequest;
import com.notiflow.model.UserRole;
import com.notiflow.service.UserService;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.StringUtils;

@Configuration
public class DataInitializer {

    @Bean
    public ApplicationRunner seedDefaultUser(UserService userService) {
        return args -> {
            String adminEmail = System.getenv("APP_ADMIN_EMAIL");
            String adminSchoolId = System.getenv("APP_ADMIN_SCHOOL_ID");
            if (adminSchoolId == null || adminSchoolId.isBlank()) {
                adminSchoolId = "global";
            }
            if (StringUtils.hasText(adminEmail)) {
                final String schoolIdFinal = adminSchoolId;
                userService.findByEmail(adminEmail).orElseGet(() -> {
                    userService.create(
                            new UserCreateRequest(
                                    "Admin",
                                    adminEmail,
                                    UserRole.ADMIN,
                                    schoolIdFinal,
                                    "Colegios",
                                    "11111111-1"
                            )
                    );
                    return null;
                });
            }
        };
    }
}
