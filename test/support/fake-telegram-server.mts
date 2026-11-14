import { once } from "node:events";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const MAX_CONTROL_BODY_BYTES = 1_048_576;

export interface FakeTelegramCall {
  method: string;
  token: string;
  payload: Record<string, unknown>;
  receivedAt: string;
}

export interface FakeTelegramFailure {
  httpStatus?: number;
  errorCode?: number;
  description?: string;
  retryAfter?: number;
}

export interface FakeTelegramServer {
  origin: string;
  calls(): FakeTelegramCall[];
  count(method: string): number;
  failNext(method: string, failure?: FakeTelegramFailure): void;
  delayNext(method: string, delayMs: number): void;
  reset(): void;
  close(): Promise<void>;
}

export async function startFakeTelegramServer(options: {
  host?: "127.0.0.1" | "::1" | "localhost";
  port?: number;
  botToken?: string;
} = {}): Promise<FakeTelegramServer> {
  const host = options.host ?? "127.0.0.1";
  const calls: FakeTelegramCall[] = [];
  const failures = new Map<string, FakeTelegramFailure[]>();
  const delays = new Map<string, number[]>();
  let messageId = 1;
  let inviteId = 1;

  const reset = () => {
    calls.length = 0;
    failures.clear();
    delays.clear();
    messageId = 1;
    inviteId = 1;
  };
  const failNext = (method: string, failure: FakeTelegramFailure = {}) => {
    const queued = failures.get(method) ?? [];
    queued.push(failure);
    failures.set(method, queued);
  };
  const delayNext = (method: string, delayMs: number) => {
    if (!Number.isFinite(delayMs) || delayMs < 0 || delayMs > 30_000) {
      throw new Error("Fake Telegram delay must be between 0 and 30000 ms");
    }
    const queued = delays.get(method) ?? [];
    queued.push(delayMs);
    delays.set(method, queued);
  };

  const server = createServer(async (request, response) => {
    try {
      await handleRequest(request, response, {
        expectedToken: options.botToken,
        calls,
        failures,
        delays,
        reset,
        failNext,
        delayNext,
        nextMessageId: () => messageId++,
        nextInviteId: () => inviteId++,
      });
    } catch (error) {
      sendJson(response, 500, {
        ok: false,
        error_code: 500,
        description: error instanceof Error ? error.message : "Fake Telegram server error",
      });
    }
  });

  server.listen(options.port ?? 0, host);
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    await closeServer(server);
    throw new Error("Fake Telegram server did not expose a TCP address");
  }
  const displayHost = address.family === "IPv6" ? `[${address.address}]` : address.address;
  const origin = `http://${displayHost}:${address.port}`;

  return {
    origin,
    calls: () => calls.map((call) => ({ ...call, payload: { ...call.payload } })),
    count: (method) => calls.filter((call) => call.method === method).length,
    failNext,
    delayNext,
    reset,
    close: () => closeServer(server),
  };
}

interface HandlerState {
  expectedToken?: string;
  calls: FakeTelegramCall[];
  failures: Map<string, FakeTelegramFailure[]>;
  delays: Map<string, number[]>;
  reset(): void;
  failNext(method: string, failure?: FakeTelegramFailure): void;
  delayNext(method: string, delayMs: number): void;
  nextMessageId(): number;
  nextInviteId(): number;
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  state: HandlerState,
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://fake-telegram.local");

  if (request.method === "GET" && url.pathname === "/__test__/health") {
    sendJson(response, 200, { ok: true });
    return;
  }
  if (request.method === "GET" && url.pathname === "/__test__/state") {
    sendJson(response, 200, {
      ok: true,
      counts: methodCounts(state.calls),
      calls: state.calls,
    });
    return;
  }
  if (request.method === "POST" && url.pathname === "/__test__/reset") {
    await readPayload(request);
    state.reset();
    sendJson(response, 200, { ok: true });
    return;
  }
  if (request.method === "POST" && url.pathname === "/__test__/fail-next") {
    const payload = await readPayload(request);
    const method = requiredString(payload.method, "method");
    state.failNext(method, {
      httpStatus: optionalNumber(payload.httpStatus),
      errorCode: optionalNumber(payload.errorCode),
      description: optionalString(payload.description),
      retryAfter: optionalNumber(payload.retryAfter),
    });
    sendJson(response, 200, { ok: true });
    return;
  }
  if (request.method === "POST" && url.pathname === "/__test__/delay-next") {
    const payload = await readPayload(request);
    state.delayNext(
      requiredString(payload.method, "method"),
      requiredNumber(payload.delayMs, "delayMs"),
    );
    sendJson(response, 200, { ok: true });
    return;
  }

  const match = url.pathname.match(/^\/bot([^/]+)\/([A-Za-z][A-Za-z0-9_]*)$/);
  if (!match || request.method !== "POST") {
    sendJson(response, 404, { ok: false, error_code: 404, description: "Unknown fake Telegram route" });
    return;
  }

