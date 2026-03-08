/**
 * MCP tool: check_availability
 *
 * Checks available time slots for booking a meeting. Calls the Astrocal
 * REST API to get availability and enriches the response with event type
 * metadata (title, duration) for better LLM context.
 */

import { z } from "zod";
import type { AstrocalApiClient } from "../lib/api-client.js";
import { mapApiErrorToMcpError } from "../lib/error-mapper.js";
import type { AstrocalConfig } from "../lib/config.js";

const inputSchema = z.object({
  event_type_id: z.string().optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be ISO 8601 date (YYYY-MM-DD)"),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be ISO 8601 date (YYYY-MM-DD)"),
  timezone: z.string().optional(),
  duration: z.number().int().min(5).max(480).optional(),
});

/**
 * Executes the check_availability MCP tool.
 *
 * @param input - Raw input from the MCP tool call (validated with Zod).
 * @param client - Astrocal API client instance.
 * @param config - Server configuration (for default event type ID).
 * @returns Available slots with event type metadata.
 * @throws {Error} If event_type_id is missing and no default is configured.
 */
export async function checkAvailability(
  input: unknown,
  client: AstrocalApiClient,
  config: AstrocalConfig,
) {
  const parsed = inputSchema.parse(input);

  const eventTypeId = parsed.event_type_id || config.defaultEventTypeId;
  if (!eventTypeId) {
    throw new Error("event_type_id is required (or set ASTROCAL_DEFAULT_EVENT_TYPE_ID)");
  }

  const timezone = parsed.timezone || "UTC";

  try {
    // Fetch availability and event type info in parallel
    const [availability, eventType] = await Promise.all([
      client.checkAvailability({
        event_type_id: eventTypeId,
        start: parsed.start_date,
        end: parsed.end_date,
        timezone,
        duration: parsed.duration,
      }),
      client.getEventType(eventTypeId),
    ]);

    // Map slots to include duration and capacity info
    const availableSlots = availability.slots.map((slot) => {
      const startMs = new Date(slot.start_time).getTime();
      const endMs = new Date(slot.end_time).getTime();
      const durationMinutes = Math.round((endMs - startMs) / 60_000);

      const mapped: Record<string, unknown> = {
        start: slot.start_time,
        end: slot.end_time,
        duration_minutes: durationMinutes,
      };

      // Include capacity info when available (group event types)
      const slotAny = slot as Record<string, unknown>;
      if (slotAny.spots_remaining != null) {
        mapped.spots_remaining = slotAny.spots_remaining;
      }
      if (slotAny.total_capacity != null) {
        mapped.total_capacity = slotAny.total_capacity;
      }

      return mapped;
    });

    return {
      available_slots: availableSlots,
      capped: availability.capped === true,
      event_type: {
        title: eventType.title,
        duration_minutes: eventType.duration_minutes,
        duration_options: eventType.duration_options,
      },
    };
  } catch (error) {
    if (error instanceof z.ZodError) throw error;
    const mcpError = mapApiErrorToMcpError(error);
    throw new Error(mcpError.message);
  }
}
