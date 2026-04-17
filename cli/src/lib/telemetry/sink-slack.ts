// Mycelium Framework — VibeSpace LLC — The network provides.
//
// Slack webhook sink for alerting.
//
// Posts alert payloads to Slack via incoming webhook using Block Kit formatting.
// Environment-gated: returns immediately if MYCELIUM_SLACK_WEBHOOK is not set.
// Never throws — all errors are caught and logged to stderr.
//
// Frozen contract dependency: NUTRIENTS.md §7 (AlertPayload).

import type { AlertPayload } from "./alert-triggers.js";

/**
 * Severity-to-emoji map for Block Kit header.
 */
const SEVERITY_EMOJI: Record<AlertPayload["severity"], string> = {
  info: ":large_blue_circle:",
  warn: ":large_yellow_circle:",
  error: ":red_circle:",
  critical: ":rotating_light:",
};

/**
 * Severity-to-color map for Slack attachment sidebar.
 */
const SEVERITY_COLOR: Record<AlertPayload["severity"], string> = {
  info: "#0066cc",
  warn: "#ffcc00",
  error: "#cc0000",
  critical: "#ff0000",
};

/**
 * Build Block Kit JSON payload for Slack webhook.
 */
function buildBlockKitPayload(payload: AlertPayload): object {
  const emoji = SEVERITY_EMOJI[payload.severity];
  const color = SEVERITY_COLOR[payload.severity];

  // Truncate detail to fit Slack's 3000 char limit for text blocks
  const detailTruncated =
    payload.detail.length > 2900
      ? payload.detail.slice(0, 2900) + "\n\n_...truncated_"
      : payload.detail;

  const blocks: object[] = [
    // Header with severity emoji
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `${emoji} ${payload.title}`,
        emoji: true,
      },
    },
    // Context: organism, run_id, source
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `*Organism:* ${payload.organism} | *Run:* \`${payload.run_id}\` | *Source:* ${payload.source}`,
        },
      ],
    },
    // Divider
    { type: "divider" },
    // Detail as markdown section
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: detailTruncated,
      },
    },
  ];

  // Add leaf/biome context if present
  if (payload.leaf_id || payload.biome) {
    const contextParts: string[] = [];
    if (payload.leaf_id) contextParts.push(`*Leaf:* \`${payload.leaf_id}\``);
    if (payload.biome) contextParts.push(`*Biome:* ${payload.biome}`);

    blocks.splice(2, 0, {
      type: "context",
      elements: [{ type: "mrkdwn", text: contextParts.join(" | ") }],
    });
  }

  // Add event log link if present
  if (payload.event_log_url) {
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `<${payload.event_log_url}|View Event Log>`,
        },
      ],
    });
  }

  return {
    // Fallback text for notifications
    text: `[${payload.severity.toUpperCase()}] ${payload.title}`,
    // Attachment with color sidebar (classic style, still works)
    attachments: [
      {
        color,
        blocks,
      },
    ],
  };
}

/**
 * Post an alert payload to Slack via webhook.
 *
 * - Returns immediately if MYCELIUM_SLACK_WEBHOOK env is not set.
 * - Uses native fetch with 5s timeout via AbortController.
 * - Never throws — catches all errors and logs to stderr.
 */
export async function postSlack(payload: AlertPayload): Promise<void> {
  const webhookUrl = process.env.MYCELIUM_SLACK_WEBHOOK;

  // Gate: no webhook configured
  if (!webhookUrl) {
    return;
  }

  // Validate URL format (basic check)
  if (!webhookUrl.startsWith("https://")) {
    console.error(
      "[mycelium/alerting] MYCELIUM_SLACK_WEBHOOK must be an HTTPS URL"
    );
    return;
  }

  const body = JSON.stringify(buildBlockKitPayload(payload));

  // AbortController for 5s timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      // Slack returns "ok" for success, error text otherwise
      const responseText = await response.text().catch(() => "");
      console.error(
        `[mycelium/alerting] Slack webhook returned ${response.status}: ${responseText}`
      );
    }
  } catch (err: unknown) {
    // Handle abort (timeout) specifically
    if (err instanceof Error && err.name === "AbortError") {
      console.error("[mycelium/alerting] Slack webhook timed out after 5s");
      return;
    }

    // Log all other errors
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[mycelium/alerting] Slack webhook failed: ${message}`);
  } finally {
    clearTimeout(timeoutId);
  }
}
