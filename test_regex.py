import re, json
raw = '''[
  {"title": "Sales by Region", "type": "bar", "x_column": "Region", "y_column": "Population", "aggregation": "sum"},
  {"title": "Average Population by State", "type": "line", "x_column": "State", "y_column": "Population", "aggregation": "avg"},
  {"title": "Top 5 States by Population", "type": "p
'''
recipes = []
for m in re.finditer(r'\{[^{}]*\}', raw):
    try:
        recipes.append(json.loads(m.group(0)))
    except: pass
print('Found:', len(recipes))
for r in recipes: print(r)
