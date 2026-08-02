import type { Server } from "node:http";
import { createApp } from "./app.js";
import {
  connectToDatabase,
  disconnectFromDatabase,
  isDatabaseReady,
} from "./config/database.js";
import { loadEnv } from "./config/env.js";

async function start(): Promise<void> {
  const env = loadEnv();
  const app = createApp(env);
  const server = app.listen(env.PORT, () => {
    console.log(`Thumbstack API listening on port ${env.PORT}`);
  });

  const isShuttingDown = installShutdownHandlers(server);
  await connectWithRetry(env.MONGODB_URI, isShuttingDown);
}

async function connectWithRetry(uri: string, isShuttingDown: () => boolean): Promise<void> {
  while (!isShuttingDown() && !isDatabaseReady()) {
    try {
      await connectToDatabase(uri);
      console.log("Connected to MongoDB");
    } catch (error: unknown) {
      console.error("MongoDB connection failed; retrying in 5 seconds.", error);
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
  }
}

function installShutdownHandlers(server: Server): () => boolean {
  let shuttingDown = false;

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received; shutting down.`);

    server.close(async () => {
      await disconnectFromDatabase();
      process.exit(0);
    });

    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  return () => shuttingDown;
}

start().catch((error: unknown) => {
  console.error("Unable to start the Thumbstack API", error);
  process.exit(1);
});
