# LeadEnrich AI

A local B2B lead research application. Upload a CSV of company URLs, research their websites with a Python worker, and generate a company summary plus a personalized three-sentence email using Gemini. Emails are drafts only; the application does not send them.

## Project structure

```text
frontend/       React, Vite, Tailwind CSS, Lucide dashboard
backend/        Express API, CSV validation, Mongoose Lead model
ai_worker/      MongoDB queue consumer, website extraction, Gemini generation
examples/       Sample CSV
```

## Prerequisites

- Node.js 22.12+ or Node.js 24 LTS, with npm.
- Python 3.11+.
- A running MongoDB instance, locally or through Atlas.
- A Gemini API key with access to the model configured in `GEMINI_MODEL`.

The commands below use PowerShell from the project root. On macOS/Linux use `cp` instead of `Copy-Item` and `.venv/bin/python` instead of `.venv/Scripts/python.exe`.

## 1. Install and configure

```powershell
npm --prefix backend ci
npm --prefix frontend ci
python -m venv ai_worker/.venv
ai_worker/.venv/Scripts/python.exe -m pip install -r ai_worker/requirements.txt
Copy-Item backend/.env.example backend/.env
Copy-Item ai_worker/.env.example ai_worker/.env
```

Copy the environment examples only during first setup, so existing credentials are not overwritten. Put your key in `ai_worker/.env` as `GEMINI_API_KEY`. Never place it in frontend code or commit `.env` files.

Both services must use the same `MONGODB_URI` and `MONGODB_DB`. Defaults are `mongodb://127.0.0.1:27017` and `leadenrich`. The database and collection are created when the first records are inserted. For Atlas, set the connection string in both environment files, configure network access, and use a database user with read/write access to this database.

If MongoDB is installed as a local service, start that service. Alternatively, with Docker installed:

```powershell
docker run --name leadenrich-mongo -p 127.0.0.1:27017:27017 -v leadenrich-data:/data/db -d mongo:8
```

Do not run the Docker command if another MongoDB instance already uses port 27017. For a previously created container use `docker start leadenrich-mongo`.

