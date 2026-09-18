// Quote every value and neutralize spreadsheet formula prefixes, including whitespace.
export function leadsToCsv(leads) {
  const cell = (value) => {
    let text = String(value ?? "");
    if (/^[\s\uFEFF]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text))
      text = "'" + text;
    return `"${text.replaceAll('"', '""')}"`;
  };
  const columns = [
    "companyUrl",
    "status",
    "companySummary",
    "generatedEmail",
    "error",
  ];
  return (
    "\uFEFF" +
    [columns, ...leads.map((lead) => columns.map((key) => lead[key]))]
      .map((row) => row.map(cell).join(","))
      .join("\r\n")
  );
}

export function paginate(items, page, size = 10) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.max(1, Math.min(page, pages));
  return {
    current,
    pages,
    items: items.slice((current - 1) * size, current * size),
  };
}
