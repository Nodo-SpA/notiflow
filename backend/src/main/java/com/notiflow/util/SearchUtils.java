package com.notiflow.util;

import java.text.Normalizer;
import java.util.Arrays;
import java.util.Locale;
import java.util.Objects;
import java.util.stream.Collectors;

public final class SearchUtils {

    private SearchUtils() {
    }

    public static boolean matchesQuery(String query, String... fields) {
        String normalizedQuery = normalize(query);
        if (normalizedQuery.isBlank()) {
            return true;
        }
        String haystack = normalize(Arrays.stream(fields)
                .filter(Objects::nonNull)
                .collect(Collectors.joining(" ")));
        if (haystack.isBlank()) {
            return false;
        }
        return Arrays.stream(normalizedQuery.split(" "))
                .filter(term -> !term.isBlank())
                .allMatch(haystack::contains);
    }

    public static String normalize(String value) {
        if (value == null) {
            return "";
        }
        String normalized = Normalizer.normalize(value, Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "")
                .toLowerCase(Locale.ROOT)
                .trim();
        return normalized.replaceAll("\\s+", " ");
    }
}
