import type { LogEvent, LogGroup } from "../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function randomHex(len: number): string {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += ((Math.random() * 16) | 0).toString(16);
  }
  return out;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

let eventCounter = 0;
function nextEventId(): string {
  eventCounter += 1;
  return `demo-${eventCounter}-${randomHex(8)}`;
}

// ---------------------------------------------------------------------------
// Mock log groups
// ---------------------------------------------------------------------------

export const MOCK_LOG_GROUPS: LogGroup[] = [
  {
    name: "/aws/lambda/payment-service",
    arn: "arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/payment-service:*",
    stored_bytes: 52_428_800,
  },
  {
    name: "/aws/lambda/auth-handler",
    arn: "arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/auth-handler:*",
    stored_bytes: 31_457_280,
  },
  {
    name: "/aws/lambda/order-processor",
    arn: "arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/order-processor:*",
    stored_bytes: 78_643_200,
  },
  {
    name: "/aws/lambda/notification-sender",
    arn: "arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/notification-sender:*",
    stored_bytes: 15_728_640,
  },
];

// ---------------------------------------------------------------------------
// Stream names (per log group, cached)
// ---------------------------------------------------------------------------

const streamCache = new Map<string, string[]>();

function getStreams(logGroupName: string): string[] {
  if (!streamCache.has(logGroupName)) {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "/");
    const count = randomBetween(3, 5);
    const streams: string[] = [];
    for (let i = 0; i < count; i++) {
      streams.push(`${date}/[$LATEST]${randomHex(8)}`);
    }
    streamCache.set(logGroupName, streams);
  }
  return streamCache.get(logGroupName)!;
}

// ---------------------------------------------------------------------------
// Message templates
// ---------------------------------------------------------------------------

interface ServiceScenario {
  messages: Array<{
    level: string;
    message: string;
    extra?: Record<string, unknown>;
  }>;
}

const PAYMENT_SCENARIOS: ServiceScenario[] = [
  {
    messages: [
      {
        level: "INFO",
        message: "Processing payment",
        extra: { orderId: "ORD-{rand5}", amount: 99.99, currency: "USD" },
      },
      {
        level: "INFO",
        message: "Validating card details",
        extra: { cardLast4: "4242" },
      },
      {
        level: "DEBUG",
        message: "DynamoDB put item",
        extra: { table: "payments", status: "success" },
      },
      {
        level: "INFO",
        message: "Payment completed successfully",
        extra: { transactionId: "txn_{rand8}" },
      },
    ],
  },
  {
    messages: [
      {
        level: "INFO",
        message: "Processing refund",
        extra: { orderId: "ORD-{rand5}", amount: 49.95 },
      },
      { level: "INFO", message: "Refund initiated with payment provider" },
      {
        level: "INFO",
        message: "Refund completed",
        extra: { refundId: "ref_{rand8}" },
      },
    ],
  },
];

const AUTH_SCENARIOS: ServiceScenario[] = [
  {
    messages: [
      {
        level: "INFO",
        message: "Login attempt",
        extra: { email: "user@example.com", method: "password" },
      },
      {
        level: "DEBUG",
        message: "Cognito authentication",
        extra: { userPoolId: "us-east-1_AbCdEf" },
      },
      {
        level: "INFO",
        message: "Login successful",
        extra: { userId: "usr_{rand8}", sessionTTL: 3600 },
      },
    ],
  },
  {
    messages: [
      {
        level: "INFO",
        message: "Token refresh request",
        extra: { userId: "usr_{rand8}" },
      },
      { level: "DEBUG", message: "Validating refresh token" },
      { level: "INFO", message: "Token refreshed", extra: { expiresIn: 3600 } },
    ],
  },
];

