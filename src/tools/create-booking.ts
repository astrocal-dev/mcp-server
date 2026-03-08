/**
 * MCP tool: create_booking
 *
 * Books a meeting at a specific time via the Astrocal REST API.
 * Validates input, creates the booking, and returns a human-readable
 * confirmation message suitable for AI agent responses.
 */

import { z } from "zod";
import type { AstrocalApiClient, CreateBookingParams } from "../lib/api-client.js";
import { mapApiErrorToMcpError } from "../lib/error-mapper.js";
import type { AstrocalConfig } from "../lib/config.js";

const MAX_NOTES_LENGTH = 1000;

const attendeeSchema = z.object({
  name: z.string().min(1, "Attendee name is required"),
  email: z.string().email("Invalid email format"),
  timezone: z.string().optional(),
});

const inputSchema = z.object({
  event_type_id: z.string().optional(),
  start_time: z.string().datetime({ message: "Must be ISO 8601 datetime" }),
  invitee_name: z.string().min(1, "Invitee name is required").optional(),
  invitee_email: z.string().email("Invalid email format").optional(),
  invitee_timezone: z.string().optional(),
  duration: z.number().int().min(5).max(480).optional(),
  attendees: z.array(attendeeSchema).min(1).max(100).optional(),
  notes: z.string().optional(),
});

/**
 * Executes the create_booking MCP tool.
 *
 * @param input - Raw input from the MCP tool call (validated with Zod).
 * @param client - Astrocal API client instance.
 * @param config - Server configuration (for default event type ID).
 * @returns Booking confirmation with human-readable message.
 * @throws {Error} If event_type_id is missing and no default is configured.
 */
export async function createBooking(
  input: unknown,
  client: AstrocalApiClient,
  config: AstrocalConfig,
) {
  const parsed = inputSchema.parse(input);

  const eventTypeId = parsed.event_type_id || config.defaultEventTypeId;
  if (!eventTypeId) {
    throw new Error("event_type_id is required (or set ASTROCAL_DEFAULT_EVENT_TYPE_ID)");
  }

  // Truncate notes instead of rejecting (better LLM UX)
  const notes = parsed.notes ? parsed.notes.slice(0, MAX_NOTES_LENGTH) : undefined;

  try {
    // Build request body — support both single invitee and multi-attendee
    let requestBody: CreateBookingParams;
    if (parsed.attendees && parsed.attendees.length > 0) {
      requestBody = {
        event_type_id: eventTypeId,
        start_time: parsed.start_time,
        attendees: parsed.attendees.map((a) => ({
          name: a.name,
          email: a.email,
          timezone: a.timezone || "UTC",
        })),
        duration: parsed.duration,
        notes,
      };
    } else {
      if (!parsed.invitee_name || !parsed.invitee_email) {
        throw new Error("Either invitee_name + invitee_email or attendees array is required");
      }
      requestBody = {
        event_type_id: eventTypeId,
        start_time: parsed.start_time,
        invitee_name: parsed.invitee_name,
        invitee_email: parsed.invitee_email,
        invitee_timezone: parsed.invitee_timezone || "UTC",
        duration: parsed.duration,
        notes,
      };
    }

    const booking = await client.createBooking(requestBody);

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

    const attendeeCount = parsed.attendees?.length ?? 1;
    const message =
      attendeeCount > 1
        ? `Group meeting confirmed for ${dateStr} at ${timeStr} UTC ` +
          `with ${attendeeCount} attendees. ` +
          `Calendar invitations have been sent.`
        : `Meeting confirmed for ${dateStr} at ${timeStr} UTC ` +
          `with ${booking.invitee_name} (${booking.invitee_email}). ` +
          `A calendar invitation has been sent.`;

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