  const token = decodeURIComponent(match[1]);
  const method = match[2];
  const payload = await readPayload(request);
  state.calls.push({ method, token, payload, receivedAt: new Date().toISOString() });

  if (state.expectedToken && token !== state.expectedToken) {
    sendJson(response, 401, { ok: false, error_code: 401, description: "Unauthorized" });
    return;
  }

  const delay = shiftQueued(state.delays, method);
  if (delay !== undefined) {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, delay));
  }
  const failure = shiftQueued(state.failures, method);
  if (failure) {
    sendJson(response, failure.httpStatus ?? 500, {
      ok: false,
      error_code: failure.errorCode ?? failure.httpStatus ?? 500,
      description: failure.description ?? "Injected fake Telegram failure",
      ...(failure.retryAfter === undefined
        ? {}
        : { parameters: { retry_after: failure.retryAfter } }),
    });
    return;
  }

  sendTelegramSuccess(response, method, payload, state);
}

function sendTelegramSuccess(
  response: ServerResponse,
  method: string,
  payload: Record<string, unknown>,
  state: HandlerState,
): void {
  const botUser = {
    id: 999_000_001,
    is_bot: true,
    first_name: "Local Test Bot",
    username: "local_test_bot",
    can_join_groups: true,
    can_read_all_group_messages: true,
    supports_inline_queries: false,
  };

  if (method === "getMe") {
    sendJson(response, 200, { ok: true, result: botUser });
    return;
  }
  if (method === "sendMessage") {
    const chatId = payload.chat_id ?? 1;
    sendJson(response, 200, {
      ok: true,
      result: {
        message_id: state.nextMessageId(),
        date: Math.floor(Date.now() / 1_000),
        chat: {
          id: chatId,
          type: typeof chatId === "number" && chatId < 0 ? "supergroup" : "private",
        },
        text: optionalString(payload.text) ?? "",
      },
    });
    return;
  }
  if (method === "getChat") {
    const chatId = payload.chat_id ?? -100_000_000_001;
    sendJson(response, 200, {
      ok: true,
      result: { id: chatId, type: "supergroup", title: "Local Test VIP" },
    });
    return;
  }
  if (method === "getChatMember") {
    sendJson(response, 200, {
      ok: true,
      result: {
        status: "administrator",
        user: botUser,
        can_invite_users: true,
        can_restrict_members: true,
      },
    });
    return;
  }
  if (method === "createChatInviteLink") {
    const id = state.nextInviteId();
    sendJson(response, 200, {
      ok: true,
      result: {
        invite_link: `https://t.me/+local-test-${id}`,
        creator: botUser,
        creates_join_request: false,
        is_primary: false,
        is_revoked: false,
        name: optionalString(payload.name) ?? "VIP Access",
        member_limit: optionalNumber(payload.member_limit) ?? 1,
        expire_date: optionalNumber(payload.expire_date),
      },
    });
    return;
  }
  if (["banChatMember", "unbanChatMember", "answerCallbackQuery"].includes(method)) {
    sendJson(response, 200, { ok: true, result: true });
    return;
  }

  sendJson(response, 404, {
    ok: false,
    error_code: 404,
    description: `Unsupported fake Telegram method: ${method}`,
  });
}

async function readPayload(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const rawChunk of request) {
    const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk as Uint8Array);
    size += chunk.byteLength;
    if (size > MAX_CONTROL_BODY_BYTES) {
      throw new Error("Fake Telegram request body is too large");
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};

  const raw = Buffer.concat(chunks).toString("utf8");
  const contentType = request.headers["content-type"] ?? "";
  if (contentType.includes("application/json") || raw.trimStart().startsWith("{")) {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("Fake Telegram JSON body must be an object");
    }
    return parsed as Record<string, unknown>;
  }
  if (contentType.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(raw));
  }
  return { raw };
}

function methodCounts(calls: FakeTelegramCall[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const call of calls) counts[call.method] = (counts[call.method] ?? 0) + 1;
  return counts;
}

function shiftQueued<T>(queue: Map<string, T[]>, method: string): T | undefined {
  const values = queue.get(method);
  const value = values?.shift();
  if (values?.length === 0) queue.delete(method);
  return value;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function requiredNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} must be a number`);
  return value;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  if (response.headersSent || response.destroyed) return;
  const encoded = Buffer.from(JSON.stringify(body), "utf8");
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": String(encoded.byteLength),
    "cache-control": "no-store",
  });
  response.end(encoded);
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => error ? rejectClose(error) : resolveClose());
    server.closeIdleConnections();
    server.closeAllConnections();
  });
}

const isMain = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href === import.meta.url
  : false;

if (isMain) {
  const port = Number.parseInt(process.env.FAKE_TELEGRAM_PORT ?? "4010", 10);
  const fake = await startFakeTelegramServer({
    port: Number.isFinite(port) ? port : 4010,
    botToken: process.env.TELEGRAM_BOT_TOKEN,
  });
  console.log(JSON.stringify({ ok: true, origin: fake.origin }));

  const stop = async () => {
    await fake.close();
    process.exit(0);
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}