const ORDER_SCENARIOS: ServiceScenario[] = [
  {
    messages: [
      {
        level: "INFO",
        message: "New order received",
        extra: { orderId: "ORD-{rand5}", items: 3, total: 247.5 },
      },
      {
        level: "INFO",
        message: "Inventory check passed",
        extra: { warehouse: "us-east-1a" },
      },
      {
        level: "DEBUG",
        message: "SQS message sent",
        extra: { queue: "fulfillment-queue", messageId: "msg_{rand8}" },
      },
      {
        level: "INFO",
        message: "Order confirmed",
        extra: { estimatedDelivery: "2026-02-15" },
      },
    ],
  },
  {
    messages: [
      {
        level: "INFO",
        message: "Order status update",
        extra: { orderId: "ORD-{rand5}", status: "shipped" },
      },
      {
        level: "DEBUG",
        message: "SNS notification published",
        extra: { topicArn: "arn:aws:sns:us-east-1:123456789012:order-updates" },
      },
    ],
  },
];

const NOTIFICATION_SCENARIOS: ServiceScenario[] = [
  {
    messages: [
      {
        level: "INFO",
        message: "Sending email notification",
        extra: { to: "customer@example.com", template: "order-confirmation" },
      },
      {
        level: "DEBUG",
        message: "SES send email",
        extra: { messageId: "ses_{rand8}" },
      },
      { level: "INFO", message: "Email sent successfully" },
    ],
  },
  {
    messages: [
      {
        level: "INFO",
        message: "Sending push notification",
        extra: { userId: "usr_{rand8}", platform: "ios" },
      },
      {
        level: "INFO",
        message: "Push delivered",
        extra: { deliveryId: "push_{rand8}" },
      },
    ],
  },
];

const SCENARIO_MAP: Record<string, ServiceScenario[]> = {
  "/aws/lambda/payment-service": PAYMENT_SCENARIOS,
  "/aws/lambda/auth-handler": AUTH_SCENARIOS,
  "/aws/lambda/order-processor": ORDER_SCENARIOS,
  "/aws/lambda/notification-sender": NOTIFICATION_SCENARIOS,
};

const ERROR_MESSAGES = [
  {
    level: "ERROR",
    message: "Payment declined",
    stack: `Error: Payment declined - insufficient funds
    at processPayment (src/handlers/payment.ts:45:11)
    at Runtime.handler (src/index.ts:12:5)
    at Runtime.handleOnceNonStreaming (file:///var/runtime/index.mjs:1173:29)`,
  },
  {
    level: "ERROR",
    message: "Connection timeout",
    stack: `Error: Connection timeout after 5000ms
    at DynamoDBClient.send (node_modules/@aws-sdk/client-dynamodb/dist-es/DynamoDBClient.js:56:15)
    at putItem (src/db/dynamo.ts:23:10)
    at Runtime.handler (src/index.ts:18:5)`,
  },
  {
    level: "WARN",
    message: "Rate limit approaching",
    extra: { currentRate: 850, limit: 1000, windowSec: 60 },
  },
  {
    level: "WARN",
    message: "Slow downstream response",
    extra: { service: "inventory-api", latencyMs: 2340, threshold: 1000 },
  },
];

// ---------------------------------------------------------------------------
// Invocation generator
// ---------------------------------------------------------------------------

function expandTemplate(s: string): string {
  return s
    .replace(/\{rand5\}/g, () => String(randomBetween(10000, 99999)))
    .replace(/\{rand8\}/g, () => randomHex(8));
}

interface Invocation {
  events: LogEvent[];
}

