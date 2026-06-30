from fastapi import APIRouter, File, UploadFile, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.encoders import jsonable_encoder
from typing import Dict, Any, Optional
import pandas as pd
import numpy as np
import uuid, os, shutil, json, asyncio, re, time, requests as req_lib
from data_analysis import query_ollama_data_analysis

router = APIRouter()
dataset_cache: dict = {}
UPLOAD_DIR = "csv_uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# ─── Color system ─────────────────────────────────────────────────────────────
PALETTES = [
    [{"offset": 0, "color": "#34d399"}, {"offset": 1, "color": "#22d3ee"}],
    [{"offset": 0, "color": "#6366f1"}, {"offset": 1, "color": "#a855f7"}],
    [{"offset": 0, "color": "#f59e0b"}, {"offset": 1, "color": "#ef4444"}],
    [{"offset": 0, "color": "#ec4899"}, {"offset": 1, "color": "#8b5cf6"}],
    [{"offset": 0, "color": "#06b6d4"}, {"offset": 1, "color": "#3b82f6"}],
]
COLORS10 = ["#34d399","#6366f1","#f59e0b","#ec4899","#22d3ee","#a855f7","#ef4444","#10b981","#3b82f6","#8b5cf6"]

def _base_style(config: dict, palette_idx: int) -> dict:
    """Inject premium dark-mode chrome into any ECharts option dict."""
    p = PALETTES[palette_idx % len(PALETTES)]
    config["backgroundColor"] = "transparent"
    config.setdefault("color", COLORS10)
    config["tooltip"] = {
        "trigger": "axis" if "xAxis" in config else "item",
        "backgroundColor": "rgba(7,14,28,0.95)",
        "borderColor": p[0]["color"],
        "borderWidth": 1,
        "textStyle": {"color": "#e2e8f0", "fontSize": 13},
        "padding": [12, 16], "borderRadius": 10,
        "shadowBlur": 24, "shadowColor": "rgba(0,0,0,0.6)",
    }
    for ax in ("xAxis", "yAxis"):
        if ax in config and isinstance(config[ax], dict):
            a = config[ax]
            a["axisLabel"] = {**a.get("axisLabel", {}), "color": "#94a3b8", "fontSize": 11}
            a["splitLine"] = {"lineStyle": {"color": "rgba(255,255,255,0.05)", "type": "dashed"}}
            a["axisLine"]  = {"lineStyle": {"color": "rgba(255,255,255,0.08)"}}
            a["axisTick"]  = {"show": False}
    for s in config.get("series", []) if isinstance(config.get("series"), list) else []:
        t = s.get("type", "")
        s["animationDuration"] = 1600; s["animationEasing"] = "cubicOut"
        if t == "bar":
            s.setdefault("itemStyle", {}).update({
                "color": {"type":"linear","x":0,"y":0,"x2":1,"y2":0,"colorStops": p},
                "borderRadius": [4,4,0,0]
            })
            s["barMaxWidth"] = 54
        elif t == "line":
            s.setdefault("lineStyle", {}).update({"width":3,"shadowColor":p[0]["color"],"shadowBlur":12})
            s.setdefault("itemStyle", {}).update({"color": p[0]["color"]})
            s["showSymbol"] = False; s["smooth"] = 0.4
            if "areaStyle" not in s:
                c = p[0]["color"]
                s["areaStyle"] = {"color":{"type":"linear","x":0,"y":0,"x2":0,"y2":1,
                    "colorStops":[{"offset":0,"color":c+"80"},{"offset":1,"color":c+"05"}]}}
        elif t == "pie":
            s.setdefault("itemStyle", {}).update({"borderColor":"#070d1a","borderWidth":3,"borderRadius":8})
            s.setdefault("label", {}).update({"color":"#cbd5e1","fontSize":12})
        elif t == "map":
            s.setdefault("itemStyle", {}).update({
                "areaColor":"rgba(30,41,59,0.8)","borderColor":"rgba(255,255,255,0.15)","borderWidth":0.8
            })
            s.setdefault("emphasis",{}).setdefault("itemStyle",{}).update({"areaColor":p[0]["color"]})
        elif t in ("scatter",):
            s.setdefault("itemStyle",{}).update({"color":p[0]["color"],"opacity":0.8})
        elif t == "radar":
            s.setdefault("lineStyle",{}).update({"color":p[0]["color"]})
            s.setdefault("itemStyle",{}).update({"color":p[0]["color"]})
            s.setdefault("areaStyle",{}).update({"opacity":0.2,"color":p[0]["color"]})
    return config

