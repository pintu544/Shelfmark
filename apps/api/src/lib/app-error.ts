export type ErrorFields = Record<string, string>;

export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: ErrorFields;

  constructor(status: number, code: string, message: string, fields?: ErrorFields) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}
