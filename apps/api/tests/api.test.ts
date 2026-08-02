import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request, { type Test } from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { connectToDatabase, disconnectFromDatabase } from "../src/config/database.js";
import type { AppEnv } from "../src/config/env.js";
import {
  CLIENT_HEADER_NAME,
  CLIENT_HEADER_VALUE,
  JWT_AUDIENCE,
  JWT_ISSUER,
  SESSION_COOKIE_NAME,
} from "../src/constants.js";
import { Book } from "../src/models/book.model.js";
import { User } from "../src/models/user.model.js";

const env: AppEnv = {
  NODE_ENV: "test",
  PORT: 4_000,
  MONGODB_URI: "mongodb://placeholder/thumbstack-test",
  JWT_SECRET: "test-secret-with-at-least-thirty-two-characters",
  FRONTEND_ORIGIN: "http://localhost:3000",
};

let mongoServer: MongoMemoryServer | undefined;

function secure(test: Test): Test {
  return test
    .set("Origin", env.FRONTEND_ORIGIN)
    .set(CLIENT_HEADER_NAME, CLIENT_HEADER_VALUE);
}

async function signup(
  agent: ReturnType<typeof request.agent>,
  email = "reader@example.com",
  name = "Avid Reader",
) {
  return secure(
    agent.post("/api/auth/signup").send({
      name,
      email,
      password: "long-enough-password",
    }),
  );
}

async function addBook(
  agent: ReturnType<typeof request.agent>,
  overrides: Record<string, unknown> = {},
) {
  return secure(
    agent.post("/api/books").send({
      title: "A Book",
      author: "An Author",
      tags: [],
      status: "want-to-read",
      ...overrides,
    }),
  );
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create({ instance: { launchTimeout: 60_000 } });
  env.MONGODB_URI = mongoServer.getUri("thumbstack-test");
  await connectToDatabase(env.MONGODB_URI);
  await Promise.all([User.init(), Book.init()]);
});

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Book.deleteMany({})]);
});

afterAll(async () => {
  await disconnectFromDatabase();
  await mongoServer?.stop();
});

describe("health and request security", () => {
  it("reports database readiness", async () => {
    const ready = await request(createApp(env)).get("/api/health");
    expect(ready.status).toBe(200);
    expect(ready.body).toEqual({ status: "ok" });

    const unavailable = await request(createApp(env, { databaseReady: () => false })).get(
      "/api/health",
    );
    expect(unavailable.status).toBe(503);
    expect(unavailable.body.error.code).toBe("DATABASE_UNAVAILABLE");
  });

  it("requires both the exact origin and fixed client header on unsafe requests", async () => {
    const app = createApp(env);
    const body = {
      name: "Reader",
      email: "reader@example.com",
      password: "long-enough-password",
    };

    const missing = await request(app).post("/api/auth/signup").send(body);
    expect(missing.status).toBe(403);
    expect(missing.body.error.code).toBe("REQUEST_NOT_ALLOWED");

    const wrongOrigin = await request(app)
      .post("/api/auth/signup")
      .set("Origin", "http://localhost:3001")
      .set(CLIENT_HEADER_NAME, CLIENT_HEADER_VALUE)
      .send(body);
    expect(wrongOrigin.status).toBe(403);

    const wrongHeader = await request(app)
      .post("/api/auth/signup")
      .set("Origin", env.FRONTEND_ORIGIN)
      .set(CLIENT_HEADER_NAME, "other")
      .send(body);
    expect(wrongHeader.status).toBe(403);
  });

  it("returns the exact allowed CORS origin and a consistent invalid JSON error", async () => {
    const app = createApp(env);
    const preflight = await request(app)
      .options("/api/books")
      .set("Origin", env.FRONTEND_ORIGIN)
      .set("Access-Control-Request-Method", "POST");
    expect(preflight.headers["access-control-allow-origin"]).toBe(env.FRONTEND_ORIGIN);
    expect(preflight.headers["access-control-allow-credentials"]).toBe("true");

    const malformed = await request(app)
      .post("/api/auth/login")
      .set("Origin", env.FRONTEND_ORIGIN)
      .set(CLIENT_HEADER_NAME, CLIENT_HEADER_VALUE)
      .set("Content-Type", "application/json")
      .send('{"email":');
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe("INVALID_JSON");
  });
});