def make_chart(cid, title, config, phase_idx, insight=None):
    chart = {"id": cid, "title": title, "chart_config": _base_style(config, phase_idx)}
    if insight: chart["insight"] = insight
    return chart

# ─── Schema / KPI helpers ─────────────────────────────────────────────────────
def schema_text(cache, df):
    lines = []
    for c in cache["columns"]:
        if df[c["name"]].nunique() <= 1: continue # Skip useless single-value columns
        uniq = df[c["name"]].dropna().unique()
        samp = [str(v) for v in uniq[:6]]
        lines.append(f"- '{c['name']}' | type:{c['dtype']} | unique:{len(uniq)} | samples:{samp}")
    return "\n".join(lines)

def best_cat(cache, df, exclude=None):
    """Pick the most useful categorical column (highest unique count > 1 in current df, not excluded)."""
    cats = [c for c in cache["columns"]
            if c["dtype"] in ("categorical","text") 
            and df[c["name"]].nunique() > 1
            and (exclude is None or c["name"] != exclude)]
    if not cats: return None
    return max(cats, key=lambda c: df[c["name"]].nunique())["name"]

def best_num(cache, df, exclude=None):
    nums = [c for c in cache["columns"]
            if c["dtype"] == "numeric"
            and (exclude is None or c["name"] != exclude)]
    return nums[0]["name"] if nums else None

def build_kpis(cache, df):
    kpis, icons = [], ["📊","📈","🔢","💡"]
    for i, c in enumerate([c for c in cache["columns"] if c["dtype"]=="numeric"][:4]):
        col = c["name"]
        val = float(df[col].sum())
        mean = float(df[col].mean())
        kpis.append({
            "label": col, "icon": icons[i], "color": ["blue","green","amber","purple"][i],
            "value": f"{val:,.0f}" if val == int(val) else f"{val:,.2f}",
            "sub": f"Avg {mean:,.2f} · {df[col].count():,} rows"
        })
    return kpis

# ─── Upload ───────────────────────────────────────────────────────────────────
@router.post("/upload")
async def upload_dataset(file: UploadFile = File(...)):
    if not file.filename.endswith((".csv",".xlsx",".xls")):
        raise HTTPException(400, "Only CSV or Excel files allowed.")
    did = str(uuid.uuid4())
    ext = os.path.splitext(file.filename)[1]
    fp  = os.path.join(UPLOAD_DIR, f"{did}{ext}")
    with open(fp,"wb") as b: shutil.copyfileobj(file.file, b)
    try:
        df = pd.read_csv(fp) if ext==".csv" else pd.read_excel(fp)
    except Exception as e:
        raise HTTPException(400, f"Parse error: {e}")
    cols = []
    for col in df.columns:
        dtype = str(df[col].dtype)
        if "int" in dtype or "float" in dtype: mt="numeric"
        elif "datetime" in dtype: mt="datetime"
        elif df[col].nunique()<50 and df[col].dtype=="object": mt="categorical"
        else: mt="text"
        # Promote high-unique object cols that look geographic to text so we still show them
        cols.append({"name":str(col),"dtype":mt,
                     "null_pct":round(float(df[col].isnull().sum()/len(df)*100),2),
                     "unique_count":int(df[col].nunique()),
                     "sample_values":df[col].dropna().head(3).astype(str).tolist()})
    dataset_cache[did] = {"file_path":fp,"filename":file.filename,"row_count":len(df),"columns":cols}
    return {"dataset_id":did,"row_count":len(df),"columns":cols}

# ─── Geo detect ───────────────────────────────────────────────────────────────
from rapidfuzz import process, fuzz
INDIAN_STATES = [
    "Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh","Goa","Gujarat",
    "Haryana","Himachal Pradesh","Jharkhand","Karnataka","Kerala","Madhya Pradesh",
    "Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland","Odisha","Punjab","Rajasthan",
    "Sikkim","Tamil Nadu","Telangana","Tripura","Uttar Pradesh","Uttarakhand","West Bengal",
    "Andaman and Nicobar Islands","Chandigarh","Delhi","Jammu and Kashmir","Ladakh","Puducherry"
]

