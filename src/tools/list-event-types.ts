/**
 * MCP tool: list_event_types
 *
 * Lists active event types via the Astrocal REST API. Always filters
 * to active event types only. Conditionally includes price fields
 * for paid event types.
 */

import { z } from "zod";
import type { AstrocalApiClient } from "../lib/api-client.js";
import { mapApiErrorToMcpError } from "../lib/error-mapper.js";

const inputSchema = z.object({});

/**
 * Executes the list_event_types MCP tool.
 *
 * @param input - Raw input from the MCP tool call (validated with Zod).
 * @param client - Astrocal API client instance.
 * @returns List of active event types with human-readable summary.
 */
export async function listEventTypes(input: unknown, client: AstrocalApiClient) {
  inputSchema.parse(input);

  try {
    const result = await client.listEventTypes({ active: true, limit: 100 });

    const eventTypes = result.data.map((et) => {
      const base = {
        id: et.id,
        title: et.title,
        slug: et.slug,
        description: et.description,
        duration_minutes: et.duration_minutes,
      };

      // Only include price fields for paid event types
      if (et.price_amount != null) {
        return {
          ...base,
          price_amount: et.price_amount,
          price_currency: et.price_currency,
        };
      }

      return base;
    });

    const count = eventTypes.length;
    const message =
      count === 0
        ? "No event types available."
        : `Found ${count} event type${count === 1 ? "" : "s"} available for booking.`;

    return {
      event_types: eventTypes,
      message,
    };
  } catch (error) {
    if (error instanceof z.ZodError) throw error;
    const mcpError = mapApiErrorToMcpError(error);
    throw new Error(mcpError.message);
  }
}