The worker uses Google's supported `google-genai` SDK. The requested legacy `google-generativeai` package is retained in `requirements.txt` for compatibility with the original project specification, but is not imported. See [Google's SDK guidance](https://ai.google.dev/gemini-api/docs/libraries). The model defaults to `gemini-2.5-flash`; set `GEMINI_MODEL` to a model available to your account if needed.

## 2. Start the three services

Open three terminals in the project root.

Terminal 1, API:

```powershell
npm --prefix backend run dev
```

The API listens on `http://127.0.0.1:5000` after connecting to MongoDB. `GET /api/health` returns `{"status":"ok"}`. This endpoint indicates the HTTP process is running, not continuous database readiness.

Terminal 2, frontend:

```powershell
npm --prefix frontend run dev
```

Open [the dashboard](http://localhost:5173). Vite proxies `/api` requests to port 5000. If changing the backend port, update `frontend/vite.config.js` too.

Terminal 3, worker:

```powershell
ai_worker/.venv/Scripts/python.exe ai_worker/worker.py
```

The worker checks MongoDB every five seconds when idle. Set `POLL_INTERVAL_SECONDS` to change this. Stop any service with Ctrl+C.

## 3. Upload companies

Use `examples/companies.csv`, the dashboard's downloadable template, or a UTF-8 CSV with exactly one column:

```csv
companyUrl
https://www.python.org
https://www.mozilla.org
```

Use full HTTP or HTTPS URLs. Uploads allow at most 1,000 URLs and 1 MB. The API validates the full CSV before writing records, normalizes URLs, and removes duplicate URLs within one upload. Re-uploading a URL creates a new lead and may incur another Gemini call.

The dashboard refreshes every five seconds and also has a Refresh button, company search, status filters, and a copy-draft button.

### Lead management

- Retry one failed lead from its row, or use **Retry all failed**. Only failed records are requeued. Retries may incur Gemini usage when processed.
- Select **Edit draft** on a completed lead, edit, and save. Changes persist in MongoDB. Conflicting saves are rejected: copy your changes, cancel, and reopen the latest draft. Manual edits may use any sentence count.
- **Export matching leads** downloads all leads matching the search and status filter, including every matching page. Formula-like values receive an apostrophe prefix for spreadsheet safety.
- Tables display ten leads per page. Pagination is local to the dashboard; the API still returns all records.

Additional API endpoints:

- `POST /api/leads/:id/retry`: requeue one failed lead; HTTP 409 if no longer failed.
- `POST /api/leads/retry-failed`: requeue all failed leads and return the count.
- `PATCH /api/leads/:id/email`: save `generatedEmail` and the original `updatedAt` timestamp for a completed lead. HTTP 409 protects against conflicting edits. Drafts allow 1 to 10,000 characters.

## API and data flow

- `POST /api/upload`: multipart form data with one CSV in the `file` field. Returns HTTP 201 and `{"count":2}`.
- `GET /api/leads`: returns all leads, newest first.
- `GET /api/health`: basic process health.

```text
CSV -> Express -> MongoDB PENDING
                       |
                 Python claims lead
                       |
                   PROCESSING
                       |
             Website text -> Gemini
                       |
              COMPLETED or FAILED
                       |
                React refreshes
```

Each lead contains a UUID `id`, `companyUrl`, `status`, nullable `companySummary` and `generatedEmail`, plus timestamps and a readable `error` on failure. Internal lease fields prevent duplicate claims and stale worker writes. A worker interrupted mid-job can have its lead reclaimed after five minutes. This is at-least-once processing: a crash after a Gemini response but before saving may cause another API call. Failed leads remain visible; fix the cause and use the retry controls to try again.

The scraper reads the submitted page's main text, follows at most five redirects, blocks non-public destination addresses at each hop, pins the checked IP for the connection, verifies TLS for the original hostname, and bounds response size and reading time. It does not crawl the whole site, render JavaScript, or bypass blocked pages. The Gemini request treats website text as untrusted evidence and requests a summary plus exactly three email sentence entries. Review generated facts and sentence wording before use.

## Verification

```powershell
npm --prefix backend test
node --test frontend/src/leadUtils.test.js
ai_worker/.venv/Scripts/python.exe -m unittest discover -s ai_worker -p "test_*.py" -v
npm --prefix frontend run lint
npm --prefix frontend run build
node backend/tests/mongo.integration.js
```

The final command requires local MongoDB and the Python environment. It creates a unique `leadenrich_test_*` database, exercises CSV upload, real Mongoose persistence, Python claiming and lease recovery, completion, and API reads, then removes only its temporary database. Website content and Gemini responses are mocked in this test. It makes no Gemini calls. Set `TEST_MONGODB_URI` for a different MongoDB test server. On macOS/Linux set `WORKER_PYTHON` to the absolute path to `ai_worker/.venv/bin/python`.

For a live smoke test, configure a real Gemini key, start all services, upload one accessible company URL, and confirm it becomes `COMPLETED` with a summary and draft. This incurs normal Gemini usage.

## Troubleshooting and scope

- API connection failure: verify MongoDB is running and both services use matching settings.
- Leads stay `PENDING`: start the worker and configure its Gemini key.
- Leads become `FAILED`: inspect the row's message and worker logs. Check the key, model access, quota, and whether the website exposes readable HTML.
- Port 5173 is occupied: stop the other frontend or change the Vite port and `FRONTEND_ORIGIN` together.
- Atlas DNS/TLS failure: verify the network allowlist and installed CA certificates. Do not disable TLS validation.

This is the requested local MVP. It has no authentication, tenant isolation, billing, or outbound email sending. The API binds to loopback by default. Add authentication, tenant ownership checks, rate limits, pagination, operational monitoring, and deployment-specific network controls before making it a public multi-customer service. Production static hosting must proxy `/api` to the backend; the development Vite proxy is not part of the compiled bundle.
