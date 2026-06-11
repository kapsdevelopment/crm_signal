import assert from "node:assert/strict";
import { once } from "node:events";
import { request } from "node:http";
import test from "node:test";
import { createCrmServer } from "./server.js";
import type {
  AccountDetail,
  AccountSummary,
  CreateAccountFromSignalInput,
  CrmApiService,
  CrmSignalDto,
  TenantContext,
} from "./types.js";

const account: AccountSummary = {
  id: "account-1",
  organizationId: "organization-1",
  orgnr: "923456789",
  name: "Nordic Field Systems AS",
  municipalityName: "Oslo",
  naceCode: "62.010",
  naceDescription: "Programmeringstjenester",
  roles: ["prospect"],
  ownerName: "Ken",
  source: "signal",
  updatedAt: "2026-06-11T10:00:00.000Z",
};

const signal: CrmSignalDto = {
  id: "signal-link-1",
  generatedSignalId: "generated-signal-1",
  organizationId: "organization-1",
  linkedAccountId: "account-1",
  orgnr: "923456789",
  organizationName: "Nordic Field Systems AS",
  title: "Nytt funn",
  reason: "Matcher ICP.",
  score: 86,
  status: "acted_on",
  observedAt: "2026-06-11T10:00:00.000Z",
};

class FakeCrmApiService implements CrmApiService {
  public readonly seenContexts: TenantContext[] = [];
  public createInput: CreateAccountFromSignalInput | null = null;

  async listAccounts(context: TenantContext): Promise<AccountSummary[]> {
    this.seenContexts.push(context);
    return [account];
  }

  async getAccount(
    context: TenantContext,
    accountId: string,
  ): Promise<AccountDetail | null> {
    this.seenContexts.push(context);

    if (accountId !== account.id) {
      return null;
    }

    return {
      ...account,
      contacts: [],
      deals: [],
      activities: [],
      notes: [],
      signals: [signal],
    };
  }

  async listSignals(context: TenantContext): Promise<CrmSignalDto[]> {
    this.seenContexts.push(context);
    return [signal];
  }

  async createAccountFromSignal(
    context: TenantContext,
    input: CreateAccountFromSignalInput,
  ): Promise<AccountDetail> {
    this.seenContexts.push(context);
    this.createInput = input;
    return {
      ...account,
      contacts: [],
      deals: [],
      activities: [],
      notes: [],
      signals: [signal],
    };
  }
}

type TestResponse = {
  statusCode: number;
  body: unknown;
};

async function withServer<T>(
  service: CrmApiService,
  run: (baseUrl: URL) => Promise<T>,
): Promise<T> {
  const server = createCrmServer(service);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();

  if (address === null || typeof address === "string") {
    throw new Error("Expected TCP server address.");
  }

  try {
    return await run(new URL(`http://127.0.0.1:${address.port}`));
  } finally {
    server.close();
    await once(server, "close");
  }
}

async function jsonRequest(
  baseUrl: URL,
  options: {
    method?: string;
    path: string;
    body?: unknown;
    tenant?: string;
  },
): Promise<TestResponse> {
  const body =
    options.body === undefined ? undefined : JSON.stringify(options.body);

  return await new Promise<TestResponse>((resolve, reject) => {
    const req = request(
      new URL(options.path, baseUrl),
      {
        method: options.method ?? "GET",
        headers: {
          ...(body ? { "content-type": "application/json" } : {}),
          ...(options.tenant ? { "x-tenant-slug": options.tenant } : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          resolve({
            statusCode: res.statusCode ?? 0,
            body: text ? JSON.parse(text) : null,
          });
        });
      },
    );
    req.on("error", reject);

    if (body) {
      req.write(body);
    }

    req.end();
  });
}

test("GET /crm/accounts returns accounts for tenant header", async () => {
  const service = new FakeCrmApiService();

  await withServer(service, async (baseUrl) => {
    const response = await jsonRequest(baseUrl, {
      path: "/crm/accounts",
      tenant: "local-demo",
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, { data: [account] });
    assert.deepEqual(service.seenContexts, [{ slug: "local-demo" }]);
  });
});

test("POST /crm/accounts/from-signal validates and forwards signal id", async () => {
  const service = new FakeCrmApiService();

  await withServer(service, async (baseUrl) => {
    const response = await jsonRequest(baseUrl, {
      method: "POST",
      path: "/crm/accounts/from-signal?tenant=local-demo",
      body: { signalId: "generated-signal-1" },
    });

    assert.equal(response.statusCode, 201);
    assert.equal(service.createInput?.signalId, "generated-signal-1");
    assert.deepEqual(service.seenContexts, [{ slug: "local-demo" }]);
  });
});

test("unknown account returns 404 envelope", async () => {
  const service = new FakeCrmApiService();

  await withServer(service, async (baseUrl) => {
    const response = await jsonRequest(baseUrl, {
      path: "/crm/accounts/missing",
    });

    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.body, {
      error: {
        code: "not_found",
        message: "Account 'missing' not found.",
      },
    });
  });
});
