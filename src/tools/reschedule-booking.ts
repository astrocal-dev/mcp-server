/**
 * MCP tool: reschedule_booking
 *
 * Reschedules an existing booking to a new time via the Astrocal REST API.
 * The invitee is notified of the change via email. Always check availability
 * first to ensure the new time slot is open.
 */

import { z } from "zod";
import type { AstrocalApiClient } from "../lib/api-client.js";
import { mapApiErrorToMcpError } from "../lib/error-mapper.js";

const MAX_REASON_LENGTH = 500;

const inputSchema = z.object({
  booking_id: z.string().min(1, "booking_id is required"),
  new_start_time: z.string().datetime({ message: "Must be ISO 8601 datetime" }),
  reason: z.string().optional(),
});

/**
 * Executes the reschedule_booking MCP tool.
 *
 * @param input - Raw input from the MCP tool call (validated with Zod).
 * @param client - Astrocal API client instance.
 * @returns Rescheduled booking with human-readable message.
 */
export async function rescheduleBooking(input: unknown, client: AstrocalApiClient) {
  const parsed = inputSchema.parse(input);

  const reason = parsed.reason ? parsed.reason.slice(0, MAX_REASON_LENGTH) : undefined;

  try {
    const booking = await client.rescheduleBooking(parsed.booking_id, {
      new_start_time: parsed.new_start_time,
      reason,
    });

    const startDate = new Date(booking.start_time);
    const dateStr = startDate.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });
    const timeStr = startDate.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "UTC",
    });

    const message =
      `Booking rescheduled to ${dateStr} at ${timeStr} UTC ` +
      `with ${booking.invitee_name} (${booking.invitee_email}). ` +
      `The invitee has been notified.`;

    return {
      booking: {
        id: booking.id,
        start_time: booking.start_time,
        end_time: booking.end_time,
        status: booking.status,
        invitee_name: booking.invitee_name,
        invitee_email: booking.invitee_email,
      },
      message,
    };
  } catch (error) {
    if (error instanceof z.ZodError) throw error;
    const mcpError = mapApiErrorToMcpError(error);
    throw new Error(mcpError.message);
  }
}
