package com.notiflow.service;

import com.notiflow.dto.AttachmentRequest;
import com.sendgrid.Method;
import com.sendgrid.Request;
import com.sendgrid.Response;
import com.sendgrid.SendGrid;
import com.sendgrid.helpers.mail.Mail;
import com.sendgrid.helpers.mail.objects.Attachments;
import com.sendgrid.helpers.mail.objects.Content;
import com.sendgrid.helpers.mail.objects.Email;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider;
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.SdkBytes;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.ses.SesClient;
import software.amazon.awssdk.services.ses.model.RawMessage;
import software.amazon.awssdk.services.ses.model.SendRawEmailRequest;

import jakarta.mail.Message;
import jakarta.mail.Session;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeBodyPart;
import jakarta.mail.internet.MimeMessage;
import jakarta.mail.internet.MimeMultipart;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Base64;
import java.util.List;
import java.util.Properties;

@Service
public class EmailService {

    private static final Logger log = LoggerFactory.getLogger(EmailService.class);
    private final SesClient sesClient;
    private final SendGrid sendGridClient;
    private final boolean sendGridEnabled;
    private final boolean sesEnabled;
    private final String senderEmail;
    private final String frontendBaseUrl;

    public EmailService(
            @Value("${AWS_SES_ACCESS_KEY:}") String accessKey,
            @Value("${AWS_SES_SECRET_KEY:}") String secretKey,
            @Value("${AWS_SES_REGION:}") String awsRegion,
            @Value("${SENDGRID_API_KEY:}") String sendGridApiKey,
            @Value("${app.mail.from:no-reply@notiflow.local}") String senderEmail,
            @Value("${app.frontend-url:https://hectorguzman.github.io/notiflow}") String frontendBaseUrl
    ) {
        this.senderEmail = senderEmail;
        this.frontendBaseUrl = frontendBaseUrl != null && frontendBaseUrl.endsWith("/")
                ? frontendBaseUrl.substring(0, frontendBaseUrl.length() - 1)
                : frontendBaseUrl;

        SesClient client = null;
        boolean sesEnabledLocal = false;
        if (awsRegion != null && !awsRegion.isBlank() && senderEmail != null && !senderEmail.isBlank()) {
            AwsCredentialsProvider provider;
            if (accessKey != null && !accessKey.isBlank() && secretKey != null && !secretKey.isBlank()) {
                provider = StaticCredentialsProvider.create(AwsBasicCredentials.create(accessKey, secretKey));
            } else {
                provider = DefaultCredentialsProvider.create();
            }
            try {
                client = SesClient.builder()
                        .region(Region.of(awsRegion))
                        .credentialsProvider(provider)
                        .build();
                sesEnabledLocal = true;
            } catch (Exception e) {
                log.error("No se pudo inicializar SES: {}", e.getMessage());
            }
        }
        this.sesClient = client;
        this.sesEnabled = sesEnabledLocal;

        SendGrid sg = null;
        boolean sgEnabled = false;
        if (sendGridApiKey != null && !sendGridApiKey.isBlank()) {
            sg = new SendGrid(sendGridApiKey);
            sgEnabled = true;
        }
        this.sendGridClient = sg;
        this.sendGridEnabled = sgEnabled;
    }

    public boolean sendPasswordResetEmail(String to, String token, Instant expiresAt) {
        String link = buildResetLink(token);
        String humanExpiration = expiresAt == null
                ? "pronto"
                : DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")
                    .withZone(ZoneId.systemDefault())
                    .format(expiresAt);

        String text = """
                Hola,

                Recibimos una solicitud para restablecer tu contraseña en Notiflow.
                Usa el siguiente enlace o token para completar el proceso.

                Enlace: %s
                Token: %s
                Expira: %s

                Si no solicitaste esto, puedes ignorar este correo.
                """.formatted(link, token, humanExpiration);

        return sendPlainEmail(to, "Recupera tu contraseña", text);
    }

