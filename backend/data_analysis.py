# Data Analysis Functions
import pandas as pd
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import seaborn as sns
import plotly.express as px
import plotly.graph_objects as go
import requests
import time
import io
import base64
import traceback
import re
import chardet
from contextlib import redirect_stdout
from sklearn.linear_model import LinearRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import r2_score, mean_squared_error
from scipy import stats
from sqlalchemy import create_engine, inspect
import os
import json

def query_ollama_data_analysis(prompt, model, timeout=300, retries=3):
    """Query Ollama API for data analysis with better error handling"""
    from config import OLLAMA_BASE_URL, REQUEST_TIMEOUT, MAX_RETRIES
    
    url = f"{OLLAMA_BASE_URL}/api/generate"
    headers = {"Content-Type": "application/json"}
    data = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": 0.1,
            "top_p": 0.9,
            "num_ctx": 4096
        }
    }
    
    for attempt in range(retries):
        try:
            response = requests.post(url, headers=headers, json=data, timeout=timeout)
            if response.status_code == 200:
                result = response.json()
                if 'response' in result:
                    return result['response']
                else:
                    return "Error: Unexpected response format from Ollama"
            else:
                error_msg = f"HTTP {response.status_code}"
                try:
                    error_data = response.json()
                    if 'error' in error_data:
                        error_msg = error_data['error']
                except:
                    error_msg = response.text or error_msg
                
                if attempt == retries - 1:
                    return f"API Error: {error_msg}"
        except requests.exceptions.Timeout:
            if attempt == retries - 1:
                return "TIMEOUT_ERROR"
        except Exception as e:
            if attempt == retries - 1:
                return f"Connection Error: {str(e)}"
        
        if attempt < retries - 1:
            wait_time = (2 ** attempt) * 2
            time.sleep(wait_time)
    
    return "Failed after multiple attempts"

