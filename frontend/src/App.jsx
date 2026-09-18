import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleHelp,
  Copy,
  FileSpreadsheet,
  LayoutDashboard,
  LoaderCircle,
  RefreshCw,
  Search,
  UploadCloud,
  WandSparkles,
} from "lucide-react";
import "./App.css";
import { leadsToCsv, paginate } from "./leadUtils.js";

const statuses = ["ALL", "PENDING", "PROCESSING", "COMPLETED", "FAILED"];
const label = (status) => status.charAt(0) + status.slice(1).toLowerCase();
const domain = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

async function api(path, options) {
  const response = await fetch(`/api${path}`, options);
  const data = await response.json().catch(() => null);
  if (!response.ok || data === null)
    throw new Error(
      data?.error ||
        "Unable to reach the API. Check that the backend is running.",
    );
  return data;
}

export default function App() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [connectionError, setConnectionError] = useState("");
  const [notice, setNotice] = useState("");
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [filter, setFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState(null);
  const [page, setPage] = useState(1);
  const input = useRef(null);
  const inFlight = useRef(false);
  const refresh = useCallback(async (silent = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (!silent) setLoading(true);
    try {
      const data = await api("/leads");
      setLeads(data);
      setLastUpdated(new Date());
      setConnectionError("");
    } catch (e) {
      setConnectionError(e.message);
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, []);
  useEffect(() => {
    const initial = setTimeout(() => refresh(true), 0);
    const timer = setInterval(() => refresh(true), 5000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [refresh]);

  function selectFile(next) {
    setNotice("");
    if (!next) return;
    if (!next.name.toLowerCase().endsWith(".csv") || next.size > 1024 * 1024) {
      setFile(null);
      setError("Choose a .csv file smaller than 1 MB.");
      return;
    }
    setError("");
    setFile(next);
  }
  async function upload() {
    if (!file || uploading) return;
    setUploading(true);
    setError("");
    setNotice("");
    const body = new FormData();
    body.append("file", file);
    try {
      const result = await api("/upload", { method: "POST", body });
      setNotice(
        `${result.count} ${result.count === 1 ? "company" : "companies"} added to the research queue.`,
      );
      setFile(null);
      if (input.current) input.current.value = "";
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }
  async function copy(lead) {
    try {
      await navigator.clipboard.writeText(lead.generatedEmail);
      setCopied(lead.id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setError(
        "Clipboard access is unavailable. Select the email text to copy it.",
      );
    }
  }
  async function retry(id) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api(
        id ? `/leads/${id}/retry` : "/leads/retry-failed",
        { method: "POST" },
      );
      setNotice(`${result.count} failed leads returned to the queue.`);
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function saveDraft(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api(`/leads/${editor.id}/email`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          generatedEmail: editor.text,
          updatedAt: editor.updatedAt,
        }),
      });
      setEditor(null);
      setNotice("Email draft saved.");
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function exportLeads() {
    const url = URL.createObjectURL(
      new Blob([leadsToCsv(visible)], { type: "text/csv;charset=utf-8;" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `leadenrich-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice(`Exported ${visible.length} matching leads.`);
  }
  const counts = Object.fromEntries(
    statuses.map((s) => [
      s,
      s === "ALL" ? leads.length : leads.filter((l) => l.status === s).length,
    ]),
  );
  const visible = leads.filter(
    (l) =>
      (filter === "ALL" || l.status === filter) &&
      l.companyUrl.toLowerCase().includes(query.toLowerCase()),
  );
  const pagination = paginate(visible, page);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="LeadEnrich home">
          <span className="brand-icon">
            <WandSparkles size={21} />
          </span>
          LeadEnrich<span className="ai-label">AI</span>
        </a>
        <div className="workspace">
          <span className="workspace-avatar">W</span>
          <div>
            Your workspace<small>Local workspace</small>
          </div>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <a className="nav-item active" href="#dashboard">
          <LayoutDashboard size={18} />
          Overview
          <span className="nav-dot" />
        </a>
        <a className="nav-item" href="#leads">
          <FileSpreadsheet size={18} />
          Company leads<span className="nav-count">{leads.length}</span>
        </a>
        <div className="sidebar-bottom">
          <div className="research-note">
            <span className="small-icon">
              <WandSparkles size={18} />
            </span>
            <strong>
              A little research.
              <br />A better first impression.
            </strong>
            <p>Turn company websites into more relevant conversations.</p>
          </div>
          <a className="help-link" href="#format-help">
            <CircleHelp size={17} />
            CSV format guide
            <ArrowUpRight size={15} />
          </a>
          <div className="profile">
            <span className="workspace-avatar">LW</span>
            <div>
              Local workspace<small>Development environment</small>
            </div>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div>
            Workspace <ChevronRight size={14} />
            <span>Overview</span>
          </div>
          <span className="environment">
            <span /> Local development
          </span>
        </header>
        <main id="dashboard">
          <div className="page-heading">
            <div>
              <div className="eyebrow">LESS RESEARCH. MORE CONVERSATIONS.</div>
              <h1>Your next conversation starts here.</h1>
              <p>Research companies and draft outreach that feels personal.</p>
            </div>
            <a
              className="button secondary template-top"
              href="/sample.csv"
              download
            >
              <ArrowDownToLine size={16} />
              CSV template
            </a>
          </div>
          <div className="stats-grid">
            {[
              ["Total companies", counts.ALL, "In your workspace", "neutral"],
              [
                "Ready for outreach",
                counts.COMPLETED,
                "Personalized drafts prepared",
                "green",
              ],
              [
                "In the pipeline",
                counts.PENDING + counts.PROCESSING,
                "Queued or being researched",
                "amber",
              ],
              [
                "Needs attention",
                counts.FAILED,
                "Could not complete research",
                "red",
              ],
            ].map(([title, count, hint, tone]) => (
              <div className="stat-card" key={title}>
                <div className="stat-title">
                  <span className={`stat-dot ${tone}`} />
                  {title}
                </div>
                <div className="stat-value">
                  {count.toString().padStart(2, "0")}
                </div>
                <div className="stat-hint">{hint}</div>
              </div>
            ))}
          </div>
          <section className="import-panel" aria-labelledby="import-title">
            <div className="import-description">
              <span className="section-kicker">01 / IMPORT</span>
              <h2 id="import-title">Bring your company list.</h2>
              <p>
                Upload your URLs. We’ll read each website, summarize the
                company, and draft a three-sentence introduction.
              </p>
              <div id="format-help" className="format-help">
                <FileSpreadsheet size={16} />
                <span>
                  One column. Header: <code>companyUrl</code>
                  <br />
                  Up to 1,000 URLs per upload. CSV, max 1 MB.
                </span>
              </div>
            </div>
            <div className="upload-area">
              <button
                type="button"
                disabled={uploading}
                className={`dropzone ${dragging ? "dragging" : ""}`}
                onClick={() => input.current.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  if (!uploading) {
                    if (e.dataTransfer.files.length !== 1)
                      setError("Drop one CSV file at a time.");
                    else selectFile(e.dataTransfer.files[0]);
                  }
                }}
              >
                <span className="upload-icon">
                  <UploadCloud size={24} />
                </span>
                <strong>
                  {file ? file.name : "Click to upload or drag and drop"}
                </strong>
                <span>
                  {file
                    ? `${(file.size / 1024).toFixed(1)} KB • Ready to import`
                    : "Your next opportunity could be in this file."}
                </span>
              </button>
              <input
                ref={input}
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                aria-label="Choose company CSV"
                onChange={(e) => selectFile(e.target.files[0])}
              />
              <div className="upload-bottom">
                <a href="/sample.csv" download>
                  Download sample CSV <ArrowUpRight size={13} />
                </a>
                <button
                  className="button primary"
                  onClick={upload}
                  disabled={!file || uploading}
                >
                  {uploading ? (
                    <LoaderCircle className="animate-spin" size={16} />
                  ) : (
                    <WandSparkles size={16} />
                  )}
                  {uploading ? "Importing..." : "Import & enrich"}
                </button>
              </div>
            </div>
          </section>
          {error && (
            <div className="message error" role="alert">
              {error}
            </div>
          )}
          {connectionError && (
            <div className="message error" role="alert">
              {connectionError}
            </div>
          )}
          {notice && (
            <div className="message success" role="status">
              <Check size={17} />
              {notice}
            </div>
          )}
          <section
            id="leads"
            className="leads-panel"
            aria-labelledby="leads-title"
          >
            <div className="lead-actions">
              <button
                className="button secondary"
                disabled={!visible.length}
                onClick={exportLeads}
              >
                <ArrowDownToLine size={15} />
                Export matching leads ({visible.length})
              </button>
              <button
                className="button secondary"
                disabled={busy || !counts.FAILED}
                onClick={() => retry()}
              >
                Retry all failed ({counts.FAILED})
              </button>
              <span>Retries use your configured AI service.</span>
            </div>
            {editor && (
              <form className="draft-editor" onSubmit={saveDraft}>
                <label htmlFor="draft-text">
                  Edit draft for {domain(editor.companyUrl)}
                </label>
                <textarea
                  id="draft-text"
                  autoFocus
                  required
                  maxLength={10000}
                  rows={6}
                  value={editor.text}
                  onChange={(e) =>
                    setEditor({ ...editor, text: e.target.value })
                  }
                />
                <div className="editor-actions">
                  <span>
                    {editor.text.length.toLocaleString()} / 10,000 characters
                  </span>
                  <button
                    className="button secondary"
                    type="button"
                    disabled={busy}
                    onClick={() => setEditor(null)}
                  >
                    Cancel
                  </button>
                  <button
                    className="button primary"
                    disabled={busy || !editor.text.trim()}
                  >
                    {busy ? "Saving..." : "Save draft"}
                  </button>
                </div>
              </form>
            )}
            <div className="leads-heading">
              <div>
                <h2 id="leads-title">
                  Company leads{" "}
                  <span className="total-pill">{leads.length}</span>
                </h2>
                <p>From a website to a thoughtful first hello.</p>
              </div>
              <button
                className="button secondary"
                onClick={() => refresh()}
                disabled={loading}
              >
                <RefreshCw
                  size={15}
                  className={loading ? "animate-spin" : ""}
                />
                Refresh
              </button>
            </div>
            <div className="table-toolbar">
              <div className="filters" aria-label="Filter leads by status">
                {statuses.map((status) => (
                  <button
                    aria-pressed={filter === status}
                    className={filter === status ? "selected" : ""}
                    onClick={() => {
                      setFilter(status);
                      setPage(1);
                    }}
                    key={status}
                  >
                    {status === "ALL" ? "All leads" : label(status)}
                    <span>{counts[status]}</span>
                  </button>
                ))}
              </div>
              <label className="search">
                <Search size={16} />
                <input
                  aria-label="Search companies"
                  placeholder="Search companies..."
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPage(1);
                  }}
                />
              </label>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>COMPANY</th>
                    <th>STATUS</th>
                    <th>COMPANY SNAPSHOT</th>
                    <th>PERSONALIZED EMAIL</th>
                  </tr>
                </thead>
                <tbody>
                  {pagination.items.map((lead) => (
                    <tr key={lead.id}>
                      <td>
                        <a
                          className="company-link"
                          href={lead.companyUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <span className="company-avatar">
                            {domain(lead.companyUrl).charAt(0).toUpperCase()}
                          </span>
                          <span>
                            {domain(lead.companyUrl)}
                            <small>
                              Company website <ArrowUpRight size={11} />
                            </small>
                          </span>
                        </a>
                      </td>
                      <td>
                        <span className={`badge ${lead.status.toLowerCase()}`}>
                          <span />
                          {label(lead.status)}
                        </span>
                        {lead.status === "FAILED" && (
                          <button
                            className="copy-button"
                            disabled={busy}
                            onClick={() => retry(lead.id)}
                          >
                            Retry research
                          </button>
                        )}
                      </td>
                      <td>
                        <p className="summary-text">
                          {lead.companySummary ||
                            (lead.status === "FAILED"
                              ? lead.error
                              : lead.status === "PROCESSING"
                                ? "Reading the company website..."
                                : "Waiting for research")}
                        </p>
                      </td>
                      <td>
                        {lead.generatedEmail ? (
                          <div className="email-cell">
                            <p>{lead.generatedEmail}</p>
                            <button
                              className="copy-button"
                              disabled={busy || !!editor}
                              onClick={() => {
                                setError("");
                                setEditor({
                                  ...lead,
                                  text: lead.generatedEmail,
                                });
                              }}
                            >
                              Edit draft
                            </button>
                            <button
                              className="copy-button"
                              onClick={() => copy(lead)}
                              aria-label={`Copy email for ${domain(lead.companyUrl)}`}
                            >
                              {copied === lead.id ? (
                                <Check size={14} />
                              ) : (
                                <Copy size={14} />
                              )}{" "}
                              {copied === lead.id ? "Copied" : "Copy draft"}
                            </button>
                          </div>
                        ) : (
                          <span className="muted">
                            {lead.status === "FAILED"
                              ? "No draft available"
                              : "Your draft will appear here"}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {visible.length === 0 && (
              <div className="empty-state">
                <div className="empty-icon">
                  <FileSpreadsheet size={26} />
                </div>
                <h3>
                  {loading
                    ? "Loading your companies..."
                    : leads.length
                      ? "No matching companies"
                      : "A fresh start for your outreach"}
                </h3>
                <p>
                  {leads.length
                    ? "Try another search or status filter."
                    : "Upload your first CSV above. Your research and email drafts will appear here."}
                </p>
              </div>
            )}
            <div className="table-footer">
              <span>
                {visible.length} of {leads.length} companies
              </span>
              <span>
                <span
                  className={`live-dot ${connectionError ? "offline" : ""}`}
                />
                {lastUpdated
                  ? `Updated ${lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} • Refreshes every 5s`
                  : "Waiting for API connection"}
              </span>
            </div>
            <div className="pagination">
              <button
                className="button secondary"
                disabled={pagination.current === 1}
                onClick={() => setPage(pagination.current - 1)}
              >
                Previous
              </button>
              <span>
                Page {pagination.current} of {pagination.pages}
              </span>
              <button
                className="button secondary"
                disabled={pagination.current === pagination.pages}
                onClick={() => setPage(pagination.current + 1)}
              >
                Next
              </button>
            </div>
          </section>
          <footer className="page-footer">
            <span>Built for thoughtful outreach.</span>
            <span>AI drafts are a starting point. Review before sending.</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
