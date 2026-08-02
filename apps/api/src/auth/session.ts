import type { Response } from "express";
import jwt from "jsonwebtoken";
import type { AppEnv } from "../config/env.js";
import {
  JWT_AUDIENCE,
  JWT_ISSUER,
  SESSION_COOKIE_NAME,
  SESSION_DURATION_SECONDS,
} from "../constants.js";

export function createSessionToken(userId: string, env: AppEnv): string {
  return jwt.sign({}, env.JWT_SECRET, {
    algorithm: "HS256",
    audience: JWT_AUDIENCE,
    expiresIn: SESSION_DURATION_SECONDS,
    issuer: JWT_ISSUER,
    subject: userId,
  });
}

export function verifySessionToken(token: string, env: AppEnv): string {
  const payload = jwt.verify(token, env.JWT_SECRET, {
    algorithms: ["HS256"],
    audience: JWT_AUDIENCE,
    issuer: JWT_ISSUER,
  });

  if (typeof payload === "string" || typeof payload.sub !== "string") {
    throw new jwt.JsonWebTokenError("Session subject is missing");
  }

  return payload.sub;
}

function baseCookieOptions(env: AppEnv) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    secure: env.NODE_ENV === "production",
  };
}

export function setSessionCookie(response: Response, token: string, env: AppEnv): void {
  response.cookie(SESSION_COOKIE_NAME, token, {
    ...baseCookieOptions(env),
    maxAge: SESSION_DURATION_SECONDS * 1_000,
  });
}

export function clearSessionCookie(response: Response, env: AppEnv): void {
  response.clearCookie(SESSION_COOKIE_NAME, baseCookieOptions(env));
}
