import { describe, it, expect } from "vitest";
import { mapApiErrorToMcpError } from "./error-mapper";
import { ApiError, TimeoutError, NetworkError } from "./api-client";

describe("mapApiErrorToMcpError", () => {
  describe("HTTP status codes", () => {
    it("maps 400 to invalid_input", () => {
      const error = new ApiError(400, { error: { code: "bad_request", message: "Bad request" } });
      const result = mapApiErrorToMcpError(error);
      expect(result.code).toBe("invalid_input");
      expect(result.message).toBe("Bad request");
    });

    it("maps 400 with no message to default", () => {
      const error = new ApiError(400, null);
      const result = mapApiErrorToMcpError(error);
      expect(result.code).toBe("invalid_input");
      expect(result.message).toBe("Invalid input. Please check your parameters.");
    });

    it("maps 401 to unauthorized", () => {
      const error = new ApiError(401, { error: { code: "unauthorized", message: "Unauthorized" } });
      const result = mapApiErrorToMcpError(error);
      expect(result.code).toBe("unauthorized");
      expect(result.message).toBe(
        "Invalid API key. Please check your ASTROCAL_API_KEY configuration.",
      );
    });

    it("maps 404 to not_found", () => {
      const error = new ApiError(404, {
        error: { code: "not_found", message: "Event type not found" },
      });
      const result = mapApiErrorToMcpError(error);
      expect(result.code).toBe("not_found");
      expect(result.message).toBe("Event type not found");
    });

    it("maps 404 with no message to default", () => {
      const error = new ApiError(404, null);
      const result = mapApiErrorToMcpError(error);
      expect(result.code).toBe("not_found");
      expect(result.message).toBe("Resource not found.");
    });

    it("maps 409 to slot_unavailable", () => {
      const error = new ApiError(409, { error: { code: "conflict", message: "Slot taken" } });
      const result = mapApiErrorToMcpError(error);
      expect(result.code).toBe("slot_unavailable");
      expect(result.message).toContain("no longer available");
    });

    it("maps 422 to validation_error", () => {
      const error = new ApiError(422, {
        error: { code: "validation", message: "Invalid timezone" },
      });
      const result = mapApiErrorToMcpError(error);
      expect(result.code).toBe("validation_error");
      expect(result.message).toBe("Invalid timezone");
    });

    it("maps 422 with no message to default", () => {
      const error = new ApiError(422, null);
      const result = mapApiErrorToMcpError(error);
      expect(result.code).toBe("validation_error");
      expect(result.message).toBe("Validation error. Please check your input.");
    });

    it("maps 500 to server_error", () => {
      const error = new ApiError(500, null);
      const result = mapApiErrorToMcpError(error);
      expect(result.code).toBe("server_error");
      expect(result.message).toContain("experiencing issues");
    });

    it("maps 503 to server_error", () => {
      const error = new ApiError(503, null);
      const result = mapApiErrorToMcpError(error);
      expect(result.code).toBe("server_error");
    });

    it("maps unknown status to api_error", () => {
      const error = new ApiError(418, null);
      const result = mapApiErrorToMcpError(error);
      expect(result.code).toBe("api_error");
      expect(result.message).toContain("418");
    });
  });

  describe("network errors", () => {
    it("maps TimeoutError to timeout", () => {
      const result = mapApiErrorToMcpError(new TimeoutError());
      expect(result.code).toBe("timeout");
      expect(result.message).toContain("Unable to connect");
    });

    it("maps NetworkError to network_error", () => {
      const result = mapApiErrorToMcpError(new NetworkError());
      expect(result.code).toBe("network_error");
      expect(result.message).toContain("Unable to connect");
    });
  });

  describe("unknown errors", () => {
    it("maps unknown Error to unknown_error with message", () => {
      const result = mapApiErrorToMcpError(new Error("Something weird happened"));
      expect(result.code).toBe("unknown_error");
      expect(result.message).toBe("Something weird happened");
    });

    it("maps non-Error to unknown_error with default message", () => {
      const result = mapApiErrorToMcpError("string error");
      expect(result.code).toBe("unknown_error");
      expect(result.message).toBe("An unexpected error occurred.");
    });
  });
});
