"""
chart_utils.py — OpenAgent Chart Utilities
──────────────────────────────────────────
NOTE (Step 3 of workflow/TODO.md):
  The original kaleido/PNG → base64 approach was removed because:
  1. The base64 strings exceeded OpenWebUI's rendering limit (truncation bug).
  2. report_workflow.py already passes raw data arrays to ApexCharts in the
     generated HTML — no server-side image rendering is needed.
  3. kaleido requires a separate binary install (often fails in CI/Docker).

What remains:
  - save_fig_to_file()  → optional static PNG export for e-mail attachments
  - Helper functions for building Plotly figures (return_fig=True) that callers
    can use to save or inspect data — but NOT for base64 encoding.
"""
from __future__ import annotations

import os
from typing import Any, Dict, List, Optional


# ── Optional static file export (still useful for email attachments) ──────────

def save_fig_to_file(fig: Any, filename: str) -> str:
    """
    Save a Plotly figure to disk as PNG in the ./static directory.

    Returns the file path on success, or an empty string on failure
    (e.g. kaleido not installed).

    Usage:
        fig = create_revenue_chart_fig(sales_data)
        path = save_fig_to_file(fig, "revenue.png")
        # → "static/revenue.png"  or  ""
    """
    try:
        import plotly  # noqa: F401 — presence check
    except ImportError:
        print("[chart_utils] plotly not installed — skipping save_fig_to_file")
        return ""

    try:
        static_dir = os.path.join(os.getcwd(), "static")
        os.makedirs(static_dir, exist_ok=True)
        path = os.path.join(static_dir, filename)
        fig.write_image(path, engine="kaleido")
        print(f"[chart_utils] Saved chart → {path}")
        return path
    except Exception as exc:
        print(f"[chart_utils] save_fig_to_file failed: {exc}")
        return ""


# ── Figure builders (return Plotly figure objects, NOT base64) ────────────────

def create_revenue_chart_fig(
    sales_data: List[Dict],
) -> Optional[Any]:
    """
    Build a Plotly line-chart figure for revenue over time.

    Returns the figure object so callers can:
      - save_fig_to_file(fig, "revenue.png")   → PNG file
      - fig.show()                              → open in browser
      - fig.to_json()                           → JSON (for embedding)

    Returns None if sales_data is empty or plotly is missing.
    """
    if not sales_data:
        return None
    try:
        import plotly.express as px
    except ImportError:
        print("[chart_utils] plotly not installed")
        return None

    df_dict = {
        "period": [s.get("period", "") for s in sales_data],
        "revenue": [float(s.get("revenue", 0)) for s in sales_data],
    }
    fig = px.line(
        df_dict,
        x="period",
        y="revenue",
        title="Sales Revenue Over Time",
        labels={"revenue": "Revenue ($)", "period": "Period"},
    )
    fig.update_layout(showlegend=False, width=700, height=400)
    return fig


def create_metrics_chart_fig(metrics: Dict) -> Optional[Any]:
    """
    Build a Plotly bar-chart figure for key metrics.

    Returns the figure object (see create_revenue_chart_fig for usage).
    Returns None if plotly is missing.
    """
    try:
        import plotly.graph_objects as go
    except ImportError:
        print("[chart_utils] plotly not installed")
        return None

    categories = ["Revenue ($)", "Orders", "Avg Order ($)"]
    values = [
        float(metrics.get("total_revenue", 0)),
        float(metrics.get("total_orders", 0)),
        float(metrics.get("avg_order_value", 0)),
    ]
    fig = go.Figure(
        data=[
            go.Bar(
                x=categories,
                y=values,
                text=[f"{v:,.0f}" for v in values],
                textposition="auto",
            )
        ]
    )
    fig.update_layout(
        title="Key Metrics Dashboard",
        showlegend=False,
        width=600,
        height=350,
    )
    return fig