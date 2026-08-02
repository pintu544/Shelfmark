import mongoose from "mongoose";

mongoose.set("strictQuery", true);

export async function connectToDatabase(uri: string): Promise<void> {
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10_000,
  });
}

export async function disconnectFromDatabase(): Promise<void> {
  await mongoose.disconnect();
}

export function isDatabaseReady(): boolean {
  return mongoose.connection.readyState === 1;
}
