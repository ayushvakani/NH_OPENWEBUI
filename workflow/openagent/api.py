# from fastapi import FastAPI
# from fastapi.middleware.cors import CORSMiddleware
# from fastapi.responses import StreamingResponse

# import json
# import asyncio

# from openagent.router.workflow_router import choose_workflow
# from openagent.workflows.insights_workflow import run_workflow as insights_workflow
# from openagent.workflows.chat_workflow import run_workflow as chat_workflow
# from openagent.workflows.report_workflow import run_workflow as report_workflow

# app = FastAPI()

# # ✅ CORS (fixes OPTIONS issue)
# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=["*"],
#     allow_credentials=True,
#     allow_methods=["*"],
#     allow_headers=["*"],
# )

# # ✅ Models endpoint (OpenAI-compatible)
# @app.get("/v1/models")
# async def get_models():
#     return {
#         "object": "list",
#         "data": [
#             {"id": "agent-model", "object": "model"},
#             {"id": "insights-model", "object": "model"},
#             {"id": "report-model", "object": "model"},
#         ]
#     }


# # ✅ Chat / Insights endpoint
# @app.post("/v1/chat/completions")
# async def chat(req: dict):

#     # 1. Get user input
#     user_msg = req["messages"][-1]["content"]

#     # 2. Choose workflow
#     workflow = choose_workflow(user_msg)

#     # 3. Run workflow (NO ECHO anymore)
#     # if workflow == "insights":
#     #     result = await insights_workflow(user_msg)
#     #     model_used = "insights-model"
#     # else:
#     #     result = await chat_workflow(user_msg)
#     #     model_used = "agent-model"
#     # 3. Run workflow (UPDATED)
#     if workflow == "insights":
#         result = await insights_workflow(user_msg)
#         model_used = "insights-model"

#     elif workflow == "report":
#         result = await report_workflow(user_msg)
#         model_used = "report-model"

#     else:
#         result = await chat_workflow(user_msg)
#         model_used = "agent-model"

#     # 🔥 Debug (optional)
#     print("WORKFLOW:", workflow)
#     print("RESULT:", result)

#     # fallback
#     if not result:
#         result = "No response generated."

#     # ================== STREAMING ==================
#     if req.get("stream"):

#         async def stream():
#             text = str(result)

#             for i in range(0, len(text), 20):
#                 chunk_text = text[i:i+20]

#                 chunk = {
#                     "choices": [
#                         {
#                             "delta": {"content": chunk_text},
#                             "index": 0,
#                             "finish_reason": None
#                         }
#                     ]
#                 }

#                 yield f"data: {json.dumps(chunk)}\n\n"
#                 await asyncio.sleep(0.01)

#             yield "data: [DONE]\n\n"

#         return StreamingResponse(stream(), media_type="text/event-stream")

#     # ================== NORMAL RESPONSE ==================
#     return {
#         "id": "chatcmpl-123",
#         "object": "chat.completion",
#         "model": model_used,
#         "choices": [
#             {
#                 "index": 0,
#                 "message": {
#                     "role": "assistant",
#                     "content": str(result)
#                 },
#                 "finish_reason": "stop"
#             }
#         ]
#     }


from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles

import json
import asyncio
import time

from openagent.router.workflow_router import choose_workflow
from openagent.workflows.insights_workflow import run_workflow as insights_workflow
from openagent.workflows.chat_workflow import run_workflow as chat_workflow
from openagent.workflows.report_workflow import run_workflow as report_workflow

app = FastAPI()

# ✅ CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

import os

# ✅ Serve static files (for charts)
static_dir = os.path.join(os.path.dirname(__file__), "static")
os.makedirs(static_dir, exist_ok=True)
app.mount("/static", StaticFiles(directory=static_dir), name="static")

from openagent.services.db_service import get_sales_data
from openagent.services.llm_service import call_llm

# ✅ Dashboard Endpoint for Frontend
@app.get("/api/dashboard")
async def get_dashboard_data():
    sales = await get_sales_data(limit=30)
    
    total_revenue = sum(float(x.get("revenue", 0)) for x in sales)
    total_orders = len(sales)
    avg_order_value = total_revenue / total_orders if total_orders else 0.0

    sorted_sales = sorted(sales, key=lambda x: str(x.get("period", "")))
    
    insights = await call_llm(
        f"Data: {total_revenue} revenue, {total_orders} orders. "
        "Give 1 short sentence insight about sales performance."
    )

    return {
        "metrics": {
            "total_revenue": total_revenue,
            "total_orders": total_orders,
            "avg_order_value": avg_order_value
        },
        "time_series": [
            {"period": item.get("period", ""), "revenue": float(item.get("revenue", 0))}
            for item in sorted_sales
        ],
        "insights": insights or "Sales data successfully loaded."
    }

# ✅ Models endpoint
@app.get("/v1/models")
async def get_models():
    return {
        "object": "list",
        "data": [
            {"id": "agent-model", "object": "model"},
            {"id": "insights-model", "object": "model"},
            {"id": "report-model", "object": "model"},
        ]
    }


# ✅ Chat / Insights / Report endpoint
@app.post("/v1/chat/completions")
async def chat(req: dict):

    # 🔹 1. Get user input
    user_msg = req["messages"][-1]["content"]

    # 🔹 2. Choose workflow
    workflow = choose_workflow(user_msg)

    # 🔹 3. Run workflow (FIXED)
    result = None
    model_used = "agent-model"

    try:
        if workflow == "insights":
            result = await insights_workflow(user_msg)
            model_used = "insights-model"

        elif workflow == "report":
            result = await report_workflow(user_msg)
            model_used = "report-model"

        else:
            result = await chat_workflow(user_msg)
            model_used = "agent-model"

    except Exception as e:
        result = f"Error: {str(e)}"

    # 🔹 Fallback safety
    if not result:
        result = "No response generated."

    # 🔹 Debug logs
    print("WORKFLOW:", workflow)
    print("MODEL:", model_used)
    print("RESULT:", result)

    # ================== STREAMING ==================
    if req.get("stream"):

        async def stream():
            text = str(result)

            for i in range(0, len(text), 20):
                chunk_text = text[i:i+20]

                chunk = {
                    "id": "chatcmpl-stream",
                    "object": "chat.completion.chunk",
                    "created": int(time.time()),
                    "model": model_used,
                    "choices": [
                        {
                            "delta": {"content": chunk_text},
                            "index": 0,
                            "finish_reason": None
                        }
                    ]
                }

                yield f"data: {json.dumps(chunk)}\n\n"
                await asyncio.sleep(0.01)

            yield "data: [DONE]\n\n"

        return StreamingResponse(stream(), media_type="text/event-stream")

    # ================== NORMAL RESPONSE ==================
    return {
        "id": "chatcmpl-123",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": model_used,
        "choices": [
            {
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": str(result)
                },
                "finish_reason": "stop"
            }
        ]
    }