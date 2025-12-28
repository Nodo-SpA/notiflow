package com.notiflow.model;

import java.time.Instant;
import java.util.List;

public class EventDocument {

    private String id;
    private String title;
    private String description;
    private Instant startDateTime;
    private Instant endDateTime;
    private String type; // general | schedule
    private String schoolId;
    private String createdByEmail;
    private String createdByName;
    private Instant createdAt;
    private List<String> audienceUserIds;
    private List<String> audienceGroupIds;

    public EventDocument() {
    }

    // getters y setters
    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public Instant getStartDateTime() {
        return startDateTime;
    }

    public void setStartDateTime(Instant startDateTime) {
        this.startDateTime = startDateTime;
    }

    public Instant getEndDateTime() {
        return endDateTime;
    }

    public void setEndDateTime(Instant endDateTime) {
        this.endDateTime = endDateTime;
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public String getSchoolId() {
        return schoolId;
    }

    public void setSchoolId(String schoolId) {
        this.schoolId = schoolId;
    }

    public String getCreatedByEmail() {
        return createdByEmail;
    }

    public void setCreatedByEmail(String createdByEmail) {
        this.createdByEmail = createdByEmail;
    }

    public String getCreatedByName() {
        return createdByName;
    }

    public void setCreatedByName(String createdByName) {
        this.createdByName = createdByName;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public List<String> getAudienceUserIds() {
        return audienceUserIds;
    }

    public void setAudienceUserIds(List<String> audienceUserIds) {
        this.audienceUserIds = audienceUserIds;
    }

    public List<String> getAudienceGroupIds() {
        return audienceGroupIds;
    }

    public void setAudienceGroupIds(List<String> audienceGroupIds) {
        this.audienceGroupIds = audienceGroupIds;
    }
}
