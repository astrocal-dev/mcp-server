/**
 * MCP tool: list_bookings
 *
 * Lists bookings via the Astrocal REST API with optional filters.
 * Returns a simplified view suitable for AI agent context — strips
 * internal fields like org_id and cancel_token.
 */

import { z } from "zod";
import type { AstrocalApiClient } from "../lib/api-client.js";
import { mapApiErrorToMcpError } from "../lib/error-mapper.js";

const inputSchema = z.object({
  status: z.enum(["confirmed", "cancelled", "pending_payment"]).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  event_type_id: z.string().optional(),
});

/**
 * Executes the list_bookings MCP tool.
 *
 * @param input - Raw input from the MCP tool call (validated with Zod).
 * @param client - Astrocal API client instance.
 * @returns List of bookings with human-readable summary message.
 */
export async function listBookings(input: unknown, client: AstrocalApiClient) {
  const parsed = inputSchema.parse(input);

  try {
    const result = await client.listBookings({
      status: parsed.status,
      limit: parsed.limit ?? 10,
      event_type_id: parsed.event_type_id,
    });

    const bookings = result.data.map((b) => ({
      id: b.id,
      start_time: b.start_time,
      end_time: b.end_time,
      status: b.status,
      invitee_name: b.invitee_name,
      invitee_email: b.invitee_email,
    }));

    const count = bookings.length;
    const message =
      count === 0
        ? "No bookings found."
        : `Found ${count} booking${count === 1 ? "" : "s"}.${result.has_more ? " More results available — increase the limit to see them." : ""}`;

    return {
      bookings,
      has_more: result.has_more,
      message,
    };
  } catch (error) {
    if (error instanceof z.ZodError) throw error;
    const mcpError = mapApiErrorToMcpError(error);
    throw new Error(mcpError.message);
  }
}
