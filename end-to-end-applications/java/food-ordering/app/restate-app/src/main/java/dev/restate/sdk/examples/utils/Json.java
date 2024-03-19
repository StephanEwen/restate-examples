package dev.restate.sdk.examples.utils;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.restate.sdk.common.TerminalException;
import dev.restate.sdk.examples.types.OrderRequest;

public class Json {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    public static OrderRequest readOrder(String json) {
        try {
            return MAPPER.readValue(json, OrderRequest.class);
        } catch (JsonProcessingException e) {
            throw new TerminalException("Parsing raw JSON order failed: " + e.getMessage());
        }
    }
}