STATE_ABBR = {
    "andhra pradesh": "AP", "arunachal pradesh": "AR", "assam": "AS", "bihar": "BR",
    "chhattisgarh": "CG", "goa": "GA", "gujarat": "GJ", "haryana": "HR",
    "himachal pradesh": "HP", "jharkhand": "JH", "karnataka": "KA", "kerala": "KL",
    "madhya pradesh": "MP", "maharashtra": "MH", "manipur": "MN", "meghalaya": "ML",
    "mizoram": "MZ", "nagaland": "NL", "odisha": "OD", "punjab": "PB", "rajasthan": "RJ",
    "sikkim": "SK", "tamil nadu": "TN", "telangana": "TS", "tripura": "TR",
    "uttar pradesh": "UP", "uttarakhand": "UK", "west bengal": "WB",
    "andaman and nicobar islands": "AN", "chandigarh": "CH", "delhi": "DL",
    "jammu and kashmir": "JK", "ladakh": "LA", "puducherry": "PY"
}

def format_labels(labels):
    return [STATE_ABBR.get(str(lbl).strip().lower(), str(lbl)) for lbl in labels]

def generate_insight(x_data, y_data, x_col, y_col, agg_type="sum"):
    if not x_data or not y_data or len(x_data) == 0: return ""
    pairs = sorted(zip(x_data, y_data), key=lambda x: x[1], reverse=True)
    if agg_type == "sum": prefix = f"Top {x_col} by Total {y_col}"
    elif agg_type in ["avg", "mean"]: prefix = f"Top {x_col} by Avg {y_col}"
    else: prefix = f"Top {x_col} by Count"
    
    top_3 = [f"{k} ({v:,.2f})" for k, v in pairs[:3]]
    insight = f"{prefix}: " + ", ".join(top_3)
    if len(pairs) > 3:
        lowest = pairs[-1]
        insight += f". Lowest is {lowest[0]} ({lowest[1]:,.2f})."
    return insight

def check_geo(did: str) -> dict:
    if not did or did not in dataset_cache: return {"geo_type":"none","geo_column":None,"present_values":[]}
    cache = dataset_cache[did]
    df = pd.read_csv(cache["file_path"]) if cache["file_path"].endswith(".csv") else pd.read_excel(cache["file_path"])
    for col in cache["columns"]:
        if col["dtype"] in ("text","categorical"):
            uniq = df[col["name"]].dropna().unique().tolist()
            if not uniq: continue
            matched = []
            for v in uniq:
                m = process.extractOne(str(v), INDIAN_STATES, scorer=fuzz.token_sort_ratio)
                if m and m[1]>=80: matched.append(m[0])
            if len(matched)/len(uniq)>0.5:
                return {"geo_type":"state","geo_column":col["name"],"present_values":list(set(matched))}
    return {"geo_type":"none","geo_column":None,"present_values":[]}

@router.post("/detect-geo")
async def detect_geo(payload: Dict[str,Any]):
    did = payload.get("dataset_id")
    if not did or did not in dataset_cache: raise HTTPException(404,"Dataset not found")
    return check_geo(did)

