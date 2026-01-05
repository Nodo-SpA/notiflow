package com.notiflow.service;

import com.notiflow.dto.StudentOption;
import java.util.List;

public class MultiStudentMatchException extends RuntimeException {
    private final List<StudentOption> options;

    public MultiStudentMatchException(List<StudentOption> options) {
        super("Existen múltiples hijos/apoderados con este correo, selecciona uno");
        this.options = options;
    }

    public List<StudentOption> getOptions() {
        return options;
    }
}
