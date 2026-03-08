/**
 * MCP tool: join_waitlist
 *
 * Adds an invitee to the waitlist for a fully-booked event type.
 * When a slot opens up (e.g., via cancellation), the invitee is
 * auto-promoted to a confirmed booking.
 */

import { z } from "zod";
import type { AstrocalApiClient } from "../lib/api-client.js";
import type { AstrocalConfig } from "../lib/config.js";
import { mapApiErrorToMcpError } from "../lib/error-mapper.js";

const MAX_NOTES_LENGTH = 1000;

const inputSchema = z.object({
  event_type_id: z.string().optional(),
  invitee_name: z.string().min(1, "Invitee name is required"),
  invitee_email: z.string().email("Invalid email format"),
  invitee_timezone: z.string().optional(),
  start_time: z.string().datetime({ message: "Must be ISO 8601 datetime" }).optional(),
  duration_minutes: z.number().int().min(5).max(480).optional(),
  notes: z.string().optional(),
});

/**
 * Executes the join_waitlist MCP tool.
 *
 * @param input - Raw input from the MCP tool call (validated with Zod).
 * @param client - Astrocal API client instance.
 * @param config - Server configuration (for default event type ID).
 * @returns Waitlist entry confirmation with human-readable message.
 */
export async function joinWaitlist(
  input: unknown,
  client: AstrocalApiClient,
  config: AstrocalConfig,
) {
  const parsed = inputSchema.parse(input);

  const eventTypeId = parsed.event_type_id || config.defaultEventTypeId;
  if (!eventTypeId) {
    throw new Error("event_type_id is required (or set ASTROCAL_DEFAULT_EVENT_TYPE_ID)");
  }

  const notes = parsed.notes ? parsed.notes.slice(0, MAX_NOTES_LENGTH) : undefined;

  try {
    const entry = await client.createWaitlistEntry({
      event_type_id: eventTypeId,
      invitee_name: parsed.invitee_name,
      invitee_email: parsed.invitee_email,
      invitee_timezone: parsed.invitee_timezone || "UTC",
      start_time: parsed.start_time,
      duration_minutes: parsed.duration_minutes,
      notes,
    });

    const expiresDate = new Date(entry.expires_at);
    const expiresStr = expiresDate.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });

    const slotInfo = entry.start_time
      ? `for the slot at ${new Date(entry.start_time).toLocaleString("en-US", { timeZone: "UTC" })}`
      : "for any available slot";

    return {
      waitlist_entry: {
        id: entry.id,
        position: entry.position,
        status: entry.status,
        expires_at: entry.expires_at,
      },
      message:
        `${parsed.invitee_name} has been added to the waitlist at position #${entry.position} ` +
        `${slotInfo}. ` +
        `If a spot opens up, they will be automatically booked and notified. ` +
        `The waitlist entry expires on ${expiresStr}.`,
    };
  } catch (error) {
    if (error instanceof z.ZodError) throw error;
    const mcpError = mapApiErrorToMcpError(error);
    throw new Error(mcpError.message);
  }
}