# ─── PHASE 1: Instant Python charts ──────────────────────────────────────────
@router.post("/auto-charts")
async def auto_charts(payload: Dict[str,Any]):
    """Instant: 3 charts from pure Pandas. 0 latency."""
    did = payload.get("dataset_id")
    if not did or did not in dataset_cache: raise HTTPException(404,"Dataset not found")
    cache = dataset_cache[did]
    df = pd.read_csv(cache["file_path"]) if cache["file_path"].endswith(".csv") else pd.read_excel(cache["file_path"])
    
    state_filter = payload.get("state_filter")
    if state_filter:
        geo_info = check_geo(did)
        if geo_info.get("geo_type") == "state" and geo_info.get("geo_column"):
            col = geo_info["geo_column"]
            df = df[df[col].astype(str).str.contains(state_filter, case=False, na=False)]
            # If filtering left us with no data, we could return early, but let it proceed and return empty charts
            
    kpis   = build_kpis(cache, df)
    charts = []
    cat1   = best_cat(cache, df)
    cat2   = best_cat(cache, df, exclude=cat1)
    num1   = best_num(cache, df)
    num2   = best_num(cache, df, exclude=num1)
    datetime_cols = [c["name"] for c in cache["columns"] if c["dtype"]=="datetime"]

    # ── Chart 1: Horizontal Bar — top N category by numeric ──────────────────
    if cat1 and num1:
        agg = df.groupby(cat1)[num1].sum().nlargest(12).reset_index()
        insight_text = generate_insight(agg[cat1].tolist(), agg[num1].tolist(), cat1, num1, "sum")
        charts.append(make_chart("p1_bar", f"Top {cat1} by {num1}", {
            "grid": {"left":"2%","right":"12%","bottom":"3%","top":"4%","containLabel":True},
            "xAxis": {"type":"value"},
            "yAxis": {"type":"category","data": format_labels(agg[cat1].astype(str).tolist()[::-1])},
            "series": [{"type":"bar","data": [round(v,2) for v in agg[num1].tolist()[::-1]],
                        "label":{"show":True,"position":"right","color":"#cbd5e1","fontSize":10}}]
        }, 0, insight=insight_text))

    # ── Chart 2: Donut Pie — diverse category/numeric ────────────────────
    pie_cat = cat2 if cat2 else cat1
    pie_num = num2 if (not cat2 and num2) else num1
    if pie_cat and pie_num:
        agg = df.groupby(pie_cat)[pie_num].sum().nlargest(8).reset_index()
        pie_labels = format_labels(agg[pie_cat].astype(str).tolist())
        pie_data = [{"name":n,"value":round(float(r[pie_num]),2)} for n, (_,r) in zip(pie_labels, agg.iterrows())]
        insight_text = generate_insight(pie_labels, agg[pie_num].tolist(), pie_cat, pie_num, "sum")
        charts.append(make_chart("p1_pie", f"{pie_num} Share by {pie_cat}", {
            "series": [{"type":"pie","radius":["42%","72%"],"center":["50%","55%"],
                        "data":pie_data,"label":{"formatter":"{b}\n{d}%","fontSize":11}}]
        }, 1, insight=insight_text))

    # ── Chart 3: Line trend OR stacked bar OR secondary bar ───────────────────
    if datetime_cols and num1:
        dt = datetime_cols[0]
        try:
            df[dt] = pd.to_datetime(df[dt])
            ts = df.groupby(df[dt].dt.to_period("M").astype(str))[num1].sum().reset_index()
            ts.columns = [dt, num1]
            insight_text = generate_insight(ts[dt].tolist(), ts[num1].tolist(), dt, num1, "sum")
            charts.append(make_chart("p1_line", f"{num1} Over Time", {
                "grid":{"left":"4%","right":"4%","bottom":"4%","top":"8%","containLabel":True},
                "xAxis":{"type":"category","data":ts[dt].tolist(),"boundaryGap":False},
                "yAxis":{"type":"value"},
                "series":[{"type":"line","data":[round(v,2) for v in ts[num1].tolist()]}]
            }, 2, insight=insight_text))
        except Exception: pass
    elif cat1 and num1 and num2:
        agg = df.groupby(cat1)[[num1,num2]].sum().nlargest(8,num1).reset_index()
        insight_text = generate_insight(agg[cat1].tolist(), agg[num1].tolist(), cat1, num1, "sum")
        charts.append(make_chart("p1_stacked", f"{num1} vs {num2} by {cat1}", {
            "grid":{"left":"4%","right":"4%","bottom":"4%","top":"8%","containLabel":True},
            "xAxis":{"type":"category","data":format_labels(agg[cat1].astype(str).tolist())},
            "yAxis":{"type":"value"},
            "series":[
                {"name":num1,"type":"bar","data":[round(v,2) for v in agg[num1].tolist()],"stack":"s"},
                {"name":num2,"type":"bar","data":[round(v,2) for v in agg[num2].tolist()],"stack":"s"}
            ],
            "legend":{"textStyle":{"color":"#94a3b8"}}
        }, 2, insight=insight_text))
    elif cat2 and num1:
        # Fallback to secondary categorical breakdown if first two didn't fire
        agg = df.groupby(cat2)[num1].sum().nlargest(10).reset_index()
        insight_text = generate_insight(agg[cat2].tolist(), agg[num1].tolist(), cat2, num1, "sum")
        charts.append(make_chart("p1_bar2", f"{num1} by {cat2}", {
            "grid":{"left":"2%","right":"12%","bottom":"3%","top":"4%","containLabel":True},
            "xAxis":{"type":"category","data":format_labels(agg[cat2].astype(str).tolist())},
            "yAxis":{"type":"value"},
            "series":[{"type":"bar","data":[round(v,2) for v in agg[num1].tolist()]}]
        }, 2, insight=insight_text))

    return {"charts": charts, "kpis": kpis}


