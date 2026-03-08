/**
 * MCP tool: cancel_booking
 *
 * Cancels an existing booking via the Astrocal REST API. Idempotent —
 * cancelling an already-cancelled booking returns success with the
 * existing cancelled_at timestamp.
 */

import { z } from "zod";
import type { AstrocalApiClient } from "../lib/api-client.js";
import { mapApiErrorToMcpError } from "../lib/error-mapper.js";

const MAX_REASON_LENGTH = 500;

const inputSchema = z.object({
  booking_id: z.string().min(1, "booking_id is required"),
  reason: z.string().optional(),
});

/**
 * Executes the cancel_booking MCP tool.
 *
 * @param input - Raw input from the MCP tool call (validated with Zod).
 * @param client - Astrocal API client instance.
 * @returns Cancelled booking with human-readable message.
 */
export async function cancelBooking(input: unknown, client: AstrocalApiClient) {
  const parsed = inputSchema.parse(input);

  // Truncate reason instead of rejecting (better LLM UX)
  const reason = parsed.reason ? parsed.reason.slice(0, MAX_REASON_LENGTH) : undefined;

  try {
    const booking = await client.cancelBooking(parsed.booking_id, { reason });

    return {
      booking: {
        id: booking.id,
        status: booking.status,
        cancelled_at: booking.cancelled_at,
      },
      message: "Booking cancelled successfully. The invitee has been notified.",
    };
  } catch (error) {
    if (error instanceof z.ZodError) throw error;
    const mcpError = mapApiErrorToMcpError(error);
    throw new Error(mcpError.message);
  }
}
