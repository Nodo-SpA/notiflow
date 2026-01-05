package com.notiflow.controller;

import com.notiflow.dto.UserCreateRequest;
import com.notiflow.dto.UserDto;
import com.notiflow.dto.UserUpdateRequest;
import com.notiflow.service.UserService;
import com.notiflow.service.AccessControlService;
import com.notiflow.util.CurrentUser;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Optional;

@RestController
@RequestMapping("/users")
public class UserController {

    private final UserService userService;
    private final AccessControlService accessControlService;

    public UserController(UserService userService, AccessControlService accessControlService) {
        this.userService = userService;
        this.accessControlService = accessControlService;
    }

    @GetMapping
    public ResponseEntity<List<UserDto>> list(
            @RequestParam(value = "page", defaultValue = "1") int page,
            @RequestParam(value = "pageSize", defaultValue = "50") int pageSize
    ) {
        CurrentUser user = CurrentUser.fromContext().orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(HttpStatus.UNAUTHORIZED));
        accessControlService.check(user, "users.list", user.schoolId(), Optional.empty());
        String schoolId = user.schoolId();
        return ResponseEntity.ok(userService.listAll(page, pageSize, schoolId, user.isGlobalAdmin()));
    }

    @PostMapping
    public ResponseEntity<UserDto> create(@Valid @RequestBody UserCreateRequest request) {
        CurrentUser current = CurrentUser.fromContext().orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(HttpStatus.UNAUTHORIZED));
        accessControlService.check(current, "users.create", request.schoolId(), Optional.empty());
        return ResponseEntity.ok(userService.create(request));
    }

    @PutMapping("/{id}")
    public ResponseEntity<UserDto> update(@PathVariable String id, @Valid @RequestBody UserUpdateRequest request) {
        CurrentUser current = CurrentUser.fromContext().orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(HttpStatus.UNAUTHORIZED));
        accessControlService.check(current, "users.update", request.schoolId(), Optional.empty());
        return ResponseEntity.ok(userService.update(id, request));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        CurrentUser current = CurrentUser.fromContext().orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(HttpStatus.UNAUTHORIZED));
        accessControlService.check(current, "users.delete", current.schoolId(), Optional.empty());
        userService.deleteById(id);
        return ResponseEntity.noContent().build();
    }
}