# ─── PHASE 2: LLM Batch→Trickle SSE ─────────────────────────────────────────
RECIPE_PROMPT = """You are a Data Visualization Expert.
Analyze the schema below and generate a JSON array of exactly 10 chart "recipes".
We will use these recipes to aggregate the actual data in Python.

DATASET SCHEMA:
{schema}

RULES:
1. Output ONLY a valid JSON array of objects. NO markdown formatting, NO explanations. Start directly with [
2. Each recipe MUST have this exact structure:
   {{"title": "Descriptive Title", "type": "funnel", "x_column": "Exact_Column_Name", "y_column": "Exact_Column_Name", "aggregation": "sum"}}
3. Your JSON array MUST contain EXACTLY 10 objects.
4. Each object MUST use a DIFFERENT "type" from this exact list: ["map", "gauge", "area", "line", "pie", "horizontalBar", "kpi", "scatter", "histogram", "funnel"]. You must use ALL 10 types exactly once.
5. For "map", include an extra key "map_region" (either "world" or "India"). The x_column for "map" MUST strictly be a State/Province column (DO NOT use Country, Region, or City columns) to properly color individual states on a national map.
6. Valid "aggregation" values: sum, avg, count
7. Use REAL column names from the schema. Check spelling carefully.

RESPOND WITH ONLY THE RAW JSON ARRAY:"""

def parse_llm_output(raw: str) -> list:
    text = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL).strip()
    
    # ── Bulletproof regex extraction for flat JSON objects
    recipes = []
    for m in re.finditer(r'\{[^{}]*\}', text):
        try:
            recipes.append(json.loads(m.group(0)))
        except:
            pass
            
    if recipes:
        return recipes

    # Fallback to standard array parsing if regex didn't yield anything
    for fence in ("```json", "```"):
        if fence in text:
            text = text.split(fence)[1].split("```")[0].strip()
            break
    s, e = text.find("["), text.rfind("]")
    if s != -1 and e != -1:
        text = text[s:e+1]
    # Fix common LLM mistakes
    text = re.sub(r",\s*}", "}", text)
    text = re.sub(r",\s*\]", "]", text)
    try:
        return json.loads(text)
    except:
        return []

