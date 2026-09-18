import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../app.js";
import { parseLeadCsv } from "../csv.js";

test("Retry only targets failed leads and clears stale leases", async () => {
  let received;
  const app = createApp({
    updateOne: async (...args) => {
      received = args;
      return { modifiedCount: 1 };
    },
  });
  const res = await request(app).post("/api/leads/example/retry");
  assert.equal(res.status, 200);
  assert.deepEqual(received[0], { id: "example", status: "FAILED" });
  assert.equal(received[1].$set.status, "PENDING");
  assert.ok("leaseToken" in received[1].$unset);
});
test("Retry rejects active or missing leads", async () => {
  const res = await request(
    createApp({ updateOne: async () => ({ modifiedCount: 0 }) }),
  ).post("/api/leads/example/retry");
  assert.equal(res.status, 409);
});
test("Bulk retry reports requeued count", async () => {
  const app = createApp({
    updateMany: async (query) => {
      assert.deepEqual(query, { status: "FAILED" });
      return { modifiedCount: 3 };
    },
  });
  const res = await request(app).post("/api/leads/retry-failed");
  assert.deepEqual(res.body, { count: 3 });
});
test("Draft editing rejects invalid input before touching database", async () => {
  for (const body of [
    {},
    { generatedEmail: " " },
    { generatedEmail: "x".repeat(10001), updatedAt: new Date().toISOString() },
  ]) {
    const res = await request(createApp({}))
      .patch("/api/leads/id/email")
      .send(body);
    assert.equal(res.status, 400);
  }
});
test("Draft editing guards against stale updates", async () => {
  const timestamp = "2026-09-18T00:00:00.000Z";
  const app = createApp({
    findOneAndUpdate: (query) => {
      assert.equal(query.status, "COMPLETED");
      assert.equal(query.updatedAt.toISOString(), timestamp);
      return { select: () => ({ lean: async () => null }) };
    },
  });
  const res = await request(app)
    .patch("/api/leads/id/email")
    .send({ generatedEmail: "Edited.", updatedAt: timestamp });
  assert.equal(res.status, 409);
});
test("Malformed JSON produces a useful client error", async () => {
  const res = await request(createApp({}))
    .patch("/api/leads/id/email")
    .set("Content-Type", "application/json")
    .send("{bad");
  assert.equal(res.status, 400);
});

test("CSV supports BOM, quoted URLs, CRLF, and deduplicates within upload", () => {
  assert.deepEqual(
    parseLeadCsv(
      Buffer.from(
        '\uFEFFcompanyUrl\r\n"https://example.com"\r\nhttps://example.com/#about\r\n',
      ),
    ),
    ["https://example.com/"],
  );
});
test("CSV rejects wrong headers, malformed rows, and empty uploads", () => {
  for (const csv of [
    "url\nhttps://example.com",
    "companyUrl\n",
    "companyUrl\nhttps://example.com,extra",
    'companyUrl\n"unclosed',
  ]) {
    assert.throws(() => parseLeadCsv(Buffer.from(csv)));
  }
});
test("CSV rejects unsafe URLs and credentials", () => {
  for (const url of [
    "file:///etc/passwd",
    "http://127.0.0.1",
    "http://169.254.169.254",
    "http://[::1]",
    "http://localhost",
    "https://user:pass@example.com",
    "https://example.com:8080",
    "javascript:alert(1)",
  ]) {
    assert.throws(() => parseLeadCsv(Buffer.from(`companyUrl\n${url}`)));
  }
});
test("CSV enforces row limit", () => {
  assert.throws(
    () =>
      parseLeadCsv(
        Buffer.from("companyUrl\n" + "https://example.com\n".repeat(1001)),
      ),
    /1,000/,
  );
});
test("Upload creates pending records and returns count", async () => {
  let inserted;
  const app = createApp({
    insertMany: async (rows) => {
      inserted = rows;
      return rows;
    },
  });
  const res = await request(app)
    .post("/api/upload")
    .attach(
      "file",
      Buffer.from("companyUrl\nhttps://example.com"),
      "companies.csv",
    );
  assert.equal(res.status, 201);
  assert.equal(res.body.count, 1);
  assert.deepEqual(inserted, [
    { companyUrl: "https://example.com/", status: "PENDING" },
  ]);
});
test("Invalid CSV never reaches database", async () => {
  const app = createApp({
    insertMany: () => assert.fail("Must not insert invalid data"),
  });
  const res = await request(app)
    .post("/api/upload")
    .attach(
      "file",
      Buffer.from("companyUrl\nhttps://example.com\ninvalid"),
      "companies.csv",
    );
  assert.equal(res.status, 400);
  assert.match(res.body.error, /row 3/);
});
test("Missing and oversized files have clear errors", async () => {
  const app = createApp({});
  assert.equal((await request(app).post("/api/upload")).status, 400);
  const res = await request(app)
    .post("/api/upload")
    .attach("file", Buffer.alloc(1024 * 1024 + 1), "large.csv");
  assert.equal(res.status, 400);
  assert.match(res.body.error, /1 MB/);
});
test("GET leads returns data", async () => {
  const leads = [
    { id: "test", companyUrl: "https://example.com/", status: "PENDING" },
  ];
  const app = createApp({
    find: () => ({
      select: () => ({ sort: () => ({ lean: async () => leads }) }),
    }),
  });
  const res = await request(app).get("/api/leads");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, leads);
});
