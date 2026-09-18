import { parse } from "csv-parse/sync";
import ipaddr from "ipaddr.js";

export function normalizeUrl(value) {
  const url = new URL(value.trim());
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !["80", "443"].includes(url.port)) ||
    !host.includes(".") ||
    /(^|\.)(localhost|local|internal)$/.test(host) ||
    (ipaddr.isValid(host) && ipaddr.process(host).range() !== "unicast")
  ) {
    throw new Error("Use a public HTTP or HTTPS company URL.");
  }
  url.hash = "";
  return url.href;
}

export function parseLeadCsv(buffer) {
  const rows = parse(buffer, {
    bom: true,
    skip_empty_lines: true,
    trim: true,
    max_record_size: 4096,
  });
  if (!rows.length || rows[0].length !== 1 || rows[0][0] !== "companyUrl") {
    throw new Error("CSV must contain exactly one column named companyUrl.");
  }
  if (rows.length < 2) throw new Error("Add at least one company URL.");
  if (rows.length > 1001)
    throw new Error("Upload at most 1,000 URLs at a time.");
  const urls = rows.slice(1).map((row, index) => {
    try {
      if (row.length !== 1) throw new Error("Expected one column.");
      return normalizeUrl(row[0]);
    } catch {
      throw new Error(
        `Invalid public company URL on row ${index + 2}. Include https://.`,
      );
    }
  });
  return [...new Set(urls)];
}