def generate_fallback_code(question, df):
    """Intelligent fallback code generator"""
    question_lower = question.lower()
    numeric_cols = df.select_dtypes(include=['number']).columns.tolist()

    if any(k in question_lower for k in ["average", "mean", "minimum", "maximum", "max", "min", "median", "summary", "describe"]):
        for col in numeric_cols:
            if col.lower() in question_lower:
                return f"""
# Summary stats for {col}
avg = df["{col}"].mean()
min_val = df["{col}"].min()
max_val = df["{col}"].max()
median_val = df["{col}"].median()
print("Column: {col}")
print(f"Average (Mean): {{avg:.2f}}")
print(f"Median: {{median_val:.2f}}")
print(f"Minimum: {{min_val}}")
print(f"Maximum: {{max_val}}")
"""
        return """
print("Summary Statistics for Numeric Columns:")
print(df.describe())
"""

    if any(k in question_lower for k in ["distribution", "histogram", "frequency", "spread"]):
        target_col = next((col for col in numeric_cols if col.lower() in question_lower), numeric_cols[0])
        return f"""
# Histogram for {target_col}
import matplotlib.pyplot as plt
plt.figure(figsize=(8,5))
plt.hist(df["{target_col}"].dropna(), bins=20, color='skyblue', edgecolor='black')
plt.title("Distribution of {target_col}")
plt.xlabel("{target_col}")
plt.ylabel("Frequency")
plt.tight_layout()
plt.show()
"""

    if any(k in question_lower for k in ["correlation", "relationship", "compare", "association"]):
        if "heatmap" in question_lower or "matrix" in question_lower:
            return """
# Correlation heatmap
import matplotlib.pyplot as plt
import seaborn as sns
numeric_df = df.select_dtypes(include=['number'])
plt.figure(figsize=(10,8))
sns.heatmap(numeric_df.corr(), annot=True, cmap='coolwarm', fmt='.2f')
plt.title('Correlation Heatmap')
plt.tight_layout()
plt.show()
print(numeric_df.corr())
"""
        matches = re.findall(r"([a-z_]+)\s*(?:vs|against|and)\s*([a-z_]+)", question_lower)
        if matches:
            col1, col2 = matches[0]
            col1 = next((c for c in df.columns if col1 in c.lower()), numeric_cols[0])
            col2 = next((c for c in df.columns if col2 in c.lower()), numeric_cols[1])
            return f"""
# Scatter plot between {col1} and {col2}
import matplotlib.pyplot as plt
plt.figure(figsize=(8,6))
plt.scatter(df["{col1}"], df["{col2}"], alpha=0.6, color='teal')
plt.title("{col1} vs {col2}")
plt.xlabel("{col1}")
plt.ylabel("{col2}")
plt.tight_layout()
plt.show()
"""

    if "by" in question_lower or "group" in question_lower or "range" in question_lower:
        target_col = next((col for col in numeric_cols if col.lower() in question_lower and "by" not in col.lower()), "median_income")
        group_col = None
        for col in df.columns:
            if col.lower() in question_lower.split("by")[-1]:
                group_col = col
                break
        if not group_col:
            group_col = numeric_cols[1] if len(numeric_cols) > 1 else df.columns[0]

        return f"""
# Grouped bar chart of average {target_col} by {group_col} range
import matplotlib.pyplot as plt
import pandas as pd
df['{group_col}_range'] = pd.cut(df['{group_col}'], bins=5)
avg_data = df.groupby('{group_col}_range')['{target_col}'].mean()

plt.figure(figsize=(10,6))
avg_data.plot(kind='bar', color='cornflowerblue', edgecolor='black')
plt.title('Average {target_col} by {group_col} Range')
plt.xlabel('{group_col} Range')
plt.ylabel('Average {target_col}')
plt.xticks(rotation=45)
plt.tight_layout()
plt.show()
print(avg_data)
"""

    if any(k in question_lower for k in ["trend", "over time", "year", "month", "timeline", "progression"]):
        target_col = next((col for col in numeric_cols if col.lower() in question_lower), numeric_cols[0])
        return f"""
# Line chart showing trend of {target_col} over index
import matplotlib.pyplot as plt
plt.figure(figsize=(8,5))
plt.plot(df.index, df["{target_col}"], color='orange')
plt.title("Trend of {target_col} over dataset index")
plt.xlabel("Index")
plt.ylabel("{target_col}")
plt.tight_layout()
plt.show()
"""

    return """
print("Dataset Shape:", df.shape)
print("\\nColumn Info:")
print(df.dtypes)
print("\\nBasic Statistics:")
print(df.describe())
print("\\nMissing Values:")
print(df.isnull().sum())
"""

def execute_data_analysis_code(code, df, table_name=None, globals_dict=None):
    """Safely execute Python code with dataframe context and SQL support"""
    if globals_dict is None:
        globals_dict = {}
    
    engine = None
    if table_name:
        engine = create_engine(f'sqlite:///databases/analysis.db')
    
    exec_globals = {
        'df': df,
        'pd': pd,
        'np': np,
        'plt': plt,
        'sns': sns,
        'px': px,
        'go': go,
        'stats': stats,
        'LinearRegression': LinearRegression,
        'train_test_split': train_test_split,
        'r2_score': r2_score,
        'mean_squared_error': mean_squared_error,
        'execute_sql': lambda query: execute_sql_query(query, engine) if engine else None,
        'table_name': table_name,
        **globals_dict
    }
    
    cleaned_code = code.replace("pd.read_csv('path_to_your_dataset.csv')", "df")
    cleaned_code = cleaned_code.replace("pd.read_csv(", "# pd.read_csv(")
    cleaned_code = cleaned_code.replace("df = pd.read_csv", "# df = pd.read_csv")
    
    output = io.StringIO()
    chart_data = None
    
    try:
        with redirect_stdout(output):
            exec(cleaned_code, exec_globals)
        
        printed_output = output.getvalue()
        
        if plt.get_fignums():
            fig = plt.gcf()
            buffer = io.BytesIO()
            fig.savefig(buffer, format='png', dpi=300, bbox_inches='tight')
            buffer.seek(0)
            plot_data = buffer.getvalue()
            buffer.close()
            chart_data = base64.b64encode(plot_data).decode('utf-8')
            plt.clf()
            plt.close('all')
        
        return {
            'success': True,
            'output': printed_output,
            'chart': chart_data,
            'globals': exec_globals
        }
    
    except Exception as e:
        plt.close('all')
        return {
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc()
        }

