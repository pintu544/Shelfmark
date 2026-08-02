import type { ErrorRequestHandler, RequestHandler } from "express";
import { AppError } from "../lib/app-error.js";

interface MongoDuplicateError extends Error {
  code?: number;
}

interface BodyParserError extends SyntaxError {
  type?: string;
}

export const notFoundHandler: RequestHandler = (_request, _response, next) => {
  next(new AppError(404, "ROUTE_NOT_FOUND", "The requested endpoint does not exist."));
};

export const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
  void _next;
  if (error instanceof AppError) {
    response.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.fields ? { fields: error.fields } : {}),
      },
    });
    return;
  }

  if ((error as MongoDuplicateError)?.code === 11_000) {
    response.status(409).json({
      error: {
        code: "EMAIL_IN_USE",
        message: "An account with that email already exists.",
        fields: { email: "Email is already in use." },
      },
    });
    return;
  }

  if ((error as BodyParserError)?.type === "entity.parse.failed") {
    response.status(400).json({
      error: {
        code: "INVALID_JSON",
        message: "The request body must contain valid JSON.",
      },
    });
    return;
  }

  if ((error as BodyParserError)?.type === "entity.too.large") {
    response.status(413).json({
      error: {
        code: "BODY_TOO_LARGE",
        message: "The request body is too large.",
      },
    });
    return;
  }

  if (process.env.NODE_ENV !== "test") {
    console.error(error);
  }

  response.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Something went wrong. Please try again.",
    },
  });
};
