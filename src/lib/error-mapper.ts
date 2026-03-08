/**
 * Maps API errors and network errors to human-readable MCP error messages.
 *
 * Translates HTTP status codes, timeout errors, and network failures into
 * messages that AI agents can communicate naturally to users.
 */

import { ApiError, TimeoutError, NetworkError } from "./api-client.js";

/** Structured MCP error with a machine-readable code and human-readable message. */
export interface McpError {
  readonly code: string;
  readonly message: string;
}

/**
 * Maps an error from the API client to a human-readable MCP error.
 *
 * @param error - Error from the API client (ApiError, TimeoutError, NetworkError, or unknown).
 * @returns Structured error with code and message suitable for MCP tool responses.
 */
export function mapApiErrorToMcpError(error: unknown): McpError {
  if (error instanceof ApiError) {
    return mapHttpStatusToError(error.status, error.body);
  }

  if (error instanceof TimeoutError) {
    return {
      code: "timeout",
      message: "Unable to connect to Astrocal API. Please try again later.",
    };
  }

  if (error instanceof NetworkError) {
    return {
      code: "network_error",
      message:
        "Unable to connect to Astrocal API. Please check your network connection and ASTROCAL_API_URL configuration.",
    };
  }

  return {
    code: "unknown_error",
    message: error instanceof Error ? error.message : "An unexpected error occurred.",
  };
}

function mapHttpStatusToError(status: number, body: unknown): McpError {
  const apiMessage = extractApiMessage(body);

  switch (status) {
    case 400:
      return {
        code: "invalid_input",
        message: apiMessage || "Invalid input. Please check your parameters.",
      };
    case 401:
      return {
        code: "unauthorized",
        message: "Invalid API key. Please check your ASTROCAL_API_KEY configuration.",
      };
    case 404:
      return {
        code: "not_found",
        message: apiMessage || "Resource not found.",
      };
    case 409:
      return {
        code: "slot_unavailable",
        message:
          "The selected time slot is no longer available. Please check availability and try a different time.",
      };
    case 422:
      return {
        code: "validation_error",
        message: apiMessage || "Validation error. Please check your input.",
      };
    default:
      if (status >= 500) {
        return {
          code: "server_error",
          message: "Astrocal API is experiencing issues. Please try again later.",
        };
      }
      return {
        code: "api_error",
        message: apiMessage || `API responded with status ${status}.`,
      };
  }
}

function extractApiMessage(body: unknown): string | undefined {
  if (body && typeof body === "object" && "error" in body) {
    const err = (body as { error: unknown }).error;
    if (err && typeof err === "object" && "message" in err) {
      return (err as { message: string }).message;
    }
  }
  return undefined;
}
