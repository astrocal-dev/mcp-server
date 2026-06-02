# @astrocal/mcp-server

**Give your AI agents the power to schedule meetings.** The official [Model Context Protocol](https://modelcontextprotocol.io) server for [Astrocal](https://astrocal.dev) — the API-first scheduling platform built for developers and AI agents.

Works with Claude Desktop, Cursor, Windsurf, and any MCP-compatible client. Your AI assistant can check availability, book meetings, cancel, reschedule, and manage waitlists — all through natural conversation.

[Get your API key](https://astrocal.dev/dashboard/api-keys) | [Documentation](https://astrocal.dev/docs) | [API Reference](https://astrocal.dev/docs/api-reference)

## Why Astrocal for AI Agents?

- **Purpose-built for AI** — Not a Calendly bolt-on. Astrocal's [scheduling API](https://astrocal.dev/docs/api-reference) was designed from day one for programmatic and AI-agent access.
- **8 tools, zero config** — Check availability, book, cancel, reschedule, list event types, manage waitlists. Everything an agent needs.
- **Calendar sync built in** — Connects to Google Calendar, Microsoft 365, and CalDAV. Your agent books against real availability.
- **Payments included** — [Stripe Connect integration](https://astrocal.dev/docs/guides/payments) means your agent can book paid consultations, not just free meetings.
- **Sandbox mode** — Test with `ac_test_*` keys. No emails sent, no calendar events created, no charges made.

## Quick Start

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "astrocal": {
      "command": "npx",
      "args": ["-y", "@astrocal/mcp-server"],
      "env": {
        "ASTROCAL_API_KEY": "ac_live_xxxxxxxxxxxxx"
      }
    }
  }
}
```

Restart Claude Desktop and the scheduling tools will be available immediately.

### Other MCP Clients

Install globally:

```bash
npm install -g @astrocal/mcp-server
```

Run:

```bash
ASTROCAL_API_KEY=ac_live_xxx astrocal-mcp
```

## Environment Variables

| Variable                         | Required | Description                                                               |
| -------------------------------- | -------- | ------------------------------------------------------------------------- |
| `ASTROCAL_API_KEY`               | Yes      | Your Astrocal API key ([get one free](https://astrocal.dev/signup))       |
| `ASTROCAL_API_URL`               | No       | API base URL (default: `https://api.astrocal.dev`)                        |
| `ASTROCAL_DEFAULT_EVENT_TYPE_ID` | No       | Default event type ID — your agent won't need to specify it on every call |

## Available Tools

### `check_availability`

Check available time slots for booking.

- `event_type_id` (string, optional) — Event type to check. Optional if `ASTROCAL_DEFAULT_EVENT_TYPE_ID` is set.
- `start_date` (string, required) — Start date in ISO 8601 format (e.g., `2026-03-15`)
- `end_date` (string, required) — End date in ISO 8601 format (e.g., `2026-03-22`)
- `timezone` (string, optional) — IANA timezone (e.g., `America/New_York`). Defaults to UTC.

### `create_booking`

Book a meeting at a specific time.

- `event_type_id` (string, optional) — Event type to book. Optional if default is set.
- `start_time` (string, required) — ISO 8601 datetime (e.g., `2026-03-15T14:00:00Z`)
- `invitee_name` (string, required) — Full name of the person booking
- `invitee_email` (string, required) — Email address for calendar invitation
- `invitee_timezone` (string, optional) — IANA timezone. Defaults to UTC.
- `notes` (string, optional) — Meeting notes (max 1000 characters)

### `cancel_booking`

Cancel an existing booking. The invitee receives a cancellation email automatically.

- `booking_id` (string, required) — ID of the booking to cancel
- `reason` (string, optional) — Cancellation reason (max 500 characters)

### `reschedule_booking`

Reschedule a booking to a new time. Check availability first.

- `booking_id` (string, required) — ID of the booking to reschedule
- `new_start_time` (string, required) — New time in ISO 8601 format
- `reason` (string, optional) — Reason for rescheduling (max 500 characters)

### `list_bookings`

List bookings with optional filters.

- `status` (string, optional) — Filter: `confirmed`, `cancelled`, or `pending_payment`
- `limit` (number, optional) — Max results (default: 10, max: 100)
- `event_type_id` (string, optional) — Filter by event type

### `list_event_types`

List available event types that can be booked. No input required.

### `join_waitlist`

Join the waitlist when all slots are full.

- `event_type_id` (string, required) — Event type to join the waitlist for
- `name` (string, required) — Full name
- `email` (string, required) — Email address
- `preferred_times` (string, optional) — Preferred time ranges or notes

### `check_waitlist`

Check your position on a waitlist.

- `waitlist_entry_id` (string, required) — Waitlist entry ID returned from `join_waitlist`

## Example Conversation

> **User:** "What meetings can I book?"
>
> **Agent:** _calls `list_event_types`_ — "You have two event types: a 30-minute consultation (free) and a 1-hour strategy session ($50)."
>
> **User:** "Check if next Tuesday at 2pm is free for a consultation"
>
> **Agent:** _calls `check_availability`_ — "Tuesday at 2pm is available."
>
> **User:** "Book it for jane@example.com"
>
> **Agent:** _calls `create_booking`_ — "Done! Meeting confirmed for Tuesday, March 17 at 2:00 PM UTC with Jane. A calendar invitation has been sent."
>
> **User:** "Actually, move it to 3pm"
>
> **Agent:** _calls `reschedule_booking`_ — "Rescheduled to 3:00 PM. Jane has been notified."

## Part of the Astrocal Platform

This MCP server is one of several ways to integrate with [Astrocal](https://astrocal.dev):

- **[REST API](https://astrocal.dev/docs/api-reference)** — Full scheduling API with OpenAPI 3.1 spec
- **[React SDK](https://www.npmjs.com/package/@astrocal/react)** (`@astrocal/react`) — Typed hooks, provider, and booking widget for React apps
- **[Embeddable Widget](https://www.npmjs.com/package/@astrocal/widget)** (`@astrocal/widget`) — Drop-in booking UI for any website
- **[Dashboard](https://astrocal.dev/dashboard)** — Manage event types, bookings, team members, and billing
- **[Webhooks](https://astrocal.dev/docs/guides/webhooks)** — Real-time notifications for booking events

[Create a free account](https://astrocal.dev/signup) to get started.

## Links

- [Astrocal Website](https://astrocal.dev)
- [Documentation](https://astrocal.dev/docs)
- [API Reference](https://astrocal.dev/docs/api-reference)
- [Dashboard](https://astrocal.dev/dashboard)
- [GitHub](https://github.com/astrocal-dev/mcp-server)
- [Issues](https://github.com/astrocal-dev/mcp-server/issues)

## License

MIT
