import httpx
import traceback

# Timeout reduced to 20s for snappier dashboard loads
LLM_TIMEOUT = 20.0 
OLLAMA_MODEL = "gemma3:270m"

async def call_llm(prompt: str) -> str:
    """
    Call the local Ollama LLM to generate insights.
    Uses a small, fast model to ensure the dashboard loads quickly.
    Returns the response string, or an empty string if generation fails/times out.
    """
    try:
        async with httpx.AsyncClient(timeout=LLM_TIMEOUT) as client:
            res = await client.post(
                "http://localhost:11434/api/generate",
                json={
                    "model": OLLAMA_MODEL,
                    "prompt": prompt,
                    "stream": False
                }
            )
            res.raise_for_status()
            data = res.json()
            return data.get("response", "").strip()
    except httpx.TimeoutException:
        print(f"[llm_service] WARN: LLM timeout after {LLM_TIMEOUT}s")
        # report_workflow.py handles empty responses gracefully
        return ""
    except Exception as e:
        print(f"[llm_service] ERROR calling Ollama: {e}")
        return ""