    public boolean sendMessageEmail(String to, String subject, String htmlBody, String textBody, List<AttachmentRequest> attachments) {
        if (sendGridEnabled && sendGridClient != null) {
            return sendWithSendGrid(to, subject, htmlBody, textBody, attachments);
        }
        if (!sesEnabled || sesClient == null) {
            log.warn("Email no configurado; se omite envío a {}", to);
            return false;
        }
        try {
            sendRawEmailWithAttachments(to, subject, htmlBody, textBody, attachments);
            return true;
        } catch (Exception e) {
            log.error("No se pudo enviar correo a {}: {}", to, e.getMessage());
            return false;
        }
    }

    private String stripHtml(String html) {
        if (html == null) return "";
        return html.replaceAll("<[^>]*>", "").replace("&nbsp;", " ");
    }

    public boolean isEnabled() {
        return sendGridEnabled || sesEnabled;
    }

    private String buildResetLink(String token) {
        String base = frontendBaseUrl == null || frontendBaseUrl.isBlank()
                ? "https://hectorguzman.github.io/notiflow"
                : frontendBaseUrl;
        return base + (base.endsWith("/") ? "" : "/") + "forgot-password?token=" + token;
    }

    public boolean sendWelcomeEmail(String to, String name, String token, Instant expiresAt) {
        String link = buildResetLink(token);
        String humanExpiration = expiresAt == null
                ? "24 horas"
                : DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")
                    .withZone(ZoneId.systemDefault())
                    .format(expiresAt);
        String text = """
                Hola %s,

                Bienvenido a Notiflow. Tu cuenta ha sido creada.
                Para establecer tu contraseña, usa este enlace:
                %s

                Este enlace dura hasta: %s

                Si el enlace caduca, puedes crear tu contraseña desde:
                https://www.notiflow.cl/forgot-password/

                Si no reconoces este correo, ignora este mensaje.
                """.formatted(name != null ? name : "usuario", link, humanExpiration);

        return sendPlainEmail(to, "Bienvenido a Notiflow - establece tu contraseña", text);
    }

    private boolean sendPlainEmail(String to, String subject, String textBody) {
        if (sendGridEnabled && sendGridClient != null) {
            return sendWithSendGrid(to, subject, null, textBody, null);
        }
        if (!sesEnabled || sesClient == null) {
            log.warn("Email no configurado; se omite envío simple a {}", to);
            return false;
        }
        try {
            MimeMessage message = baseMessage(to, subject);
            message.setText(textBody, StandardCharsets.UTF_8.name());
            return sendRaw(message);
        } catch (Exception e) {
            log.error("No se pudo enviar correo simple a {}: {}", to, e.getMessage());
            return false;
        }
    }

    private MimeMessage baseMessage(String to, String subject) throws Exception {
        Session session = Session.getInstance(new Properties());
        MimeMessage message = new MimeMessage(session);
        message.setFrom(new InternetAddress(senderEmail, "Notiflow"));
        message.setRecipients(Message.RecipientType.TO, InternetAddress.parse(to));
        message.setSubject(subject, StandardCharsets.UTF_8.name());
        return message;
    }

