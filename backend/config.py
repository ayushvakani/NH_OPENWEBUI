# Configuration Management
import os
from typing import List

# API Configuration
API_KEYS_STR = os.getenv("OPENROUTER_API_KEYS", "")
API_KEYS = []
if API_KEYS_STR:
    raw_keys = API_KEYS_STR.replace('\n', ',').replace(';', ',').split(',')
    for key in raw_keys:
        stripped_key = key.strip()
        if stripped_key and len(stripped_key) > 10:
            API_KEYS.append(stripped_key)

# CORS Configuration
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000,http://127.0.0.1:3001,http://localhost:8080,http://127.0.0.1:8080,http://localhost:5173,http://127.0.0.1:5173")
ALLOWED_ORIGINS_LIST = [origin.strip() for origin in ALLOWED_ORIGINS.split(",")]
for dev_origin in ["http://localhost:8080", "http://127.0.0.1:8080"]:
    if dev_origin not in ALLOWED_ORIGINS_LIST:
        ALLOWED_ORIGINS_LIST.append(dev_origin)

# Ollama Configuration
ALLOWED_OLLAMA_MODELS = {
    'anindya/prem1b-sql-ollama-fp116:latest',
    'llama3.1:latest',
    'qwen:0.5b',
    'gemma3:latest',
    'deepseek-v2:latest',
    'deepseek-coder:1.3b',
    'openchat:latest',
    'dolphin3:latest',
    'codellama:latest',
    'qwen2.5vl:latest',
    'deepseek-coder-v2:latest',
    'glm4:9b-chat-q4_0',
    'qwen3:0.6b',
    'llama3.2:1b',
    'llama3.2:3b',
    'deepseek-coder:latest',
    'llama3.1:8b',
    'nomic-embed-text:latest',
    'gpt-oss:latest',
    'gemma3:270m',
    'qwen2:7b',
    'qwen2.5-coder:7b'
}

OLLAMA_BASE_URL = "http://localhost:11434"
DATA_ANALYSIS_MODEL = "deepseek-coder-v2:latest"
MAX_RETRIES = 3
REQUEST_TIMEOUT = 300

# External API Keys
EXA_API_KEY = os.getenv("EXA_API_KEY", "")
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY", "")

# Data directories
DATA_BASE_DIR = os.getcwd() if os.environ.get("DESKTOP_MODE") == "1" else os.path.dirname(__file__)
UPLOAD_DIR = os.path.join(DATA_BASE_DIR, 'uploads')
CSV_UPLOAD_DIR = os.path.join(DATA_BASE_DIR, 'csv_uploads')

# Ensure directories exist
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(CSV_UPLOAD_DIR, exist_ok=True)

# Trial configuration
TRIAL_DAYS = 3
EXPIRY_DAYS = 3

# Required models for auto-pull
REQUIRED_MODELS = ["gemma3:270m"]