function generateInvocation(
  logGroupName: string,
  baseTimestamp: number,
  stream: string,
  isError: boolean,
): Invocation {
  const requestId = uuid();
  const events: LogEvent[] = [];
  let ts = baseTimestamp;

  // START
  events.push({
    timestamp: ts,
    message: `START RequestId: ${requestId} Version: $LATEST`,
    log_stream_name: stream,
    event_id: nextEventId(),
  });
  ts += randomBetween(1, 5);

  if (isError && Math.random() < 0.5) {
    // Error with stack trace
    const err = pick(ERROR_MESSAGES.filter((e) => e.level === "ERROR"));
    if (err) {
      events.push({
        timestamp: ts,
        message:
          err.stack ??
          JSON.stringify({ level: err.level, message: err.message }),
        log_stream_name: stream,
        event_id: nextEventId(),
      });
      ts += randomBetween(1, 3);
    }
  } else {
    // Normal scenario messages
    const scenarios = SCENARIO_MAP[logGroupName] ?? PAYMENT_SCENARIOS;
    const scenario = pick(scenarios);
    for (const msg of scenario.messages) {
      const json: Record<string, unknown> = {
        level: msg.level,
        message: expandTemplate(msg.message),
        requestId,
        traceId: `1-${randomHex(8)}-${randomHex(24)}`,
        clientIp: `${randomBetween(10, 203)}.${randomBetween(0, 255)}.${randomBetween(0, 255)}.${randomBetween(1, 254)}`,
        timestamp: new Date(ts).toISOString(),
      };
      if (msg.extra) {
        for (const [k, v] of Object.entries(msg.extra)) {
          json[k] = typeof v === "string" ? expandTemplate(v) : v;
        }
      }
      events.push({
        timestamp: ts,
        message: JSON.stringify(json),
        log_stream_name: stream,
        event_id: nextEventId(),
      });
      ts += randomBetween(5, 50);
    }

    // Occasional warning/error log within normal invocations
    if (isError) {
      const warn = pick(ERROR_MESSAGES.filter((e) => e.level === "WARN"));
      if (warn) {
        const json: Record<string, unknown> = {
          level: warn.level,
          message: expandTemplate(warn.message),
          requestId,
          ...warn.extra,
        };
        events.push({
          timestamp: ts,
          message: JSON.stringify(json),
          log_stream_name: stream,
          event_id: nextEventId(),
        });
        ts += randomBetween(5, 20);
      }
    }
  }

  // END
  events.push({
    timestamp: ts,
    message: `END RequestId: ${requestId}`,
    log_stream_name: stream,
    event_id: nextEventId(),
  });
  ts += 1;

  // REPORT
  const duration = ts - baseTimestamp + randomBetween(10, 200);
  const billedDuration = Math.ceil(duration / 100) * 100;
  const memorySize = pick([128, 256, 512, 1024]);
  const memoryUsed =
    isError && Math.random() < 0.2
      ? memorySize + randomBetween(10, 50) // OOM scenario
      : randomBetween(
          Math.floor(memorySize * 0.3),
          Math.floor(memorySize * 0.85),
        );

  events.push({
    timestamp: ts,
    message: `REPORT RequestId: ${requestId}\tDuration: ${duration.toFixed(2)} ms\tBilled Duration: ${billedDuration} ms\tMemory Size: ${memorySize} MB\tMax Memory Used: ${memoryUsed} MB`,
    log_stream_name: stream,
    event_id: nextEventId(),
  });

  return { events };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a batch of mock logs for a historical fetch.
 * Returns 50-200 events spread across the time range with complete Lambda invocations.
 */
export function generateMockLogs(
  logGroupName: string,
  startTime?: number,
  endTime?: number,
): LogEvent[] {
  const now = Date.now();
  const start = startTime ?? now - 15 * 60 * 1000;
  const end = endTime ?? now;
  const streams = getStreams(logGroupName);
  const invocationCount = randomBetween(8, 25);
  const allEvents: LogEvent[] = [];

  for (let i = 0; i < invocationCount; i++) {
    const baseTs =
      start +
      Math.floor(((end - start) / invocationCount) * i) +
      randomBetween(0, 1000);
    const stream = pick(streams);
    const isError = Math.random() < 0.1;
    const inv = generateInvocation(logGroupName, baseTs, stream, isError);
    allEvents.push(...inv.events);
  }

  // Sort by timestamp
  allEvents.sort((a, b) => a.timestamp - b.timestamp);
  return allEvents;
}

/**
 * Generate a small batch of mock logs for live tail simulation.
 * Returns 1 invocation (occasionally an error) with current timestamps.
 */
export function generateMockTailBatch(logGroupName: string): LogEvent[] {
  const streams = getStreams(logGroupName);
  const stream = pick(streams);
  const isError = Math.random() < 0.1;
  const inv = generateInvocation(logGroupName, Date.now(), stream, isError);
  return inv.events;
}
