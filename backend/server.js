import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { createApp } from "./app.js";
dotenv.config({ path: fileURLToPath(new URL(".env", import.meta.url)) });

try {
  await mongoose.connect(
    process.env.MONGODB_URI || "mongodb://127.0.0.1:27017",
    {
      dbName: process.env.MONGODB_DB || "leadenrich",
      serverSelectionTimeoutMS: 5000,
    },
  );
  const port = Number(process.env.PORT || 5000);
  const host = process.env.HOST || "127.0.0.1";
  const server = createApp().listen(port, host, () =>
    console.log(`LeadEnrich API: http://${host}:${port}`),
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => {
      server.close(async () => {
        await mongoose.disconnect();
        process.exit(0);
      });
    });
} catch {
  console.error(
    "Could not connect to MongoDB. Check backend/.env and start MongoDB.",
  );
  process.exit(1);
}