describe("authentication", () => {
  it("signs up, exposes only safe user data, restores the session, and logs out", async () => {
    const agent = request.agent(createApp(env));
    const created = await signup(agent, "  Reader@Example.com  ", "  Avid   Reader ");

    expect(created.status).toBe(201);
    expect(created.body.user).toMatchObject({
      name: "Avid Reader",
      email: "reader@example.com",
    });
    expect(created.body.user).not.toHaveProperty("passwordHash");

    const cookie = created.headers["set-cookie"]?.[0] as string;
    expect(cookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Max-Age=43200");
    expect(cookie).not.toContain("Domain=");
    expect(cookie).not.toContain("Secure");

    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.user).toEqual(created.body.user);

    const loggedOut = await secure(agent.post("/api/auth/logout"));
    expect(loggedOut.status).toBe(204);
    expect(loggedOut.headers["set-cookie"]?.[0]).toContain(`${SESSION_COOKIE_NAME}=;`);
    expect((await agent.get("/api/auth/me")).status).toBe(401);
  });

  it("marks production cookies secure", async () => {
    const productionApp = createApp({ ...env, NODE_ENV: "production" });
    const created = await secure(
      request(productionApp).post("/api/auth/signup").send({
        name: "Reader",
        email: "secure@example.com",
        password: "long-enough-password",
      }),
    );
    expect(created.headers["set-cookie"]?.[0]).toContain("Secure");
  });

  it("rejects normalized duplicate email addresses", async () => {
    const app = createApp(env);
    await signup(request.agent(app), "reader@example.com");
    const duplicate = await signup(request.agent(app), " READER@example.com ");

    expect(duplicate.status).toBe(409);
    expect(duplicate.body).toEqual({
      error: {
        code: "EMAIL_IN_USE",
        message: "An account with that email already exists.",
        fields: { email: "Email is already in use." },
      },
    });
  });

  it("logs in with a generic invalid-credentials error", async () => {
    const app = createApp(env);
    await signup(request.agent(app));

    const wrongPassword = await secure(
      request(app).post("/api/auth/login").send({
        email: "reader@example.com",
        password: "incorrect-password",
      }),
    );
    const unknownEmail = await secure(
      request(app).post("/api/auth/login").send({
        email: "unknown@example.com",
        password: "incorrect-password",
      }),
    );

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expect(wrongPassword.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("rejects tampered and expired JWTs", async () => {
    const created = await signup(request.agent(createApp(env)));
    const userId = created.body.user.id as string;
    const tokenOptions = {
      algorithm: "HS256" as const,
      audience: JWT_AUDIENCE,
      issuer: JWT_ISSUER,
      subject: userId,
    };
    const tampered = jwt.sign({}, `${env.JWT_SECRET}-wrong`, {
      ...tokenOptions,
      expiresIn: "12h",
    });
    const expired = jwt.sign({}, env.JWT_SECRET, { ...tokenOptions, expiresIn: -1 });

    for (const token of [tampered, expired]) {
      const response = await request(createApp(env))
        .get("/api/auth/me")
        .set("Cookie", `${SESSION_COOKIE_NAME}=${token}`);
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("INVALID_SESSION");
      expect(response.headers["set-cookie"]?.[0]).toContain(`${SESSION_COOKIE_NAME}=;`);
      expect(response.headers["set-cookie"]?.[0]).toContain("Expires=Thu, 01 Jan 1970");
    }
  });

  it("limits authentication attempts to ten per fifteen minutes", async () => {
    const app = createApp(env);
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      const response = await secure(
        request(app).post("/api/auth/login").send({
          email: "unknown@example.com",
          password: "incorrect-password",
        }),
      );
      expect(response.status).toBe(401);
    }

    const limited = await secure(
      request(app).post("/api/auth/login").send({
        email: "unknown@example.com",
        password: "incorrect-password",
      }),
    );
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe("AUTH_RATE_LIMITED");
  });
});

describe("book collection", () => {
  it("creates normalized books, permits duplicates, filters with AND, updates, and deletes", async () => {
    const agent = request.agent(createApp(env));
    await signup(agent);

    const first = await addBook(agent, {
      title: "  The   Left Hand of Darkness ",
      author: " Ursula   Le Guin ",
      tags: [" Science Fiction ", "science fiction", " Classic  "],
      status: "reading",
    });
    expect(first.status).toBe(201);
    expect(first.body.book).toMatchObject({
      title: "The Left Hand of Darkness",
      author: "Ursula Le Guin",
      tags: ["science fiction", "classic"],
      status: "reading",
    });

    const duplicate = await addBook(agent, {
      title: "The Left Hand of Darkness",
      author: "Ursula Le Guin",
      tags: ["classic"],
      status: "completed",
    });
    expect(duplicate.status).toBe(201);

    const combined = await agent.get("/api/books?status=reading&tag=SCIENCE%20FICTION");
    expect(combined.status).toBe(200);
    expect(combined.body.books).toHaveLength(1);
    expect(combined.body.books[0].id).toBe(first.body.book.id);

    const changed = await secure(
      agent.patch(`/api/books/${first.body.book.id}`).send({ status: "completed" }),
    );
    expect(changed.status).toBe(200);
    expect(changed.body.book.status).toBe("completed");

    const removed = await secure(agent.delete(`/api/books/${first.body.book.id}`));
    expect(removed.status).toBe(204);
    expect((await agent.get("/api/books")).body.books).toHaveLength(1);
  });

  it("validates book input and never accepts owner control", async () => {
    const agent = request.agent(createApp(env));
    await signup(agent);

    const invalid = await addBook(agent, {
      title: " ",
      status: "read",
      tags: Array.from({ length: 9 }, (_, index) => `tag-${index}`),
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe("VALIDATION_ERROR");
    expect(invalid.body.error.fields).toHaveProperty("title");
    expect(invalid.body.error.fields).toHaveProperty("status");
    expect(invalid.body.error.fields).toHaveProperty("tags");

    const duplicateTags = await addBook(agent, {
      tags: Array.from({ length: 9 }, (_, index) => (index % 2 === 0 ? "Repeat" : " repeat ")),
    });
    expect(duplicateTags.status).toBe(201);
    expect(duplicateTags.body.book.tags).toEqual(["repeat"]);

    const ownerInjection = await secure(
      agent.post("/api/books").send({
        ownerId: new mongoose.Types.ObjectId().toString(),
        title: "A Book",
        author: "An Author",
      }),
    );
    expect(ownerInjection.status).toBe(400);

    const emptyUpdate = await secure(
      agent.patch(`/${"api/books"}/${new mongoose.Types.ObjectId().toString()}`).send({}),
    );
    expect(emptyUpdate.status).toBe(400);
  });

  it("isolates all reads and mutations by authenticated owner", async () => {
    const app = createApp(env);
    const firstOwner = request.agent(app);
    const secondOwner = request.agent(app);
    await signup(firstOwner, "first@example.com");
    await signup(secondOwner, "second@example.com");
    const created = await addBook(firstOwner, { title: "Private Book" });
    const id = created.body.book.id as string;

    expect((await secondOwner.get("/api/books")).body.books).toEqual([]);

    const update = await secure(secondOwner.patch(`/api/books/${id}`).send({ status: "reading" }));
    expect(update.status).toBe(404);
    expect(update.body.error.code).toBe("BOOK_NOT_FOUND");

    const removal = await secure(secondOwner.delete(`/api/books/${id}`));
    expect(removal.status).toBe(404);
    expect((await firstOwner.get("/api/books")).body.books).toHaveLength(1);
  });
});

describe("dashboard summary", () => {
  it("returns counts, sorted tags, and a favorite-author rediscovery", async () => {
    const agent = request.agent(createApp(env));
    await signup(agent);

    await addBook(agent, {
      title: "The Dispossessed",
      author: "Ursula Le Guin",
      tags: ["science fiction", "classic"],
      status: "completed",
    });
    await addBook(agent, {
      title: "A Wizard of Earthsea",
      author: " Ursula   Le Guin ",
      tags: ["fantasy"],
      status: "reading",
    });
    await addBook(agent, {
      title: "The Left Hand of Darkness",
      author: "Ursula Le Guin",
      tags: ["science fiction"],
      status: "want-to-read",
    });
    await addBook(agent, {
      title: "Kindred",
      author: "Octavia Butler",
      tags: ["classic"],
      status: "completed",
    });

    const dashboard = await agent.get("/api/dashboard");
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.summary).toMatchObject({
      total: 4,
      byStatus: {
        "want-to-read": 1,
        reading: 1,
        completed: 2,
      },
      tags: ["classic", "fantasy", "science fiction"],
      authorInsight: {
        name: "Ursula Le Guin",
        bookCount: 3,
        rediscovery: {
          title: "The Dispossessed",
          status: "completed",
        },
      },
    });
  });

  it("omits the author insight until an author has at least two books", async () => {
    const agent = request.agent(createApp(env));
    await signup(agent);
    await addBook(agent, { title: "Kindred", author: "Octavia Butler" });

    const dashboard = await agent.get("/api/dashboard");
    expect(dashboard.body.summary.authorInsight).toBeNull();
  });

  it("breaks author-count ties by latest activity then name and falls back to oldest added", async () => {
    const agent = request.agent(createApp(env));
    const signedUp = await signup(agent);
    const ownerId = new mongoose.Types.ObjectId(signedUp.body.user.id as string);

    const alphaOld = await addBook(agent, {
      title: "Alpha Old",
      author: "Alpha Author",
      status: "want-to-read",
    });
    await addBook(agent, { title: "Alpha New", author: "Alpha Author", status: "reading" });
    const betaOld = await addBook(agent, {
      title: "Beta Old",
      author: "Beta Author",
      status: "want-to-read",
    });
    await addBook(agent, { title: "Beta New", author: "Beta Author", status: "reading" });

    await Book.collection.updateMany(
      { ownerId, authorKey: "alpha author" },
      { $set: { updatedAt: new Date("2024-01-01T00:00:00.000Z") } },
    );
    await Book.collection.updateMany(
      { ownerId, authorKey: "beta author" },
      { $set: { updatedAt: new Date("2025-01-01T00:00:00.000Z") } },
    );
    await Book.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(betaOld.body.book.id as string), ownerId },
      { $set: { createdAt: new Date("2020-01-01T00:00:00.000Z") } },
    );

    const latestWinner = await agent.get("/api/dashboard");
    expect(latestWinner.body.summary.authorInsight).toMatchObject({
      name: "Beta Author",
      rediscovery: { id: betaOld.body.book.id, title: "Beta Old" },
    });

    await Book.collection.updateMany(
      { ownerId, authorKey: "alpha author" },
      { $set: { updatedAt: new Date("2025-01-01T00:00:00.000Z") } },
    );
    await Book.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(alphaOld.body.book.id as string), ownerId },
      { $set: { createdAt: new Date("2019-01-01T00:00:00.000Z") } },
    );

    const nameWinner = await agent.get("/api/dashboard");
    expect(nameWinner.body.summary.authorInsight).toMatchObject({
      name: "Alpha Author",
      rediscovery: { id: alphaOld.body.book.id, title: "Alpha Old" },
    });
  });
});
