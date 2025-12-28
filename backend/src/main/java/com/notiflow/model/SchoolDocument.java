package com.notiflow.model;

public class SchoolDocument {
    private String id;
    private String name;
    private String currentYear;
    private String logoUrl;

    public SchoolDocument() {}

    public SchoolDocument(String id, String name, String currentYear, String logoUrl) {
        this.id = id;
        this.name = name;
        this.currentYear = currentYear;
        this.logoUrl = logoUrl;
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

    public String getCurrentYear() {
        return currentYear;
    }

    public void setCurrentYear(String currentYear) {
        this.currentYear = currentYear;
    }

    public String getLogoUrl() {
        return logoUrl;
    }

    public void setLogoUrl(String logoUrl) {
        this.logoUrl = logoUrl;
    }
}
