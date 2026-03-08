#!/usr/bin/env node

/**
 * Astrocal MCP Server
 *
 * Provides scheduling tools for AI agents via the Model Context Protocol.
 * Thin wrapper around the Astrocal REST API — all business logic lives
 * in the API layer.
 *
 * Configure with environment variables:
 *   ASTROCAL_API_KEY              - API key for authentication (required)
 *   ASTROCAL_API_URL              - Base URL of the Astrocal API (default: https://api.astrocal.dev)
 *   ASTROCAL_DEFAULT_EVENT_TYPE_ID - Optional default event type for tool calls
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { loadConfig } from "./lib/config.js";
import { AstrocalApiClient } from "./lib/api-client.js";
import {
  initTelemetry,
  trackToolInvocation,
  captureToolException,
  trackServerStarted,
  shutdownTelemetry,
} from "./lib/telemetry.js";
import { checkAvailability } from "./tools/check-availability.js";
import { createBooking } from "./tools/create-booking.js";
import { cancelBooking } from "./tools/cancel-booking.js";
import { rescheduleBooking } from "./tools/reschedule-booking.js";
import { listBookings } from "./tools/list-bookings.js";
import { listEventTypes } from "./tools/list-event-types.js";
import { joinWaitlist } from "./tools/join-waitlist.js";
import { checkWaitlist } from "./tools/check-waitlist.js";

const config = loadConfig();
const apiClient = new AstrocalApiClient(config.apiUrl, config.apiKey);

const server = new Server(
  {
    name: "astrocal-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// ─── List Tools ────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "check_availability",
      description:
        "Check available time slots for booking a meeting. Returns a list of available " +
        "date/time windows for the specified event type. Use this before creating a booking " +
        "to find suitable times. Always check availability first to avoid booking conflicts.",
      inputSchema: {
        type: "object" as const,
        properties: {
          event_type_id: {
            type: "string",
            description:
              "ID of the event type to check availability for. Optional if ASTROCAL_DEFAULT_EVENT_TYPE_ID is set.",
          },
          start_date: {
            type: "string",
            description: "Start of the date range to check (ISO 8601 date, e.g., '2026-03-15')",
          },
          end_date: {
            type: "string",
            description: "End of the date range to check (ISO 8601 date, e.g., '2026-03-22')",
          },
          timezone: {
            type: "string",
            description:
              "IANA timezone for the availability results (e.g., 'America/New_York'). Defaults to UTC.",
          },
          duration: {
            type: "number",
            description:
              "Duration in minutes for variable-duration event types. If the event type supports " +
              "multiple durations (e.g., 15/30/60 min), specify which duration to check availability for.",
          },
        },
        required: ["start_date", "end_date"],
      },
    },
    {
      name: "create_booking",
      description:
        "Book a meeting at a specific time. The invitee will receive a calendar invitation " +
        "at the provided email address. Always check availability first using check_availability " +
        "to ensure the slot is open. Provide the invitee's name, email, and preferred timezone " +
        "for accurate calendar invitations.",
      inputSchema: {
        type: "object" as const,
        properties: {
          event_type_id: {
            type: "string",
            description:
              "ID of the event type to book. Optional if ASTROCAL_DEFAULT_EVENT_TYPE_ID is set.",
          },
          start_time: {
            type: "string",
            description:
              "Start time for the booking (ISO 8601 datetime, e.g., '2026-03-15T14:00:00Z')",
          },
          invitee_name: {
            type: "string",
            description: "Full name of the person booking the meeting",
          },
          invitee_email: {
            type: "string",
            description: "Email address of the invitee (will receive calendar invitation)",
          },
          invitee_timezone: {
            type: "string",
            description:
              "IANA timezone of the invitee (e.g., 'America/Los_Angeles'). Defaults to UTC.",
          },
          duration: {
            type: "number",
            description:
              "Duration in minutes for variable-duration event types. Must match one of the " +
              "event type's allowed durations.",
          },
          notes: {
            type: "string",
            description: "Optional notes or context for the meeting (max 1000 characters)",
          },
        },
        required: ["start_time", "invitee_name", "invitee_email"],
      },
    },
    {
      name: "cancel_booking",
      description:
        "Cancel an existing booking. The invitee will be notified via email. " +
        "This action cannot be undone. Returns the updated booking with status 'cancelled'. " +
        "Cancelling an already-cancelled booking is safe and returns success.",
      inputSchema: {
        type: "object" as const,
        properties: {
          booking_id: {
            type: "string",
            description: "The ID of the booking to cancel",
          },
          reason: {
            type: "string",
            description:
              "Optional reason for cancellation (will be included in the notification email, max 500 characters)",
          },
        },
        required: ["booking_id"],
      },
    },
    {
      name: "reschedule_booking",
      description:
        "Reschedule an existing booking to a new time. Check availability first using " +
        "check_availability to find an open slot. The invitee will be notified of the " +
        "change via email. Returns the updated booking with the new time.",
      inputSchema: {
        type: "object" as const,
        properties: {
          booking_id: {
            type: "string",
            description: "The ID of the booking to reschedule",
          },
          new_start_time: {
            type: "string",
            description:
              "The new start time in ISO 8601 format (e.g., '2026-03-21T15:00:00Z'). " +
              "Must be an available slot — check availability first.",
          },
          reason: {
            type: "string",
            description:
              "Optional reason for rescheduling (will be included in the notification email, max 500 characters)",
          },
        },
        required: ["booking_id", "new_start_time"],
      },
    },
    {
      name: "list_bookings",
      description:
        "List bookings. Use this to see what meetings are scheduled. " +
        "Returns bookings sorted by start time. Defaults to 10 results. " +
        "Filter by status or event type to narrow results.",
      inputSchema: {
        type: "object" as const,
        properties: {
          status: {
            type: "string",
            enum: ["confirmed", "cancelled", "pending_payment"],
            description: "Filter by booking status. Omit to include all statuses.",
          },
          limit: {
            type: "number",
            description: "Maximum number of bookings to return (default: 10, max: 100)",
          },
          event_type_id: {
            type: "string",
            description: "Filter by event type ID to see bookings for a specific meeting type",
          },
        },
      },
    },
    {
      name: "list_event_types",
      description:
        "List available event types that can be booked. Each event type has a title, " +
        "duration, and optional price. Use this to discover what types of meetings are " +
        "available before checking availability or creating a booking.",
      inputSchema: {
        type: "object" as const,
        properties: {},
      },
    },
    {
      name: "join_waitlist",
      description:
        "Join the waitlist for a fully-booked event type. When a slot opens up (via " +
        "cancellation), the invitee is automatically promoted to a confirmed booking and " +
        "notified. Use this when check_availability shows no available slots but the event " +
        "type has waitlist enabled. Optionally specify a preferred time slot.",
      inputSchema: {
        type: "object" as const,
        properties: {
          event_type_id: {
            type: "string",
            description:
              "ID of the event type to join the waitlist for. Optional if ASTROCAL_DEFAULT_EVENT_TYPE_ID is set.",
          },
          invitee_name: {
            type: "string",
            description: "Full name of the person joining the waitlist",
          },
          invitee_email: {
            type: "string",
            description: "Email address of the invitee (will receive notifications)",
          },
          invitee_timezone: {
            type: "string",
            description:
              "IANA timezone of the invitee (e.g., 'America/Los_Angeles'). Defaults to UTC.",
          },
          start_time: {
            type: "string",
            description:
              "Preferred time slot (ISO 8601 datetime). If omitted, the invitee will be " +
              "promoted to any slot that opens up.",
          },
          duration_minutes: {
            type: "number",
            description: "Preferred duration in minutes for variable-duration event types.",
          },
          notes: {
            type: "string",
            description: "Optional notes or context (max 1000 characters)",
          },
        },
        required: ["invitee_name", "invitee_email"],
      },
    },
    {
      name: "check_waitlist",
      description:
        "Check waitlist entries for an event type or get the status of a specific entry. " +
        "Use this to report on an invitee's waitlist position or to see who is waiting. " +
        "Filter by status (waiting, promoted, expired, cancelled).",
      inputSchema: {
        type: "object" as const,
        properties: {
          event_type_id: {
            type: "string",
            description:
              "ID of the event type to check waitlist for. Optional if entry_id is provided.",
          },
          entry_id: {
            type: "string",
            description:
              "Specific waitlist entry ID to look up. If provided, returns just that entry.",
          },
          status: {
            type: "string",
            enum: ["waiting", "promoted", "expired", "cancelled"],
            description: "Filter by waitlist entry status. Defaults to all statuses.",
          },
          limit: {
            type: "number",
            description: "Maximum number of entries to return (default: 10, max: 100)",
          },
        },
      },
    },
  ],
}));

// ─── Handle Tool Calls ─────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const startTime = Date.now();

  try {
    let result: unknown;
    switch (name) {
      case "check_availability":
        result = await checkAvailability(args, apiClient, config);
        break;
      case "create_booking":
        result = await createBooking(args, apiClient, config);
        break;
      case "cancel_booking":
        result = await cancelBooking(args, apiClient);
        break;
      case "reschedule_booking":
        result = await rescheduleBooking(args, apiClient);
        break;
      case "list_bookings":
        result = await listBookings(args, apiClient);
        break;
      case "list_event_types":
        result = await listEventTypes(args, apiClient);
        break;
      case "join_waitlist":
        result = await joinWaitlist(args, apiClient, config);
        break;
      case "check_waitlist":
        result = await checkWaitlist(args, apiClient, config);
        break;
      default:
        trackToolInvocation(name, false, Date.now() - startTime, "UnknownTool");
        return {
          content: [{ type: "text" as const, text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }

    trackToolInvocation(name, true, Date.now() - startTime);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    const errorType = error instanceof Error ? error.constructor.name : "UnknownError";

    trackToolInvocation(name, false, Date.now() - startTime, errorType);
    captureToolException(error, name, errorType);

    return {
      content: [
        {
          type: "text" as const,
          text: `Error: ${error instanceof Error ? error.message : "An unexpected error occurred."}`,
        },
      ],
      isError: true,
    };
  }
});

// ─── Start Server ──────────────────────────────────────────────────

async function main() {
  initTelemetry();

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Astrocal MCP Server running on stdio");

  trackServerStarted();
}

// Graceful shutdown: flush telemetry events
const shutdown = async () => {
  await shutdownTelemetry();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

main().catch((error) => {
  console.error("Failed to start Astrocal MCP Server:", error);
  process.exit(1);
});
