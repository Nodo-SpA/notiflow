package com.notiflow.model;

import java.time.Instant;
import java.util.List;
import java.util.Map;

public class MessageDocument {

    private String id;
    private String content;
    private String senderId;
    private String senderName;
    private String senderEmail;
    private List<String> recipients;
    private List<String> channels;
    private MessageStatus emailStatus;
    private MessageStatus appStatus;
    private String schoolId;
    private String year;
    private MessageStatus status;
    private Instant createdAt;
    private Instant scheduledAt;
    private List<AttachmentMetadata> attachments;
    private String reason;
    // destinatarios que ya leyeron en la app
    private List<String> appReadBy;
    // estado por destinatario para la app (PENDING/READ)
    private Map<String, MessageStatus> appStatuses;

    public MessageDocument() {
    }

    public MessageDocument(String id, String content, String senderId, String senderName, String senderEmail, List<String> recipients, List<String> channels, MessageStatus emailStatus, MessageStatus appStatus, String schoolId, String year, MessageStatus status, Instant createdAt) {
        this.id = id;
        this.content = content;
        this.senderId = senderId;
        this.senderName = senderName;
        this.senderEmail = senderEmail;
        this.recipients = recipients;
        this.channels = channels;
        this.emailStatus = emailStatus;
        this.appStatus = appStatus;
        this.schoolId = schoolId;
        this.year = year;
        this.status = status;
        this.createdAt = createdAt;
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }

    public String getSenderId() {
        return senderId;
    }

    public void setSenderId(String senderId) {
        this.senderId = senderId;
    }

    public String getSenderName() {
        return senderName;
    }

    public void setSenderName(String senderName) {
        this.senderName = senderName;
    }

    public String getSenderEmail() {
        return senderEmail;
    }

    public void setSenderEmail(String senderEmail) {
        this.senderEmail = senderEmail;
    }

    public List<String> getRecipients() {
        return recipients;
    }

    public void setRecipients(List<String> recipients) {
        this.recipients = recipients;
    }

    public List<String> getChannels() {
        return channels;
    }

    public void setChannels(List<String> channels) {
        this.channels = channels;
    }

    public MessageStatus getEmailStatus() {
        return emailStatus;
    }

    public void setEmailStatus(MessageStatus emailStatus) {
        this.emailStatus = emailStatus;
    }

    public MessageStatus getAppStatus() {
        return appStatus;
    }

    public void setAppStatus(MessageStatus appStatus) {
        this.appStatus = appStatus;
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

    public MessageStatus getStatus() {
        return status;
    }

    public void setStatus(MessageStatus status) {
        this.status = status;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getScheduledAt() {
        return scheduledAt;
    }

    public void setScheduledAt(Instant scheduledAt) {
        this.scheduledAt = scheduledAt;
    }

    public List<AttachmentMetadata> getAttachments() {
        return attachments;
    }

    public void setAttachments(List<AttachmentMetadata> attachments) {
        this.attachments = attachments;
    }

    public String getReason() {
        return reason;
    }

    public void setReason(String reason) {
        this.reason = reason;
    }

    public List<String> getAppReadBy() {
        return appReadBy;
    }

    public void setAppReadBy(List<String> appReadBy) {
        this.appReadBy = appReadBy;
    }

    public Map<String, MessageStatus> getAppStatuses() {
        return appStatuses;
    }

    public void setAppStatuses(Map<String, MessageStatus> appStatuses) {
        this.appStatuses = appStatuses;
    }
}
