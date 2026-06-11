import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { badRequest, HttpError, notFound } from "./errors.js";
import type {
  CreateAccountFromSignalInput,
  CrmApiService,
  TenantContext,
} from "./types.js";

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

const defaultTenantSlug = "local-demo";

function writeJson(
  response: ServerResponse,
  statusCode: number,
  payload: JsonValue,
): void {
  response.writeHead(statusCode, {
    "access-control-allow-headers": "content-type,x-tenant-slug",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-origin": "*",
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

function tenantContext(request: IncomingMessage, url: URL): TenantContext {
  const headerValue = request.headers["x-tenant-slug"];
  const headerSlug = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  const querySlug = url.searchParams.get("tenant");
  const slug = (headerSlug ?? querySlug ?? defaultTenantSlug).trim();

  if (!slug) {
    throw badRequest("Tenant slug cannot be empty.");
  }

  return { slug };
}

function routeSegments(url: URL): string[] {
  return url.pathname.split("/").filter(Boolean);
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;

    if (size > 1024 * 1024) {
      throw badRequest("Request body is too large.");
    }

    chunks.push(buffer);
  }

  if (chunks.length === 0) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw badRequest("Request body must be valid JSON.");
  }
}

function createAccountFromSignalInput(value: unknown): CreateAccountFromSignalInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw badRequest("Request body must be a JSON object.");
  }

  const signalId = (value as { signalId?: unknown }).signalId;
  if (typeof signalId !== "string" || !signalId.trim()) {
    throw badRequest("Missing required field: signalId.");
  }

  return { signalId: signalId.trim() };
}

function errorPayload(error: unknown): { statusCode: number; payload: JsonValue } {
  if (error instanceof HttpError) {
    return {
      statusCode: error.statusCode,
      payload: {
        error: {
          code: error.code,
          message: error.message,
        },
      },
    };
  }

  return {
    statusCode: 500,
    payload: {
      error: {
        code: "internal_error",
        message: "Unexpected CRM API error.",
      },
    },
  };
}

export function createCrmRequestHandler(service: CrmApiService) {
  return async function handleRequest(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");

      if (request.method === "OPTIONS") {
        writeJson(response, 204, null);
        return;
      }

      if (request.method === "GET" && url.pathname === "/health") {
        writeJson(response, 200, { status: "ok", service: "crm-api" });
        return;
      }

      const segments = routeSegments(url);
      const context = tenantContext(request, url);

      if (request.method === "GET" && segments.length === 2) {
        if (segments[0] === "crm" && segments[1] === "accounts") {
          writeJson(response, 200, {
            data: await service.listAccounts(context),
          });
          return;
        }

        if (segments[0] === "crm" && segments[1] === "signals") {
          writeJson(response, 200, {
            data: await service.listSignals(context),
          });
          return;
        }
      }

      if (
        request.method === "GET" &&
        segments.length === 3 &&
        segments[0] === "crm" &&
        segments[1] === "accounts"
      ) {
        const account = await service.getAccount(context, segments[2]);
        if (!account) {
          throw notFound(`Account '${segments[2]}' not found.`);
        }

        writeJson(response, 200, { data: account });
        return;
      }

      if (
        request.method === "POST" &&
        segments.length === 3 &&
        segments[0] === "crm" &&
        segments[1] === "accounts" &&
        segments[2] === "from-signal"
      ) {
        const input = createAccountFromSignalInput(await readJsonBody(request));
        writeJson(response, 201, {
          data: await service.createAccountFromSignal(context, input),
        });
        return;
      }

      throw notFound("Route not found.");
    } catch (error) {
      const { statusCode, payload } = errorPayload(error);
      writeJson(response, statusCode, payload);
    }
  };
}

export function createCrmServer(service: CrmApiService) {
  return createServer(createCrmRequestHandler(service));
}
