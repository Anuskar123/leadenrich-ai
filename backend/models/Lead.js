import mongoose from "mongoose";
import { randomUUID } from "node:crypto";

const leadSchema = new mongoose.Schema(
  {
    id: { type: String, default: randomUUID, unique: true },
    companyUrl: { type: String, required: true },
    status: {
      type: String,
      enum: ["PENDING", "PROCESSING", "COMPLETED", "FAILED"],
      default: "PENDING",
    },
    companySummary: { type: String, default: null },
    generatedEmail: { type: String, default: null },
    error: { type: String, default: null },
    leaseToken: String,
    leaseExpiresAt: Date,
  },
  { timestamps: true, collection: "leads" },
);
leadSchema.index({ status: 1, createdAt: 1 });
export default mongoose.model("Lead", leadSchema);