@router.get("/auto-charts/stream")
async def auto_charts_stream(dataset_id: str, state_filter: Optional[str] = None):
    """Phase 2: LLM generates 10 complex charts, trickled one-by-one via SSE."""
    if not dataset_id or dataset_id not in dataset_cache:
        raise HTTPException(404, "Dataset not found")
    cache = dataset_cache[dataset_id]

    async def generate():
        print(f"[Phase-2] Stream generator started for dataset {dataset_id}", flush=True)
        
        # Don't serve from cache if there's a state_filter active, as we need fresh charts
        if not state_filter and "phase2_charts" in cache and cache.get("phase2_done"):
            print("[Phase-2] Serving from cache!", flush=True)
            for item in cache["phase2_charts"]:
                yield f"data: {json.dumps(jsonable_encoder(item))}\n\n"
            yield 'data: {"done":true}\n\n'
            return
            
        cache["phase2_charts"] = []
        cache["phase2_done"] = False
        
        try:
            df = (pd.read_csv(cache["file_path"]) if cache["file_path"].endswith(".csv")
                  else pd.read_excel(cache["file_path"]))
                  
            if state_filter:
                geo_info = check_geo(dataset_id)
                if geo_info.get("geo_type") == "state" and geo_info.get("geo_column"):
                    col = geo_info["geo_column"]
                    df = df[df[col].astype(str).str.contains(state_filter, case=False, na=False)]

            stext = schema_text(cache, df)
            
            # Dynamically adjust the map rule based on if we are drilling down into a state
            if state_filter:
                modified_prompt = RECIPE_PROMPT.replace(
                    "The x_column for \"map\" MUST strictly be a State/Province column (DO NOT use Country, Region, or City columns) to properly color individual states on a national map.",
                    f"Since we are filtered to {state_filter}:\n- For the 'map' chart ONLY, the x_column MUST be a 'City' or 'District' column so ECharts can match exact map geometry (e.g., 'Pune', 'Surat'). DO NOT use 'Region' for the map.\n- For ALL OTHER 9 charts, you MUST strictly use the 'Region' column as the x_column to break down the data by region!"
                )
                prompt = modified_prompt.format(schema=stext)
            else:
                prompt = RECIPE_PROMPT.format(schema=stext)

            # ── Call Ollama with true async streaming ──
            from config import OLLAMA_BASE_URL
            import httpx

            print(f"[Phase-2] Sending stream request to {OLLAMA_BASE_URL}/api/generate...", flush=True)
            raw_text = ""
            yielded_count = 0
            
            async with httpx.AsyncClient() as client:
                async with client.stream("POST", f"{OLLAMA_BASE_URL}/api/generate",
                    json={"model":"qwen2.5-coder:7b","prompt":prompt,"stream":True,
                          "options":{"temperature":0.1,"num_ctx":2048,"num_predict":2048}},
                    timeout=300) as response:
                    
                    async for line in response.aiter_lines():
                        if not line: continue
                        try:
                            chunk = json.loads(line)
                            raw_text += chunk.get("response", "")
                            
                            # Extract completed JSON objects
                            recipes = []
                            for m in re.finditer(r'\{[^{}]*\}', raw_text):
                                try:
                                    recipes.append(json.loads(m.group(0)))
                                except: pass
                                
                            if len(recipes) > yielded_count:
                                new_recipes = recipes[yielded_count:]
                                for i_offset, recipe in enumerate(new_recipes):
                                    recipe_index = yielded_count + i_offset
                                    if not isinstance(recipe, dict): continue
                                    ch_type = recipe.get("type", "bar")
                                    x_col = recipe.get("x_column")
                                    y_col = recipe.get("y_column")
                                    agg_type = recipe.get("aggregation", "sum")
                                    title = recipe.get("title", f"Chart {recipe_index}")
                                    
                                    if not x_col or not y_col: continue
                                        
                                    col_map = {str(c).lower(): str(c) for c in df.columns}
                                    x_col = col_map.get(str(x_col).lower())
                                    y_col = col_map.get(str(y_col).lower())
                                    
                                    if not x_col or not y_col: continue
                                        
                                    try:
                                        if agg_type == "sum":
                                            agg = df.groupby(x_col)[y_col].sum().nlargest(10).reset_index()
                                        elif agg_type in ["avg", "mean"]:
                                            agg = df.groupby(x_col)[y_col].mean().nlargest(10).reset_index()
                                        else:
                                            agg = df.groupby(x_col)[y_col].count().nlargest(10).reset_index()
                                            
                                        x_data = agg[x_col].astype(str).tolist()
                                        if ch_type != "map":
                                            x_data = format_labels(x_data)
                                        y_data = [round(float(v), 2) for v in agg[y_col].tolist()]
                                        
                                        if ch_type == "kpi":
                                            val = agg[y_col].sum() if agg_type == "sum" else (agg[y_col].mean() if agg_type in ["avg","mean"] else agg[y_col].count())
                                            kpi_obj = {"label": title, "value": f"{val:,.2f}", "sub": f"Aggregated {y_col}", "icon": "📊", "color": "blue"}
                                            payload_dict = {'kpi': kpi_obj}
                                            cache["phase2_charts"].append(payload_dict)
                                            yield f"data: {json.dumps(payload_dict)}\n\n"
                                            continue

                                        if ch_type == "map":
                                            if state_filter:
                                                map_region = state_filter
                                                # Strip common suffixes so ECharts can match exact names (e.g. "Mumbai Region" -> "Mumbai")
                                                clean_x_data = [re.sub(r'(?i)\s+(Region|District|City|Town)$', '', str(x)).strip() for x in x_data]
                                            else:
                                                map_region = str(recipe.get("map_region", "world")).strip()
                                                if map_region.lower() not in ["india", "world"]:
                                                    map_region = "India"
                                                clean_x_data = x_data
                                            chart_config = {
                                                "visualMap": {"left": "right", "min": min(y_data) if y_data else 0, "max": max(y_data) if y_data else 100, "text": ["High", "Low"], "calculable": True},
                                                "series": [{"type": "map", "map": map_region, "data": [{"name": str(x), "value": y} for x, y in zip(clean_x_data, y_data)]}]
                                            }
                                        elif ch_type == "pie":
                                            chart_config = {
                                                "series": [{"type": "pie", "data": [{"name": str(x), "value": y} for x, y in zip(x_data, y_data)]}]
                                            }
                                        elif ch_type == "gauge":
                                            val = round(agg[y_col].mean(), 2) if agg_type in ["avg", "mean"] else round(agg[y_col].sum(), 2)
                                            chart_config = {
                                                "series": [{
                                                    "type": "gauge",
                                                    "max": max(val * 1.5, 100),
                                                    "axisLabel": {"show": False},
                                                    "data": [{"value": val, "name": ""}],
                                                    "progress": {"show": True}, 
                                                    "detail": {"valueAnimation": True, "formatter": "{value}", "fontSize": 24, "offsetCenter": [0, "40%"]}
                                                }]
                                            }
                                        elif ch_type == "horizontalBar":
                                            chart_config = {
                                                "xAxis": {"type": "value"},
                                                "yAxis": {"type": "category", "data": x_data[::-1]},
                                                "series": [{"type": "bar", "data": y_data[::-1]}]
                                            }
                                        elif ch_type == "area":
                                            chart_config = {
                                                "xAxis": {"type": "category", "data": x_data},
                                                "yAxis": {"type": "value"},
                                                "series": [{"type": "line", "areaStyle": {}, "data": y_data}]
                                            }
                                        elif ch_type == "scatter":
                                            chart_config = {
                                                "xAxis": {"type": "category", "data": x_data},
                                                "yAxis": {"type": "value"},
                                                "series": [{"type": "scatter", "data": y_data, "symbolSize": 14, "itemStyle": {"opacity": 0.8}}]
                                            }
                                        elif ch_type == "histogram":
                                            chart_config = {
                                                "xAxis": {"type": "category", "data": x_data},
                                                "yAxis": {"type": "value"},
                                                "series": [{"type": "bar", "data": y_data, "barWidth": "99.5%"}]
                                            }
                                        elif ch_type == "funnel":
                                            chart_config = {
                                                "series": [{"type": "funnel", "data": [{"name": str(x), "value": y} for x, y in zip(x_data, y_data)], "label": {"position": "inside", "color": "#0f172a", "fontWeight": "bold"}}]
                                            }
                                        else:
                                            chart_config = {
                                                "xAxis": {"type": "category", "data": x_data},
                                                "yAxis": {"type": "value"},
                                                "series": [{"type": ch_type, "data": y_data}]
                                            }
                                        
                                        insight_text = generate_insight(x_data, y_data, x_col, y_col, agg_type)
                                        
                                        ch = {
                                            "id": f"p2_chart_{int(time.time()*100)}_{recipe_index}",
                                            "title": title,
                                            "chart_config": chart_config,
                                            "insight": insight_text
                                        }
                                        styled = _base_style(ch.get("chart_config", {}), (recipe_index + 3) % len(PALETTES))
                                        ch["chart_config"] = styled
                                        payload_dict = {"chart": ch, "index": recipe_index + 3}
                                        cache["phase2_charts"].append(payload_dict)
                                        payload = json.dumps(jsonable_encoder(payload_dict))
                                        yield f"data: {payload}\n\n"
                                        
                                    except Exception as e:
                                        print(f"[Phase-2] Error executing recipe {recipe_index}: {e}", flush=True)
                                        
                                yielded_count = len(recipes)
                        except Exception as e:
                            pass
            
            cache["phase2_done"] = True
            yield 'data: {"done":true}\n\n'

        except json.JSONDecodeError as je:
            print(f"[Phase-2] JSON parse error: {je}", flush=True)
            # Send error signal — frontend will hide skeletons
            yield 'data: {"done":true,"error":"json_parse"}\n\n'
        except Exception as e:
            import traceback
            print(f"[Phase-2] Error: {e}", flush=True)
            traceback.print_exc()
            yield 'data: {"done":true,"error":"general"}\n\n'

    return StreamingResponse(generate(), media_type="text/event-stream",
        headers={"Cache-Control":"no-cache","Connection":"keep-alive","X-Accel-Buffering":"no"})


