package com.notiflow.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class WhatsAppService {

    private static final Logger log = LoggerFactory.getLogger(WhatsAppService.class);
    private final RestTemplate restTemplate = new RestTemplate();
    private final boolean enabled;
    private final String token;
    private final String phoneNumberId;
    private final String apiVersion;
    private final String wabaId;

    public WhatsAppService(
            @Value("${app.whatsapp.token:}") String token,
            @Value("${app.whatsapp.phone-number-id:}") String phoneNumberId,
            @Value("${app.whatsapp.api-version:v20.0}") String apiVersion,
            @Value("${app.whatsapp.waba-id:}") String wabaId
    ) {
        this.token = token;
        this.phoneNumberId = phoneNumberId;
        this.apiVersion = apiVersion;
        this.wabaId = wabaId;
        this.enabled = token != null && !token.isBlank() && phoneNumberId != null && !phoneNumberId.isBlank();
    }

    public SendResult sendText(String body, List<String> recipients) {
        if (!enabled) {
            return new SendResult(false, 0, recipients.size(), List.of("WhatsApp no está configurado"));
        }

        List<String> errors = new ArrayList<>();
        int success = 0;
        for (String to : recipients) {
            try {
                Map<String, Object> payload = new HashMap<>();
                payload.put("messaging_product", "whatsapp");
                payload.put("to", to);
                payload.put("type", "text");
                Map<String, String> text = new HashMap<>();
                text.put("body", body);
                payload.put("text", text);

                HttpHeaders headers = new HttpHeaders();
                headers.setContentType(MediaType.APPLICATION_JSON);
                headers.setBearerAuth(token);

                HttpEntity<Map<String, Object>> entity = new HttpEntity<>(payload, headers);
                String url = "https://graph.facebook.com/" + apiVersion + "/" + phoneNumberId + "/messages";
                ResponseEntity<String> response = restTemplate.postForEntity(url, entity, String.class);
                if (response.getStatusCode().is2xxSuccessful()) {
                    success++;
                } else {
                    errors.add("Destino " + to + ": status " + response.getStatusCode());
                }
            } catch (Exception ex) {
                log.error("Error enviando a {} via WhatsApp", to, ex);
                errors.add("Destino " + to + ": " + ex.getMessage());
            }
        }
        return new SendResult(true, success, recipients.size() - success, errors);
    }

    public boolean isEnabled() {
        return enabled;
    }

    public String getWabaId() {
        return wabaId;
    }

    public record SendResult(boolean enabled, int success, int failed, List<String> errors) {
        public boolean allSucceeded() {
            return failed == 0;
        }
    }
}
