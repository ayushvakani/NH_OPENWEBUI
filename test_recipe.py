import pandas as pd

df = pd.read_csv('csv_uploads/5e1b6234-3001-4b67-91e7-22bba252daf6.csv')

recipes = [
  {"title": "Sales by Region", "type": "bar", "x_column": "Region", "y_column": "Population", "aggregation": "sum"},
  {"title": "Average Population by State", "type": "line", "x_column": "State", "y_column": "Population", "aggregation": "avg"}
]

for recipe in recipes:
    try:
        x_col = recipe.get("x_column")
        y_col = recipe.get("y_column")
        agg_type = recipe.get("aggregation")

        if not x_col or not y_col or x_col not in df.columns or y_col not in df.columns:
            print(f"Skipped {recipe['title']} because columns missing")
            continue

        agg = None
        if agg_type == "sum":
            agg = df.groupby(x_col)[y_col].sum().nlargest(10).reset_index()
        elif agg_type == "avg":
            agg = df.groupby(x_col)[y_col].mean().nlargest(10).reset_index()
        elif agg_type == "count":
            agg = df.groupby(x_col)[y_col].count().nlargest(10).reset_index()

        if agg is None or agg.empty:
            print(f"Skipped {recipe['title']} because agg is None or empty")
            continue

        x_data = agg[x_col].astype(str).tolist()
        y_data = agg[y_col].tolist()
        
        print(f"Success for {recipe['title']}: {len(x_data)} points")
    except Exception as e:
        print(f"Error for {recipe['title']}: {e}")
