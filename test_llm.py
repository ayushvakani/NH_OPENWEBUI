import requests, json

prompt = """You are a Data Visualization Expert.
Analyze the schema below and generate a JSON array of exactly 7 chart "recipes".
We will use these recipes to aggregate the actual data in Python.

DATASET SCHEMA:
Country (text), State (text), Region (text), Population (numeric)

RULES:
1. Output ONLY a valid JSON array of objects. NO markdown formatting, NO explanations. Start directly with [
2. Each recipe MUST have this exact structure:
   {"title": "Descriptive Title", "type": "bar", "x_column": "Exact_Column_Name", "y_column": "Exact_Column_Name", "aggregation": "sum"}
3. Valid "type" values: bar, line, pie, scatter, area, gauge, horizontalBar, map, kpi
4. For "map", include an extra key "map_region" (either "world" or "India").
5. Valid "aggregation" values: sum, avg, count
6. Use REAL column names from the schema. Check spelling carefully.
7. Make charts insightful (e.g. Sales by Region, Average Profit by Category).
8. Provide a diverse mix of chart types (include at least one kpi, pie, line, gauge, etc.).

RESPOND WITH ONLY THE RAW JSON ARRAY:"""

r = requests.post('http://localhost:11434/api/generate',
    json={'model': 'qwen3.5:0.8b', 'prompt': prompt, 'stream': False,
          'options': {'temperature': 0.1}},
    timeout=300)
raw = r.json().get('response', '')
print('RAW:')
print(raw)
try:
    json.loads(raw)
    print('JSON IS VALID')
except Exception as e:
    print('JSON ERROR:', e)
