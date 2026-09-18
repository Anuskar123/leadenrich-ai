import express from "express";
import cors from "cors";
import multer from "multer";
import { leadRoutes } from "./routes/leads.js";

export function createApp(model) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));
  app.use(
    cors({ origin: process.env.FRONTEND_ORIGIN || "http://localhost:5173" }),
  );
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.use("/api", leadRoutes(model));
  app.use((error, _req, res, _next) => {
    if (error.type === "entity.parse.failed")
      return res.status(400).json({ error: "Invalid JSON body." });
    if (error.type === "entity.too.large")
      return res.status(413).json({ error: "Request body is too large." });
    if (error instanceof multer.MulterError) {
      return res.status(400).json({
        error:
          error.code === "LIMIT_FILE_SIZE"
            ? "CSV must be smaller than 1 MB."
            : "Upload one CSV in the file field.",
      });
    }
    console.error(error.name, error.code || "Request failed");
    res
      .status(500)
      .json({ error: "Unable to access leads. Please try again." });
  });
  return app;
}
