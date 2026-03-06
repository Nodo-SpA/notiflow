package com.notiflow.controller;

import com.notiflow.dto.PhoneDirectoryListResponse;
import com.notiflow.service.PhoneDirectoryService;
import com.notiflow.util.CurrentUser;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/phone-directory")
public class PhoneDirectoryController {

    private final PhoneDirectoryService phoneDirectoryService;

    public PhoneDirectoryController(PhoneDirectoryService phoneDirectoryService) {
        this.phoneDirectoryService = phoneDirectoryService;
    }

    @GetMapping
    public ResponseEntity<PhoneDirectoryListResponse> list(
            @RequestParam(value = "schoolId", required = false) String schoolId,
            @RequestParam(value = "year", required = false) String year,
            @RequestParam(value = "q", required = false) String query,
            @RequestParam(value = "page", defaultValue = "1") int page,
            @RequestParam(value = "pageSize", defaultValue = "50") int pageSize
    ) {
        CurrentUser user = CurrentUser.fromContext()
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(HttpStatus.UNAUTHORIZED));
        PhoneDirectoryListResponse result = phoneDirectoryService.list(user, schoolId, year, query, page, pageSize);
        return ResponseEntity.ok(result);
    }
}
