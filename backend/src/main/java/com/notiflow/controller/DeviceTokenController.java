package com.notiflow.controller;

import com.notiflow.dto.DeviceRegisterRequest;
import com.notiflow.service.DeviceTokenService;
import com.notiflow.util.CurrentUser;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/devices")
public class DeviceTokenController {
    private final DeviceTokenService deviceTokenService;

    public DeviceTokenController(DeviceTokenService deviceTokenService) {
        this.deviceTokenService = deviceTokenService;
    }

    @PostMapping("/register")
    public ResponseEntity<Void> register(@Valid @RequestBody DeviceRegisterRequest req) {
        CurrentUser user = CurrentUser.fromContext()
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.UNAUTHORIZED));
        deviceTokenService.register(user.email(), req.token(), req.platform(), user.schoolId());
        return ResponseEntity.ok().build();
    }

    @DeleteMapping("/{token}")
    public ResponseEntity<Void> unregister(@PathVariable("token") String token) {
        deviceTokenService.unregister(token);
        return ResponseEntity.noContent().build();
    }
}
