import type { ZodType } from "zod";
import { AppError, type ErrorFields } from "./app-error.js";

export function parseWithSchema<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);

  if (result.success) {
    return result.data;
  }

  const fields: ErrorFields = {};
  for (const issue of result.error.issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "form";
    fields[key] ??= issue.message;
  }

  throw new AppError(400, "VALIDATION_ERROR", "Please correct the highlighted fields.", fields);
}
