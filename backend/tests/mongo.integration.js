// Uses a unique temporary database and removes only that database after the test.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import request from "supertest";
import { createApp } from "../app.js";
import Lead from "../models/Lead.js";

const dbName = `leadenrich_test_${randomUUID().replaceAll("-", "")}`;
const uri = process.env.TEST_MONGODB_URI || "mongodb://127.0.0.1:27017";
await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 5000 });
try {
  const app = createApp();
  const upload = await request(app)
    .post("/api/upload")
    .attach(
      "file",
      Buffer.from("companyUrl\nhttps://example.com"),
      "leads.csv",
    );
  assert.equal(upload.status, 201);
  const before = await request(app).get("/api/leads");
  assert.equal(before.body.length, 1);
  assert.equal(before.body[0].status, "PENDING");
  assert.ok(before.body[0].id);
  const python =
    process.env.WORKER_PYTHON ||
    fileURLToPath(
      new URL("../../ai_worker/.venv/Scripts/python.exe", import.meta.url),
    );
  const script = fileURLToPath(
    new URL("../../ai_worker/integration_check.py", import.meta.url),
  );
  const result = spawnSync(python, [script], {
    encoding: "utf8",
    env: { ...process.env, MONGODB_URI: uri, MONGODB_DB: dbName },
  });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  const after = await request(app).get("/api/leads");
  assert.equal(after.body[0].status, "COMPLETED");
  assert.match(after.body[0].generatedEmail, /Would a short call/);
  assert.ok(after.body[0].companySummary);
  assert.equal(after.body[0].leaseToken, undefined);
  assert.equal(await Lead.countDocuments(), 1);
  const id = after.body[0].id;
  const edit = await request(app)
    .patch(`/api/leads/${id}/email`)
    .send({
      generatedEmail: "An edited draft.",
      updatedAt: after.body[0].updatedAt,
    });
  assert.equal(edit.status, 200);
  assert.equal(edit.body.generatedEmail, "An edited draft.");
  const staleEdit = await request(app)
    .patch(`/api/leads/${id}/email`)
    .send({
      generatedEmail: "Stale overwrite.",
      updatedAt: after.body[0].updatedAt,
    });
  assert.equal(staleEdit.status, 409);
  assert.equal((await request(app).post(`/api/leads/${id}/retry`)).status, 409);
  await Lead.updateOne(
    { id },
    { $set: { status: "FAILED", error: "Test failure" } },
  );
  assert.equal((await request(app).post(`/api/leads/${id}/retry`)).status, 200);
  assert.equal((await Lead.findOne({ id })).status, "PENDING");
  await Lead.updateOne({ id }, { $set: { status: "FAILED" } });
  assert.equal(
    (await request(app).post("/api/leads/retry-failed")).body.count,
    1,
  );
  assert.equal(
    (await request(app).post("/api/leads/retry-failed")).body.count,
    0,
  );
  console.log(
    "PASS: Draft persistence, conflict protection, individual retry, and bulk retry.",
  );
  console.log(
    "PASS: CSV -> Express -> MongoDB -> Python worker -> GET leads. Gemini and website content were mocked.",
  );
} finally {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}
