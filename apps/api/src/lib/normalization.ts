export function normalizeWhitespace(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}

export function normalizeEmail(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}

export function normalizeAuthorKey(value: string): string {
  return normalizeWhitespace(value).toLocaleLowerCase("en-US");
}

export function normalizeTag(value: string): string {
  return normalizeWhitespace(value).toLocaleLowerCase("en-US");
}

export function normalizeTags(values: string[]): string[] {
  return [...new Set(values.map(normalizeTag))];
}
