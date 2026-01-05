package com.notiflow.model;

import java.time.Instant;
import java.util.List;

public class StudentDocument {
    private String id;
    private String schoolId;
    private String year;
    private String course;
    private String run;
    private String gender;
    private String firstName;
    private String lastNameFather;
    private String lastNameMother;
    private String address;
    private String commune;
    private String email;
    private String phone;
    private String guardianFirstName;
    private String guardianLastName;
    private List<com.notiflow.dto.GuardianContact> guardians;
    private List<String> guardianEmails;
    private Instant createdAt;
    private Instant updatedAt;

    public StudentDocument() {}

    // getters y setters
    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getSchoolId() { return schoolId; }
    public void setSchoolId(String schoolId) { this.schoolId = schoolId; }
    public String getYear() { return year; }
    public void setYear(String year) { this.year = year; }
    public String getCourse() { return course; }
    public void setCourse(String course) { this.course = course; }
    public String getRun() { return run; }
    public void setRun(String run) { this.run = run; }
    public String getGender() { return gender; }
    public void setGender(String gender) { this.gender = gender; }
    public String getFirstName() { return firstName; }
    public void setFirstName(String firstName) { this.firstName = firstName; }
    public String getLastNameFather() { return lastNameFather; }
    public void setLastNameFather(String lastNameFather) { this.lastNameFather = lastNameFather; }
    public String getLastNameMother() { return lastNameMother; }
    public void setLastNameMother(String lastNameMother) { this.lastNameMother = lastNameMother; }
    public String getAddress() { return address; }
    public void setAddress(String address) { this.address = address; }
    public String getCommune() { return commune; }
    public void setCommune(String commune) { this.commune = commune; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }
    public String getGuardianFirstName() { return guardianFirstName; }
    public void setGuardianFirstName(String guardianFirstName) { this.guardianFirstName = guardianFirstName; }
    public String getGuardianLastName() { return guardianLastName; }
    public void setGuardianLastName(String guardianLastName) { this.guardianLastName = guardianLastName; }
    public List<com.notiflow.dto.GuardianContact> getGuardians() { return guardians; }
    public void setGuardians(List<com.notiflow.dto.GuardianContact> guardians) { this.guardians = guardians; }
    public List<String> getGuardianEmails() { return guardianEmails; }
    public void setGuardianEmails(List<String> guardianEmails) { this.guardianEmails = guardianEmails; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
