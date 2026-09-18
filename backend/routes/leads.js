import { Router } from "express";
import multer from "multer";
import Lead from "../models/Lead.js";
import { parseLeadCsv } from "../csv.js";

export function leadRoutes(Model = Lead) {
  const router = Router();
  router.post("/leads/retry-failed", async (_req, res, next) => {
    try {
      const result = await Model.updateMany(
        { status: "FAILED" },
        {
          $set: {
            status: "PENDING",
            error: null,
            companySummary: null,
            generatedEmail: null,
          },
          $unset: { leaseToken: "", leaseExpiresAt: "" },
        },
      );
      res.json({ count: result.modifiedCount });
    } catch (error) {
      next(error);
    }
  });
  router.post("/leads/:id/retry", async (req, res, next) => {
    try {
      const result = await Model.updateOne(
        { id: req.params.id, status: "FAILED" },
        {
          $set: {
            status: "PENDING",
            error: null,
            companySummary: null,
            generatedEmail: null,
          },
          $unset: { leaseToken: "", leaseExpiresAt: "" },
        },
      );
      if (!result.modifiedCount)
        return res
          .status(409)
          .json({
            error:
              "This lead is no longer failed or no longer exists. Refresh and try again.",
          });
      res.json({ count: 1 });
    } catch (error) {
      next(error);
    }
  });
  router.patch("/leads/:id/email", async (req, res, next) => {
    const { generatedEmail, updatedAt } = req.body || {};
    if (
      typeof generatedEmail !== "string" ||
      !generatedEmail.trim() ||
      generatedEmail.length > 10000 ||
      typeof updatedAt !== "string" ||
      !Number.isFinite(Date.parse(updatedAt))
    ) {
      return res
        .status(400)
        .json({
          error:
            "Provide a draft of 1 to 10,000 characters and its original updatedAt timestamp.",
        });
    }
    try {
      const lead = await Model.findOneAndUpdate(
        {
          id: req.params.id,
          status: "COMPLETED",
          updatedAt: new Date(updatedAt),
        },
        { $set: { generatedEmail: generatedEmail.trim() } },
        { returnDocument: 'after', runValidators: true },
      )
        .select("-_id -__v -leaseToken -leaseExpiresAt")
        .lean();
      if (!lead)
        return res
          .status(409)
          .json({
            error:
              "This lead changed or is not completed. Copy your edits, cancel, and reopen the latest draft.",
          });
      res.json(lead);
    } catch (error) {
      next(error);
    }
  });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 1024 * 1024, files: 1 },
  });
  router.post("/upload", upload.single("file"), async (req, res, next) => {
    if (!req.file)
      return res.status(400).json({ error: "Choose a CSV file to upload." });
    let urls;
    try {
      urls = parseLeadCsv(req.file.buffer);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
    try {
      const leads = await Model.insertMany(
        urls.map((companyUrl) => ({ companyUrl, status: "PENDING" })),
      );
      res.status(201).json({ count: leads.length });
    } catch (error) {
      next(error);
    }
  });
  router.get("/leads", async (_req, res, next) => {
    try {
      res.json(
        await Model.find()
          .select("-_id -__v -leaseToken -leaseExpiresAt")
          .sort({ createdAt: -1 })
          .lean(),
      );
    } catch (error) {
      next(error);
    }
  });
  return router;
}
