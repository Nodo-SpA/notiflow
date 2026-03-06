package com.notiflow.dto;

import java.util.List;

public record PhoneDirectoryListResponse(
        List<PhoneDirectoryItemDto> items,
        long total,
        int page,
        int pageSize,
        boolean hasMore
) {
}