# ─── State detail ─────────────────────────────────────────────────────────────
@router.post("/state-detail")
async def state_detail(payload: Dict[str,Any]):
    did = payload.get("dataset_id"); state = payload.get("state"); geo_col = payload.get("geo_column")
    if not did or did not in dataset_cache: raise HTTPException(404,"Dataset not found")
    if not state or not geo_col: raise HTTPException(400,"Missing params")
    cache = dataset_cache[did]
    df = pd.read_csv(cache["file_path"]) if cache["file_path"].endswith(".csv") else pd.read_excel(cache["file_path"])
    sdf = df[df[geo_col].astype(str).str.contains(state, case=False, na=False)]
    cat1 = best_cat(cache, exclude=geo_col); num1 = best_num(cache)
    charts, kpis = [], []
    if num1:
        kpis.append({"label":f"Avg {num1} in {state}","value":f"{sdf[num1].mean():,.2f}",
                     "sub":"State metric","icon":"📍","color":"green"})
    if cat1 and num1:
        agg = sdf.groupby(cat1)[num1].sum().nlargest(10).reset_index()
        charts.append(make_chart("sd_bar", f"Top {cat1} by {num1} in {state}", {
            "grid":{"left":"2%","right":"12%","bottom":"3%","top":"4%","containLabel":True},
            "xAxis":{"type":"value"},
            "yAxis":{"type":"category","data":agg[cat1].astype(str).tolist()[::-1]},
            "series":[{"type":"bar","data":[round(v,2) for v in agg[num1].tolist()[::-1]],
                       "label":{"show":True,"position":"right","color":"#cbd5e1"}}]
        }, 1))
    return {"charts":charts,"kpis":kpis}

