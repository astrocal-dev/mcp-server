/**
 * MCP tool: check_waitlist
 *
 * Lists waitlist entries for an event type or checks the status of a
 * specific entry. Useful for agents to report on waitlist position or
 * find entries for a given invitee.
 */

import { z } from "zod";
import type { AstrocalApiClient, WaitlistEntryResponse } from "../lib/api-client.js";
import type { AstrocalConfig } from "../lib/config.js";
import { mapApiErrorToMcpError } from "../lib/error-mapper.js";

const inputSchema = z.object({
  event_type_id: z.string().optional(),
  entry_id: z.string().optional(),
  status: z.enum(["waiting", "promoted", "expired", "cancelled"]).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

/**
 * Formats a waitlist entry into a human-readable summary line.
 */
function formatEntry(entry: WaitlistEntryResponse): string {
  const slot = entry.start_time
    ? new Date(entry.start_time).toLocaleString("en-US", { timeZone: "UTC" })
    : "any slot";
  return `#${entry.position} ${entry.invitee_name} (${entry.invitee_email}) — ${entry.status} — ${slot}`;
}

/**
 * Executes the check_waitlist MCP tool.
 *
 * @param input - Raw input from the MCP tool call (validated with Zod).
 * @param client - Astrocal API client instance.
 * @param config - Server configuration (for default event type ID).
 * @returns Waitlist entries with human-readable summary.
 */
export async function checkWaitlist(
  input: unknown,
  client: AstrocalApiClient,
  config: AstrocalConfig,
) {
  const parsed = inputSchema.parse(input);

  try {
    // If a specific entry ID is provided, fetch just that entry
    if (parsed.entry_id) {
      const entry = await client.getWaitlistEntry(parsed.entry_id);
      return {
        entries: [entry],
        total: 1,
        message: `Waitlist entry ${entry.id}: ${formatEntry(entry)}`,
      };
    }

    // Otherwise, list entries for the event type
    const eventTypeId = parsed.event_type_id || config.defaultEventTypeId;
    if (!eventTypeId) {
      throw new Error("event_type_id is required (or set ASTROCAL_DEFAULT_EVENT_TYPE_ID)");
    }

    const result = await client.listWaitlistEntries({
      event_type_id: eventTypeId,
      status: parsed.status,
      limit: parsed.limit ?? 10,
    });

    const entries = result.data;

    if (entries.length === 0) {
      const statusInfo = parsed.status ? ` with status "${parsed.status}"` : "";
      return {
        entries: [],
        total: 0,
        message: `No waitlist entries found${statusInfo}.`,
      };
    }

    const lines = entries.map(formatEntry);
    const moreInfo = result.has_more ? " (more entries available)" : "";

    return {
      entries,
      total: entries.length,
      has_more: result.has_more,
      message: `Found ${entries.length} waitlist entries${moreInfo}:\n${lines.join("\n")}`,
    };
  } catch (error) {
    if (error instanceof z.ZodError) throw error;
    const mcpError = mapApiErrorToMcpError(error);
    throw new Error(mcpError.message);
  }
}
