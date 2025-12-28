package com.notiflow.model;

import java.time.Instant;

public class DeviceToken {
    private String id;
    private String email;
    private String token;
    private String platform;
    private Instant createdAt;
    private String schoolId;

    public DeviceToken() {}

    public DeviceToken(String id, String email, String token, String platform, Instant createdAt, String schoolId) {
        this.id = id;
        this.email = email;
        this.token = token;
        this.platform = platform;
        this.createdAt = createdAt;
        this.schoolId = schoolId;
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getToken() {
        return token;
    }

    public void setToken(String token) {
        this.token = token;
    }

    public String getPlatform() {
        return platform;
    }

    public void setPlatform(String platform) {
        this.platform = platform;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public String getSchoolId() {
        return schoolId;
    }

    public void setSchoolId(String schoolId) {
        this.schoolId = schoolId;
    }
}
