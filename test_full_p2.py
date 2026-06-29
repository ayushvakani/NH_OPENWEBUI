import pandas as pd, json, time

df = pd.read_csv('csv_uploads/4a713df5-68e1-42a1-9580-075b0ca816f0.csv')

recipes = [
  {"title": "Sales by Region", "type": "bar", "x_column": "Region", "y_column": "Population", "aggregation": "sum"},
  {"title": "Average Population by State", "type": "line", "x_column": "State", "y_column": "Population", "aggregation": "avg"},
  {"title": "Count of States", "type": "pie", "x_column": "State", "y_column": "State", "aggregation": "count"}
]

PALETTES = [[{"offset": 0, "color": "#34d399"}]]

def _base_style(config: dict, palette_idx: int) -> dict:
    return config

valid = []
for i, recipe in enumerate(recipes):
    try:
        if not isinstance(recipe, dict): continue
        ch_type = recipe.get("type", "bar")
        x_col = recipe.get("x_column")
        y_col = recipe.get("y_column")
        agg_type = recipe.get("aggregation", "sum")
        title = recipe.get("title", f"Chart {i}")
        
        if not x_col or not y_col or x_col not in df.columns or y_col not in df.columns:
            continue
            
        # Aggregate
        if agg_type == "sum":
            agg = df.groupby(x_col)[y_col].sum().nlargest(10).reset_index()
        elif agg_type in ["avg", "mean"]:
            agg = df.groupby(x_col)[y_col].mean().nlargest(10).reset_index()
        else:
            agg = df.groupby(x_col)[y_col].count().nlargest(10).reset_index()
            
        x_data = agg[x_col].astype(str).tolist()
        y_data = [round(v, 2) for v in agg[y_col].tolist()]
        
        if ch_type == "pie":
            chart_config = {
                "series": [{
                    "type": "pie",
                    "data": [{"name": str(x), "value": y} for x, y in zip(x_data, y_data)]
                }]
            }
        else:
            chart_config = {
                "xAxis": {"type": "category", "data": x_data},
                "yAxis": {"type": "value"},
                "series": [{"type": ch_type, "data": y_data}]
            }
        
        valid.append({
            "id": f"chart_recipe_{i}",
            "title": title,
            "chart_config": chart_config
        })
    except Exception as e:
        print(f"[Phase-2] Error executing recipe: {e}")
        continue

print(f"[Phase-2] Valid charts after execution: {len(valid)}")

for i, ch in enumerate(valid[:7]):
    styled = _base_style(ch.get("chart_config", {}), (i + 3) % len(PALETTES))
    ch["chart_config"] = styled
    # Force unique ID for frontend to avoid duplicate key or missing ID skipping
    ch["id"] = f"p2_chart_{int(time.time()*100)}_{i}"
    payload = json.dumps({"chart": ch, "index": i + 3})
    print(f"data: {payload}")
