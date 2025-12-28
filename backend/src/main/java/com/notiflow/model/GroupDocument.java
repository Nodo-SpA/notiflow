package com.notiflow.model;

import java.time.Instant;
import java.util.List;

public class GroupDocument {

    private String id;
    private String name;
    private String description;
    private List<String> memberIds;
    private String schoolId;
    private String year;
    private Instant createdAt;

    public GroupDocument() {}

    public GroupDocument(String id, String name, String description, List<String> memberIds, String schoolId, String year, Instant createdAt) {
        this.id = id;
        this.name = name;
        this.description = description;
        this.memberIds = memberIds;
        this.schoolId = schoolId;
        this.year = year;
        this.createdAt = createdAt;
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public List<String> getMemberIds() {
        return memberIds;
    }

    public void setMemberIds(List<String> memberIds) {
        this.memberIds = memberIds;
    }

    public String getSchoolId() {
        return schoolId;
    }

    public void setSchoolId(String schoolId) {
        this.schoolId = schoolId;
    }

    public String getYear() {
        return year;
    }

    public void setYear(String year) {
        this.year = year;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
}
