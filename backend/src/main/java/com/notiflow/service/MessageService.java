package com.notiflow.service;

import com.google.api.core.ApiFuture;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.QueryDocumentSnapshot;
import com.google.cloud.firestore.QuerySnapshot;
import com.notiflow.dto.MessageDto;
import com.notiflow.dto.MessageRequest;
import com.notiflow.model.MessageDocument;
import com.notiflow.model.MessageStatus;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ExecutionException;
import java.util.stream.Collectors;

@Service
public class MessageService {

    private final Firestore firestore;
    private final WhatsAppService whatsAppService;

    public MessageService(Firestore firestore, WhatsAppService whatsAppService) {
        this.firestore = firestore;
        this.whatsAppService = whatsAppService;
    }

    public List<MessageDto> list() {
        try {
            ApiFuture<QuerySnapshot> query = firestore.collection("messages")
                    .orderBy("createdAt", com.google.cloud.firestore.Query.Direction.DESCENDING)
                    .limit(20)
                    .get();
            List<QueryDocumentSnapshot> docs = query.get().getDocuments();
            return docs.stream()
                    .map(doc -> {
                        MessageDocument msg = doc.toObject(MessageDocument.class);
                        msg.setId(doc.getId());
                        return new MessageDto(
                                msg.getId(),
                                msg.getContent(),
                                msg.getSenderName(),
                                msg.getRecipients(),
                                msg.getStatus(),
                                msg.getCreatedAt()
                        );
                    })
                    .collect(Collectors.toList());
        } catch (InterruptedException | ExecutionException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("Error listando mensajes", e);
        }
    }

    public MessageDto create(MessageRequest request, String senderId, String senderName) {
        try {
            MessageDocument msg = new MessageDocument();
            msg.setId(UUID.randomUUID().toString());
            msg.setContent(request.content());
            msg.setSenderId(senderId);
            msg.setSenderName(senderName);
            msg.setRecipients(request.recipients());
            MessageStatus status = MessageStatus.SENT;
            if (whatsAppService.isEnabled()) {
                var result = whatsAppService.sendText(request.content(), request.recipients());
                status = result.allSucceeded() ? MessageStatus.SENT : MessageStatus.FAILED;
            }
            msg.setStatus(status);
            msg.setCreatedAt(Instant.now());

            DocumentReference ref = firestore.collection("messages").document(msg.getId());
            ref.set(msg).get();

            return new MessageDto(
                    msg.getId(),
                    msg.getContent(),
                    msg.getSenderName(),
                    msg.getRecipients(),
                    msg.getStatus(),
                    msg.getCreatedAt()
            );
        } catch (InterruptedException | ExecutionException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("Error creando mensaje", e);
        }
    }
}
