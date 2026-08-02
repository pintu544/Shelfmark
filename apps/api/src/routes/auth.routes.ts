import argon2 from "argon2";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import type { AppEnv } from "../config/env.js";
import { clearSessionCookie, createSessionToken, setSessionCookie } from "../auth/session.js";
import { AppError } from "../lib/app-error.js";
import { normalizeEmail, normalizeWhitespace } from "../lib/normalization.js";
import { parseWithSchema } from "../lib/validation.js";
import { getAuthenticatedUserId, requireAuthentication } from "../middleware/auth.js";
import { User, serializeUser } from "../models/user.model.js";

const normalizedName = z
  .string({ required_error: "Name is required." })
  .transform(normalizeWhitespace)
  .pipe(z.string().min(2, "Name must contain at least 2 characters.").max(80));

const normalizedEmail = z
  .string({ required_error: "Email is required." })
  .trim()
  .max(254)
  .email("Enter a valid email address.")
  .transform(normalizeEmail);

const signupSchema = z
  .object({
    name: normalizedName,
    email: normalizedEmail,
    password: z
      .string({ required_error: "Password is required." })
      .min(8, "Password must contain at least 8 characters.")
      .max(128, "Password must contain at most 128 characters."),
  })
  .strict();

const loginSchema = z
  .object({
    email: normalizedEmail,
    password: z.string({ required_error: "Password is required." }).min(1).max(128),
  })
  .strict();

const hashOptions = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

// Unknown accounts still perform one Argon2 verification so email existence is not exposed by work.
const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$m8uuRdtBT2s8wLHlUr3JuQ$jV5krk90Ebm5CoDVXKaPXTrHHftYwtj96fQu2zfQUVk";

export function createAuthRouter(env: AppEnv): Router {
  const router = Router();
  const requireAuth = requireAuthentication(env);
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1_000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_request, response) => {
      response.status(429).json({
        error: {
          code: "AUTH_RATE_LIMITED",
          message: "Too many authentication attempts. Please try again later.",
        },
      });
    },
  });

  router.post("/signup", authLimiter, async (request, response) => {
    const input = parseWithSchema(signupSchema, request.body);
    const passwordHash = await argon2.hash(input.password, hashOptions);
    const user = await User.create({
      name: input.name,
      email: input.email,
      passwordHash,
    });

    setSessionCookie(response, createSessionToken(user._id.toString(), env), env);
    response.status(201).json({ user: serializeUser(user) });
  });

  router.post("/login", authLimiter, async (request, response) => {
    const input = parseWithSchema(loginSchema, request.body);
    const user = await User.findOne({ email: input.email }).select("+passwordHash");
    const isValid = await argon2.verify(user?.passwordHash ?? DUMMY_PASSWORD_HASH, input.password);

    if (!user || !isValid) {
      throw new AppError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
    }

    setSessionCookie(response, createSessionToken(user._id.toString(), env), env);
    response.json({ user: serializeUser(user) });
  });

  router.get("/me", requireAuth, async (request, response) => {
    const userId = getAuthenticatedUserId(request);
    const user = await User.findById(userId);

    if (!user) {
      clearSessionCookie(response, env);
      throw new AppError(401, "INVALID_SESSION", "Your session is invalid or has expired.");
    }

    response.json({ user: serializeUser(user) });
  });

  router.post("/logout", (_request, response) => {
    clearSessionCookie(response, env);
    response.status(204).end();
  });

  return router;
}