# ─── Custom prompt ────────────────────────────────────────────────────────────
@router.post("/prompt")
async def handle_prompt(payload: Dict[str,Any]):
    did = payload.get("dataset_id"); prompt_text = payload.get("prompt","")
    if not did or did not in dataset_cache: raise HTTPException(404,"Dataset not found")
    cache = dataset_cache[did]
    df = pd.read_csv(cache["file_path"]) if cache["file_path"].endswith(".csv") else pd.read_excel(cache["file_path"])
    stext = schema_text(cache, df)
    
    full_prompt = f"""You are a data visualization expert. Generate ONE chart recipe for this request.
  
DATASET SCHEMA:
{stext}

USER REQUEST: {prompt_text}

RULES:
- Output ONLY a single JSON object. NO markdown. Start with {{
- Structure: {{"title": "Descriptive Title", "type": "funnel", "x_column": "Exact_Column", "y_column": "Exact_Column", "aggregation": "sum"}}
- Valid types: bar, line, pie, area, scatter, funnel
- Valid aggregations: sum, avg, count
- Use REAL column names from schema.

JSON ONLY:"""
    try:
        from config import OLLAMA_BASE_URL
        r = req_lib.post(f"{OLLAMA_BASE_URL}/api/generate",
            json={"model":"qwen2.5-coder:7b","prompt":full_prompt,"stream":False,
                  "options":{"temperature":0.1,"num_ctx":2048,"num_predict":2048}},timeout=120)
        raw = r.json().get("response","")
        text = re.sub(r"<think>.*?</think>","",raw,flags=re.DOTALL).strip()
        for fence in ("```json","```"):
            if fence in text: text = text.split(fence)[1].split("```")[0].strip(); break
        s,e = text.find("{"), text.rfind("}")
        if s!=-1 and e!=-1: text = text[s:e+1]
        recipe = json.loads(text)
        
        ch_type = recipe.get("type", "bar")
        x_col = recipe.get("x_column")
        y_col = recipe.get("y_column")
        agg_type = recipe.get("aggregation", "sum")
        title = recipe.get("title", f"Query: {prompt_text}")
        
        col_map = {str(c).lower(): str(c) for c in df.columns}
        x_col = col_map.get(str(x_col).lower(), x_col)
        y_col = col_map.get(str(y_col).lower(), y_col)
        
        if x_col not in df.columns or y_col not in df.columns:
            raise ValueError("Invalid columns in recipe")
            
        # Aggregate Data
        df_clean = df.dropna(subset=[x_col, y_col])
        if agg_type == "avg":
            agg = df_clean.groupby(x_col)[y_col].mean().nlargest(15).reset_index()
        elif agg_type == "count":
            agg = df_clean.groupby(x_col)[y_col].count().nlargest(15).reset_index()
        else:
            agg = df_clean.groupby(x_col)[y_col].sum().nlargest(15).reset_index()
            
        x_data = agg[x_col].astype(str).tolist()
        y_data = agg[y_col].tolist()
        
        if ch_type in ["pie", "funnel"]:
            chart_config = {
                "series": [{"type": ch_type, "data": [{"name": str(x), "value": y} for x, y in zip(x_data, y_data)], "label": {"position": "inside", "color": "#0f172a", "fontWeight": "bold"}}]
            }
        elif ch_type == "area":
            chart_config = {
                "xAxis": {"type": "category", "data": x_data},
                "yAxis": {"type": "value"},
                "series": [{"type": "line", "areaStyle": {}, "data": y_data}]
            }
        else:
            chart_config = {
                "xAxis": {"type": "category", "data": x_data},
                "yAxis": {"type": "value"},
                "series": [{"type": ch_type, "data": y_data}]
            }
            
        ch = {
            "id": f"c_{uuid.uuid4().hex[:6]}",
            "title": title,
            "chart_config": _base_style(chart_config, 0)
        }
        return {"chart": ch}
    except Exception as ex:
        print(f"[Prompt] {ex}")
        return {"chart":{"id":f"c_{uuid.uuid4().hex[:6]}","title":f"Query: {prompt_text}",
            "chart_config":_base_style({"xAxis":{"type":"category","data":["A","B","C"]},
                "yAxis":{"type":"value"},"series":[{"type":"bar","data":[10,20,15]}]},0)}}
