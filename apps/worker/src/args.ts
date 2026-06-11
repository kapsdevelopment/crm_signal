export type ParsedArgs = Record<string, string | boolean>;

export function parseArgs(args: string[]): ParsedArgs {
  const parsed: ParsedArgs = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg.startsWith("--")) {
      continue;
    }

    const withoutPrefix = arg.slice(2);
    const inlineSeparatorIndex = withoutPrefix.indexOf("=");

    if (inlineSeparatorIndex !== -1) {
      const key = withoutPrefix.slice(0, inlineSeparatorIndex);
      const value = withoutPrefix.slice(inlineSeparatorIndex + 1);
      parsed[key] = value;
      continue;
    }

    const next = args[index + 1];

    if (next && !next.startsWith("--")) {
      parsed[withoutPrefix] = next;
      index += 1;
      continue;
    }

    parsed[withoutPrefix] = true;
  }

  return parsed;
}

export function getStringArg(
  args: ParsedArgs,
  key: string,
  defaultValue: string,
): string {
  const value = args[key];
  return typeof value === "string" ? value : defaultValue;
}

export function getNumberArg(
  args: ParsedArgs,
  key: string,
  defaultValue: number,
): number {
  const value = args[key];

  if (typeof value !== "string") {
    return defaultValue;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`--${key} must be a positive integer`);
  }

  return parsed;
}
