# OpenAgent Report & Charts Fix

**Status: Complete**

## Steps
1. [x] Seed sales data (16 rows 2024)
2. [x] Add error handling & logging to report_workflow.py
3. [x] Reduce chart size for shorter b64
4. [x] Use faster LLM for insights
5. [x] Test curl & OpenWebUI
6. [x] Restart server

**Step 2 done:**
- `report_workflow.py` — full 7-stage logging with timestamps, `safe_parse()` for LLM JSON,
  per-stage try/except with `traceback.format_exc()`, error HTML page returned on DB failure.
- `db.py` — SQLite fallback when `OPENAGENT_DATABASE_URL` env var not set (fixes silent crash
  caused by missing local Postgres). Set `OPENAGENT_DATABASE_URL=postgresql+asyncpg://...`
  in `.env` to switch back to Postgres.

**Step 3 done:**
- `chart_utils.py` — removed all kaleido/PNG/base64 functions (`fig_to_base64`,
  `create_revenue_chart_image`, `create_metrics_chart_image`).
  Charts already rendered by ApexCharts JS in the HTML with raw data arrays — no server-side
  image encoding needed. `save_fig_to_file()` kept for optional email attachment use.
- `requirements.txt` — kaleido commented out, aiosqlite + asyncpg + sqlalchemy[asyncio] added.

**Step 4 done:**
- `llm_service.py` — switched to `gemma3:270m` (local Ollama) for instant insights generation.
- Reduced timeout from 60s to 20s and added exception handling to return empty strings gracefully on timeout/error.

**Step 5 done:**
- Fixed `api.py` static directory mount crash.
- Added `/api/dashboard` to `workflow/openagent/api.py` for live metrics.
- Added `dashboard_proxy` route to `backend/main.py` at `/api/dashboard/sales` with JWT protection.
- Created `useDashboardData.ts` hook for React with auto-polling (30s) and fallback data.
- Refactored `Dashboard.tsx` to handle loading/error states and display real backend metrics.
- Protected `/#/dashboard` route in `App.tsx` so only authenticated users can access it.

**Current Issue:** Ready for Server Restart (Step 6) & End-to-End Test.
