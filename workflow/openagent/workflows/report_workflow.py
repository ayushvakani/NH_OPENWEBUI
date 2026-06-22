import json
import traceback
from datetime import datetime

from openagent.services.db_service import get_sales_data
from openagent.services.llm_service import call_llm
from openagent.tools.emailer import send_email


def safe_parse(text: str) -> dict:
    """Safely parse JSON from LLM output - strips markdown fences if present."""
    try:
        # Strip ```json ... ``` fences
        clean = text.strip()
        if clean.startswith("```"):
            clean = clean.split("```")[1]
            if clean.startswith("json"):
                clean = clean[4:]
        return json.loads(clean.strip())
    except Exception:
        return {}


async def run_workflow(user_input: str) -> str:
    """
    Full sales report workflow.

    Stages (each logged):
      1. Parse date range from user input via LLM
      2. Fetch sales data from DB
      3. Compute metrics
      4. Generate chart data arrays (passed to ApexCharts in HTML)
      5. Generate LLM insights (with timeout fallback)
      6. Optional email dispatch
      7. Render HTML report and return as markdown code block
    """
    run_start = datetime.now()
    logs: list[str] = []

    def log(msg: str):
        elapsed = (datetime.now() - run_start).total_seconds()
        entry = f"[{elapsed:06.2f}s] {msg}"
        logs.append(entry)
        safe_entry = entry.encode('ascii', 'replace').decode('ascii')
        print(f"*** REPORT | {safe_entry}")

    log("START")

    # -- STAGE 1: Parse request ------------------------------------------------
    start_date = "2024-01-01"
    end_date = "2024-12-31"
    try:
        log("Stage 1: parsing date range via LLM")
        parsed_raw = await call_llm(
            f"Extract start_date and end_date from this request. "
            f"Return JSON only, no explanation.\nInput: {user_input}"
        )
        log(f"Stage 1 LLM raw: {parsed_raw[:120]}")
        parsed = safe_parse(parsed_raw)
        start_date = parsed.get("start_date", start_date)
        end_date = parsed.get("end_date", end_date)
        log(f"Stage 1 OK: {start_date} -> {end_date}")
    except Exception:
        log(f"Stage 1 WARN (using defaults): {traceback.format_exc(limit=3)}")

    # -- STAGE 2: Fetch sales data ---------------------------------------------
    sales: list[dict] = []
    try:
        log("Stage 2: fetching sales data from DB")
        sales = await get_sales_data(limit=100, start_date=start_date, end_date=end_date)
        log(f"Stage 2 OK: {len(sales)} records fetched")
    except Exception:
        tb = traceback.format_exc(limit=5)
        log(f"Stage 2 ERROR:\n{tb}")
        # Return a user-friendly error HTML instead of crashing silently
        return _error_html(
            title="Database Error",
            message=(
                "Could not fetch sales data. "
                "Check that the database is running and seeded.\n\n"
                f"<pre style='font-size:11px;color:#f87171'>{tb}</pre>"
            ),
        )

    if not sales:
        log("Stage 2 WARN: no records in range - report will show zeros")

    # -- STAGE 3: Compute metrics ----------------------------------------------
    try:
        log("Stage 3: computing metrics")
        total_revenue = sum(float(x.get("revenue", 0)) for x in sales)
        total_orders = len(sales)
        avg_order_value = total_revenue / total_orders if total_orders else 0.0
        metrics = {
            "total_revenue": total_revenue,
            "total_orders": total_orders,
            "avg_order_value": avg_order_value,
        }
        log(f"Stage 3 OK: {metrics}")
    except Exception:
        tb = traceback.format_exc(limit=3)
        log(f"Stage 3 ERROR:\n{tb}")
        return _error_html("Metrics Error", tb)

    # -- STAGE 4: Build chart data arrays --------------------------------------
    try:
        log("Stage 4: building chart data arrays")
        # Sort by period ascending for chronological charts
        sorted_sales = sorted(sales, key=lambda x: str(x.get("period", "")))
        chart_dates = [str(item.get("period", "")) for item in sorted_sales]
        chart_revenues = [float(item.get("revenue", 0)) for item in sorted_sales]
        log(f"Stage 4 OK: {len(chart_dates)} data points")
    except Exception:
        tb = traceback.format_exc(limit=3)
        log(f"Stage 4 ERROR:\n{tb}")
        chart_dates, chart_revenues = [], []

    # -- STAGE 5: LLM insights (with timeout + fallback) -----------------------
    FALLBACK_INSIGHTS = (
        "Insights generation skipped (LLM unavailable or timed out). "
        "Review the raw metrics above for a manual summary."
    )
    insights = FALLBACK_INSIGHTS
    try:
        log("Stage 5: generating LLM insights")
        insights = await call_llm(
            f"Data: {metrics}\n"
            f"First 3 records: {sorted_sales[:3]}\n\n"
            "Write ONLY:\n"
            "- 3 key insights (bullet points)\n"
            "- 1 anomaly detected\n"
            "- 1 recommendation\n"
            "Be concise. Max 150 words total."
        )
        log(f"Stage 5 OK: {len(insights)} chars")
    except Exception:
        log(f"Stage 5 WARN (using fallback): {traceback.format_exc(limit=2)}")

    # -- STAGE 6: Optional email -----------------------------------------------
    email_result = ""
    if "email" in user_input.lower():
        try:
            log("Stage 6: sending email")
            email_result = send_email(
                to_email="test@example.com",
                subject="Automated Sales Report",
                body=f"Metrics: {metrics}\n\nInsights: {insights}",
            )
            log(f"Stage 6 OK: {email_result}")
        except Exception:
            log(f"Stage 6 WARN: {traceback.format_exc(limit=2)}")

    # -- STAGE 7: Render HTML --------------------------------------------------
    log("Stage 7: rendering HTML")
    log_text = "\n".join(logs)
    insights_html = insights.replace("\n", "<br>")
    email_html = (
        f'<div class="mt-6 p-4 bg-blue-500/10 border border-blue-500/20 '
        f'rounded-lg text-blue-300 text-sm">{email_result}</div>'
        if email_result
        else ""
    )

    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sales Intelligence Dashboard</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/apexcharts"></script>
    <style>
        body {{ background-color: #0f172a; color: #f8fafc; font-family: 'Inter', sans-serif; }}
        .card {{ background: rgba(30, 41, 59, 0.6); border: 1px solid #334155; backdrop-filter: blur(8px); border-radius: 1rem; }}
    </style>
</head>
<body class="p-6">
<div class="max-w-6xl mx-auto">

    <!-- Header -->
    <div class="flex justify-between items-center mb-8">
        <div>
            <h1 class="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                Sales Intelligence Dashboard
            </h1>
            <p class="text-slate-400 mt-1">Automated report - {datetime.now().strftime('%Y-%m-%d %H:%M')}</p>
        </div>
        <div class="text-right">
            <div class="text-xs text-emerald-400 font-mono uppercase tracking-wider">Live Status: Active</div>
            <div class="text-xs text-slate-500 font-mono">{start_date} -> {end_date}</div>
        </div>
    </div>

    <!-- Metrics Grid -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div class="card p-6">
            <div class="text-slate-400 text-xs uppercase tracking-wider mb-1">Total Revenue</div>
            <div class="text-3xl font-bold text-white">${metrics['total_revenue']:,.2f}</div>
            <div class="text-emerald-400 text-xs mt-2">Period: {start_date} -> {end_date}</div>
        </div>
        <div class="card p-6">
            <div class="text-slate-400 text-xs uppercase tracking-wider mb-1">Total Orders</div>
            <div class="text-3xl font-bold text-white">{metrics['total_orders']}</div>
            <div class="text-emerald-400 text-xs mt-2">Records in range</div>
        </div>
        <div class="card p-6">
            <div class="text-slate-400 text-xs uppercase tracking-wider mb-1">Avg Order Value</div>
            <div class="text-3xl font-bold text-white">${metrics['avg_order_value']:,.2f}</div>
            <div class="text-slate-500 text-xs mt-2">Calculated live</div>
        </div>
    </div>

    <!-- Charts -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div class="card p-6">
            <h3 class="text-base font-semibold mb-4 text-slate-200">Revenue Over Time</h3>
            <div id="revenueChart"></div>
        </div>
        <div class="card p-6">
            <h3 class="text-base font-semibold mb-4 text-slate-200">Volume Analysis</h3>
            <div id="volumeChart"></div>
        </div>
    </div>

    <!-- AI Insights -->
    <div class="card p-6 border-emerald-500/30 bg-emerald-500/5 mb-6">
        <div class="flex items-center gap-2 mb-4">
            <span class="text-emerald-400 text-lg">-</span>
            <h3 class="text-base font-semibold text-emerald-400">AI Financial Insights</h3>
        </div>
        <div class="text-slate-300 text-sm leading-relaxed">{insights_html}</div>
    </div>

    {email_html}

    <!-- Debug Log (collapsed) -->
    <details class="card p-4 mt-4">
        <summary class="text-xs text-slate-500 cursor-pointer hover:text-slate-300 transition-colors">
            Workflow execution log ({len(logs)} steps)
        </summary>
        <pre class="text-xs text-slate-600 mt-2 whitespace-pre-wrap font-mono">{log_text}</pre>
    </details>

</div>

<script>
    const baseOpts = {{
        theme: {{ mode: 'dark' }},
        chart: {{ background: 'transparent', toolbar: {{ show: false }}, animations: {{ enabled: true, speed: 600 }} }},
        colors: ['#10b981', '#3b82f6'],
        stroke: {{ curve: 'smooth', width: 3 }},
        grid: {{ borderColor: '#1e293b', padding: {{ left: 10, right: 10 }} }},
        xaxis: {{ categories: {json.dumps(chart_dates)}, axisBorder: {{ show: false }}, axisTicks: {{ show: false }}, labels: {{ style: {{ colors: '#94a3b8', fontSize: '11px' }} }} }},
        yaxis: {{ labels: {{ style: {{ colors: '#94a3b8', fontSize: '11px' }} }} }},
        tooltip: {{ theme: 'dark' }},
        dataLabels: {{ enabled: false }}
    }};

    new ApexCharts(document.querySelector("#revenueChart"), {{
        ...baseOpts,
        series: [{{ name: 'Revenue ($)', data: {json.dumps(chart_revenues)} }}],
        chart: {{ ...baseOpts.chart, type: 'area', height: 300 }},
        fill: {{ type: 'gradient', gradient: {{ shadeIntensity: 1, opacityFrom: 0.5, opacityTo: 0.05 }} }},
    }}).render();

    new ApexCharts(document.querySelector("#volumeChart"), {{
        ...baseOpts,
        series: [{{ name: 'Revenue ($)', data: {json.dumps(chart_revenues)} }}],
        chart: {{ ...baseOpts.chart, type: 'bar', height: 300 }},
        plotOptions: {{ bar: {{ borderRadius: 6, columnWidth: '50%' }} }},
        colors: ['#3b82f6'],
    }}).render();
</script>
</body>
</html>"""

    result = f"```html\n{html_content}\n```"
    log(f"Stage 7 OK: {len(result)} chars total")
    print(f"*** REPORT COMPLETE in {(datetime.now() - run_start).total_seconds():.2f}s")
    return result


def _error_html(title: str, message: str) -> str:
    """Return a formatted error as an HTML markdown block."""
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Report Error</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>body {{ background: #0f172a; color: #f8fafc; font-family: sans-serif; }}</style>
</head>
<body class="p-8 flex items-center justify-center min-h-screen">
    <div class="max-w-xl w-full bg-red-950/40 border border-red-800 rounded-2xl p-8">
        <div class="flex items-center gap-3 mb-4">
            <span class="text-3xl">--</span>
            <h1 class="text-xl font-bold text-red-400">{title}</h1>
        </div>
        <div class="text-slate-300 text-sm leading-relaxed">{message}</div>
        <p class="text-slate-500 text-xs mt-6">Check the server console for full stack trace.</p>
    </div>
</body>
</html>"""
    return f"```html\n{html}\n```"