    private void sendRawEmailWithAttachments(
            String to,
            String subject,
            String htmlBody,
            String textBody,
            List<AttachmentRequest> attachments
    ) throws Exception {
        if (sendGridEnabled && sendGridClient != null) {
            throw new IllegalStateException("SendGrid habilitado; usa sendWithSendGrid");
        }
        MimeMessage message = baseMessage(to, subject);

        MimeMultipart mixed = new MimeMultipart("mixed");

        // Body: alternative inside related (para inline)
        MimeBodyPart wrapRelated = new MimeBodyPart();
        MimeMultipart related = new MimeMultipart("related");

        MimeMultipart alternative = new MimeMultipart("alternative");
        MimeBodyPart textPart = new MimeBodyPart();
        textPart.setText(textBody != null ? textBody : stripHtml(htmlBody), StandardCharsets.UTF_8.name());
        MimeBodyPart htmlPart = new MimeBodyPart();
        htmlPart.setContent(htmlBody, "text/html; charset=UTF-8");
        alternative.addBodyPart(textPart);
        alternative.addBodyPart(htmlPart);

        MimeBodyPart altWrapper = new MimeBodyPart();
        altWrapper.setContent(alternative);
        related.addBodyPart(altWrapper);

        // Inline attachments
        if (attachments != null) {
            for (AttachmentRequest att : attachments) {
                if (att == null || att.base64() == null || att.fileName() == null) continue;
                byte[] data = Base64.getDecoder().decode(att.base64());
                MimeBodyPart part = new MimeBodyPart();
                part.setFileName(att.fileName());
                part.setContent(data, att.mimeType() != null ? att.mimeType() : "application/octet-stream");
                if (Boolean.TRUE.equals(att.inline())) {
                    part.setDisposition(jakarta.mail.Part.INLINE);
                    if (att.cid() != null) {
                        part.setHeader("Content-ID", "<" + att.cid() + ">");
                    }
                } else {
                    part.setDisposition(jakarta.mail.Part.ATTACHMENT);
                }
                related.addBodyPart(part);
            }
        }

        wrapRelated.setContent(related);
        mixed.addBodyPart(wrapRelated);

        // Non-inline attachments (already added above if inline == false in related)
        message.setContent(mixed);
        message.saveChanges();

        if (!sendRaw(message)) {
            throw new RuntimeException("SES sendRawEmail falló");
        }
    }

    private boolean sendRaw(MimeMessage message) {
        if (!sesEnabled || sesClient == null) {
            log.warn("SES no configurado; no se enviará email raw");
            return false;
        }
        try {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            message.writeTo(out);
            byte[] bytes = out.toByteArray();
            SendRawEmailRequest request = SendRawEmailRequest.builder()
                    .rawMessage(RawMessage.builder().data(SdkBytes.fromByteArray(bytes)).build())
                    .build();
            sesClient.sendRawEmail(request);
            return true;
        } catch (Exception e) {
            log.error("SES sendRawEmail error: {}", e.getMessage());
            return false;
        }
    }

    private boolean sendWithSendGrid(
            String to,
            String subject,
            String htmlBody,
            String textBody,
            List<AttachmentRequest> attachments
    ) {
        if (!sendGridEnabled || sendGridClient == null) {
            log.warn("SendGrid no configurado; se omite envío a {}", to);
            return false;
        }
        try {
            Email from = new Email(senderEmail, "Notiflow");
            Email toEmail = new Email(to);
            String plain = textBody != null && !textBody.isBlank()
                    ? textBody
                    : (htmlBody != null ? stripHtml(htmlBody) : "");
            Content plainContent = new Content("text/plain", plain);
            Mail mail = new Mail(from, subject, toEmail, plainContent);
            if (htmlBody != null && !htmlBody.isBlank()) {
                mail.addContent(new Content("text/html", htmlBody));
            }
            if (attachments != null) {
                for (AttachmentRequest att : attachments) {
                    if (att == null || att.base64() == null || att.fileName() == null) continue;
                    Attachments sgAtt = new Attachments();
                    sgAtt.setContent(att.base64());
                    sgAtt.setType(att.mimeType() != null ? att.mimeType() : "application/octet-stream");
                    sgAtt.setFilename(att.fileName());
                    if (Boolean.TRUE.equals(att.inline())) {
                        sgAtt.setDisposition("inline");
                        if (att.cid() != null) {
                            sgAtt.setContentId(att.cid());
                        }
                    } else {
                        sgAtt.setDisposition("attachment");
                    }
                    mail.addAttachments(sgAtt);
                }
            }
            Request request = new Request();
            request.setMethod(Method.POST);
            request.setEndpoint("mail/send");
            request.setBody(mail.build());
            Response response = sendGridClient.api(request);
            int status = response.getStatusCode();
            if (status >= 200 && status < 300) {
                return true;
            }
            log.error("SendGrid error {}: {}", status, response.getBody());
            return false;
        } catch (Exception e) {
            log.error("No se pudo enviar correo SendGrid a {}: {}", to, e.getMessage());
            return false;
        }
    }
}