def save_to_sql_database(df, table_name, db_path="databases/analysis.db"):
    """Save DataFrame to SQLite database"""
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    engine = create_engine(f'sqlite:///{db_path}')
    df.to_sql(table_name, engine, if_exists='replace', index=False)
    return engine

def execute_sql_query(query, engine):
    """Execute SQL query, print results, and return DataFrame"""
    try:
        df = pd.read_sql_query(query, engine)
        print("SQL Query Results:")
        print(df.head(20).to_string(index=False))
        return df
    except Exception as e:
        print(f"SQL Query Error: {str(e)}")
        raise Exception(f"SQL Query Error: {str(e)}")

def get_database_engine():
    db_path = "databases/analysis.db"
    return create_engine(f"sqlite:///{db_path}")

def load_csv_file(file_path):
    """Load CSV file with multiple fallback methods"""
    with open(file_path, 'rb') as f:
        raw_content = f.read()
    
    try:
        detected_enc = chardet.detect(raw_content)['encoding']
        print(f"Detected encoding: {detected_enc}")
        if detected_enc is None:
            detected_enc = 'utf-8'
    except Exception as e:
        print(f"Error detecting encoding: {str(e)}")
        detected_enc = 'utf-8'
    
    if file_path.lower().endswith(('.xlsx', '.xls')):
        try:
            print(f"Detected Excel file, attempting to read with pd.read_excel: {file_path}")
            df = pd.read_excel(file_path)
            if df is not None and not df.empty:
                print(f"Successfully read Excel file. Shape: {df.shape}")
                df.columns = df.columns.astype(str).str.strip()
                return df
        except Exception as e:
            print(f"Failed to read Excel file: {str(e)}")
            return None

    methods = [
        (lambda: pd.read_csv(file_path, encoding=detected_enc), f"detected encoding ({detected_enc})"),
        (lambda: pd.read_csv(file_path, encoding='utf-8'), "utf-8"),
        (lambda: pd.read_csv(file_path, encoding='latin1'), "latin1"),
        (lambda: pd.read_csv(file_path, encoding='cp1252'), "cp1252"),
        (lambda: pd.read_csv(file_path, encoding='iso-8859-1'), "iso-8859-1"),
        (lambda: pd.read_csv(file_path, sep=';', encoding=detected_enc), f"semicolon separator, {detected_enc}"),
        (lambda: pd.read_csv(file_path, sep='\t', encoding=detected_enc), f"tab separator, {detected_enc}"),
        (lambda: pd.read_csv(file_path, encoding=detected_enc, on_bad_lines='skip'), f"skip bad lines, {detected_enc}"),
        (lambda: pd.read_csv(file_path, encoding=detected_enc, engine='python'), f"python engine, {detected_enc}"),
        (lambda: pd.read_csv(file_path, encoding=detected_enc, delimiter=None), f"auto delimiter, {detected_enc}")
    ]
    
    errors = []
    for method, description in methods:
        try:
            print(f"Trying to read CSV with {description}")
            df = method()
            if df is not None and not df.empty:
                print(f"Successfully read CSV with {description}")
                print(f"DataFrame shape: {df.shape}")
                print(f"Columns: {df.columns.tolist()}")
                
                df.columns = df.columns.str.strip()
                for col in df.columns:
                    try:
                        df[col] = df[col].replace(',', '', regex=True).astype(float)
                    except Exception:
                        pass

                print(f"Converted dtypes:\n{df.dtypes}")
                return df

        except Exception as e:
            error_msg = f"Method '{description}' failed: {str(e)}"
            print(error_msg)
            errors.append(error_msg)
            continue
    
    error_details = "\n".join(errors)
    print(f"All methods failed to read the CSV file. Errors:\n{error_details}")
    return None