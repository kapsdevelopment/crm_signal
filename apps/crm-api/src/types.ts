export type TenantContext = {
  slug: string;
};

export type AccountRole =
  | "prospect"
  | "customer"
  | "supplier"
  | "partner"
  | "competitor"
  | "other";

export type AccountSummary = {
  id: string;
  organizationId: string;
  orgnr: string;
  name: string;
  municipalityName: string | null;
  naceCode: string | null;
  naceDescription: string | null;
  roles: AccountRole[];
  ownerName: string | null;
  source: "manual" | "signal" | "import";
  updatedAt: string;
};

export type ContactDto = {
  id: string;
  fullName: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
};

export type DealDto = {
  id: string;
  title: string;
  stageName: string;
  valueAmount: string | null;
  currency: string;
  status: string;
  ownerName: string | null;
};

export type ActivityDto = {
  id: string;
  title: string;
  body: string | null;
  activityType: string;
  status: string;
  dueAt: string | null;
  ownerName: string | null;
};

export type NoteDto = {
  id: string;
  body: string;
  authorName: string | null;
  createdAt: string;
};

export type CrmSignalDto = {
  id: string;
  generatedSignalId: string;
  organizationId: string;
  linkedAccountId: string | null;
  orgnr: string;
  organizationName: string;
  title: string;
  reason: string;
  score: number;
  status: "new" | "seen" | "acted_on" | "dismissed";
  observedAt: string;
};

export type AccountDetail = AccountSummary & {
  contacts: ContactDto[];
  deals: DealDto[];
  activities: ActivityDto[];
  notes: NoteDto[];
  signals: CrmSignalDto[];
};

export type CreateAccountFromSignalInput = {
  signalId: string;
};

export type CrmApiService = {
  listAccounts(context: TenantContext): Promise<AccountSummary[]>;
  getAccount(context: TenantContext, accountId: string): Promise<AccountDetail | null>;
  listSignals(context: TenantContext): Promise<CrmSignalDto[]>;
  createAccountFromSignal(
    context: TenantContext,
    input: CreateAccountFromSignalInput,
  ): Promise<AccountDetail>;
};
