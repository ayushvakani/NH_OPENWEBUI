# import asyncio
# import json
# import requests
# from agentscope.agent import AgentBase
# from agentscope.message import Msg


# # ================== OLLAMA ==================
# def call_ollama(prompt):
#     response = requests.post(
#         "http://localhost:11434/api/generate",
#         json={
#             "model": "llama3.2:1b",
#             "prompt": prompt,
#             "stream": False
#         }
#     )

#     data = response.json()

#     # 🔍 DEBUG
#     print("OLLAMA RAW RESPONSE:\n", data)

#     # ✅ Safe handling
#     if "response" in data:
#         return data["response"]
#     elif "message" in data:
#         return data["message"]
#     elif "error" in data:
#         return f"OLLAMA ERROR: {data['error']}"
#     else:
#         return str(data)


# # ================== TOOLS ==================
# from sqlalchemy import select
# from db import AsyncSessionLocal
# from models import Sales

# async def get_sales_data():
#     async with AsyncSessionLocal() as session:
#         result = await session.execute(
#             select(Sales).order_by(Sales.id.desc()).limit(1)
#         )

#         row = result.scalar_one_or_none()

#         if not row:
#             return {}

#         return {
#             "revenue": row.revenue,
#             "growth": row.growth,
#             "period": row.period
#         }

# def fetch_file():
#     return "File content: Project roadmap and milestones."


# def summarize_data(data):
#     return f"""
# Summary:
# Revenue: ${data.get('revenue', 'N/A')}
# Growth: {data.get('growth', 'N/A')}
# Period: {data.get('period', 'N/A')}
# """


# def send_email(content):
#     print("\nEMAIL SENDING...\n")
#     print(content)
#     return "Email sent"


# # ================== PLANNER ==================
# class PlannerAgent(AgentBase):

#     def __init__(self):
#         super().__init__()
#         self.name = "Planner"

#     async def reply(self, x: Msg = None):
#         prompt = f"""
# You are a strict JSON generator.

# Return ONLY valid JSON. No explanation.

# Format:
# [
#   {{"step": "get_sales_data"}},
#   {{"step": "summarize_data"}},
#   {{"step": "send_email"}}
# ]

# Rules:
# - Only use given steps
# - Do NOT invent steps
# - Output MUST be valid JSON

# Available steps:
# - get_sales_data
# - summarize_data
# - fetch_file
# - send_email

# User request:
# {x.content}
# """
#         output = call_ollama(prompt)

#         print("PLANNER RAW OUTPUT:\n", output)  # ✅ debug

#         return Msg(name=self.name, content=output, role="assistant")


# # ================== EXECUTOR ==================
# class ExecutorAgent(AgentBase):

#     def __init__(self):
#         super().__init__()
#         self.name = "Executor"

#     async def run_steps(self, steps):
#         context = {}
#         logs = []

#         for step in steps:
#             action = step.get("step")

#             if action == "get_sales_data":
#                 context["data"] = await get_sales_data()
#                 logs.append("OK got sales data")

#             elif action == "summarize_data":
#                 context["summary"] = summarize_data(context.get("data", {}))
#                 logs.append("OK summarized data")

#             elif action == "fetch_file":
#                 context["file"] = fetch_file()
#                 logs.append("OK fetched file")

#             elif action == "send_email":
#                 logs.append(send_email(context.get("summary", "")))

#             else:
#                 logs.append(f"Unknown step: {action}")

#         return logs, context


# # ================== HELPER ==================
# def safe_parse(text):
#     try:
#         return json.loads(text)
#     except:
#         # ✅ fallback plan
#         return [
#             {"step": "get_sales_data"},
#             {"step": "summarize_data"},
#             {"step": "send_email"}
#         ]


# # ================== MAIN WORKFLOW ==================
# async def run_workflow(user_input):
#     planner = PlannerAgent()
#     executor = ExecutorAgent()

#     msg = Msg(name="user", content=user_input, role="user")

#     plan_msg = await planner.reply(msg)

#     steps = safe_parse(plan_msg.content)

#     logs, context = await executor.run_steps(steps)

#     return "\n".join(logs + ["\nFINAL OUTPUT\n", context.get("summary", "")])



# import asyncio
# import json
# import re
# import requests
# from agentscope.agent import AgentBase
# from agentscope.message import Msg

# # ================== OLLAMA ==================
# def call_ollama(prompt):
#     try:
#         response = requests.post(
#             "http://localhost:11434/api/generate",
#             json={
#                 "model": "llama3.2:1b",  # 🔥 upgraded model (important)
#                 "prompt": prompt,
#                 "stream": False
#             },
#             timeout=60
#         )

#         response.raise_for_status()
#         data = response.json()

#         print("OLLAMA RAW RESPONSE:\n", data)

#         return data.get("response") or data.get("message") or str(data)

#     except Exception as e:
#         return f"OLLAMA ERROR: {str(e)}"


# # ================== TOOLS ==================
# from sqlalchemy import select
# from db import AsyncSessionLocal
# from models import Sales

# async def get_sales_data():
#     async with AsyncSessionLocal() as session:
#         result = await session.execute(
#             select(Sales).order_by(Sales.id.desc()).limit(1)
#         )

#         row = result.scalar_one_or_none()

#         print("DB ROW:", row)  # 🔍 debug

#         if not row:
#             return {}

#         return {
#             "revenue": row.revenue,
#             "growth": row.growth,
#             "period": row.period
#         }


# def fetch_file():
#     return "File content: Project roadmap and milestones."


# def summarize_data(data):
#     if not data:
#         return "No data available."

#     return f"""
# Summary:
# Revenue: ${data.get('revenue', 'N/A')}
# Growth: {data.get('growth', 'N/A')}
# Period: {data.get('period', 'N/A')}
# """


# def send_email(content):
#     print("\nEMAIL SENDING...\n")
#     print(content)
#     return "Email sent"


# # ================== PLANNER ==================
# class PlannerAgent(AgentBase):

#     def __init__(self):
#         super().__init__()
#         self.name = "Planner"

#     async def reply(self, x: Msg = None):
#         prompt = f"""
# You are a JSON planner.

# STRICT RULES:
# - Output ONLY a JSON ARRAY
# - Each item MUST have "step"
# - NO explanation
# - NO text outside JSON

# VALID FORMAT:
# [
#   {{"step": "get_sales_data"}},
#   {{"step": "summarize_data"}},
#   {{"step": "send_email"}}
# ]

# Available steps:
# get_sales_data
# summarize_data
# fetch_file
# send_email

# User request:
# {x.content}
# """

#         output = call_ollama(prompt)

#         print("PLANNER RAW OUTPUT:\n", output)

#         return Msg(name=self.name, content=output, role="assistant")


# # ================== EXECUTOR ==================
# # ================== EXECUTOR ==================
# VALID_STEPS = {
#     "get_sales_data",
#     "summarize_data",
#     "fetch_file",
#     "send_email"
# }


# class ExecutorAgent(AgentBase):

#     def __init__(self):
#         super().__init__()
#         self.name = "Executor"

#     async def run_steps(self, steps):

#         context = {}
#         logs = []

#         # ✅ enforce correct execution order
#         ordered_steps = []

#         step_names = [
#             s.get("step") for s in steps if isinstance(s, dict)
#         ]

#         if "get_sales_data" in step_names:
#             ordered_steps.append({"step": "get_sales_data"})
#         if "summarize_data" in step_names:
#             ordered_steps.append({"step": "summarize_data"})
#         if "send_email" in step_names:
#             ordered_steps.append({"step": "send_email"})

#         # fallback if planner fails
#         if not ordered_steps:
#             ordered_steps = [
#                 {"step": "get_sales_data"},
#                 {"step": "summarize_data"},
#                 {"step": "send_email"}
#             ]

#         # execute
#         for step in ordered_steps:
#             action = step.get("step")

#             try:
#                 if action == "get_sales_data":
#                     context["data"] = await get_sales_data()
#                     logs.append("OK got sales data")

#                 elif action == "summarize_data":
#                     context["summary"] = summarize_data(context.get("data", {}))
#                     logs.append("OK summarized data")

#                 elif action == "fetch_file":
#                     context["file"] = fetch_file()
#                     logs.append("OK fetched file")

#                 elif action == "send_email":
#                     logs.append(send_email(context.get("summary", "")))

#             except Exception as e:
#                 logs.append(f"❌ Error in {action}: {str(e)}")

#         return logs, context


# # ================== HELPERS ==================
# def fallback_plan():
#     return [
#         {"step": "get_sales_data"},
#         {"step": "summarize_data"},
#         {"step": "send_email"}
#     ]


# def safe_parse(text):
#     try:
#         data = json.loads(text)

#         if isinstance(data, list):
#             return data

#         return fallback_plan()

#     except:
#         match = re.search(r"\[.*\]", text, re.DOTALL)
#         if match:
#             try:
#                 data = json.loads(match.group())
#                 if isinstance(data, list):
#                     return data
#             except:
#                 pass

#     return fallback_plan()



# # ================== MAIN WORKFLOW ==================
# async def run_workflow(user_input):
#     planner = PlannerAgent()
#     executor = ExecutorAgent()

#     msg = Msg(name="user", content=user_input, role="user")

#     plan_msg = await planner.reply(msg)

#     steps = safe_parse(plan_msg.content)

#     print("FINAL STEPS:", steps)  # 🔍 debug

#     logs, context = await executor.run_steps(steps)

#     return "\n".join(
#         logs + ["\nFINAL OUTPUT\n", context.get("summary", "No summary generated")]
#     )



import asyncio
import requests
from agentscope.agent import Agent
from agentscope.message import Msg

from sqlalchemy import select
from db import AsyncSessionLocal
from models import Sales


# ================== OLLAMA ==================
# def call_ollama(prompt):
#     response = requests.post(
#         "http://localhost:11434/api/generate",
#         json={
#             "model": "llama3:8b",
#             "prompt": prompt,
#             "stream": False
#         },
#         timeout=60
#     )

#     data = response.json()
#     return data.get("response", "")
def call_ollama(prompt):
    try:
        response = requests.post(
            "http://localhost:11434/api/generate",
            json={
                "model": "llama3.2:1b",
                "prompt": prompt,
                "stream": False
            },
            timeout=60
        )

        response.raise_for_status()
        data = response.json()

        print("OLLAMA RAW:", data)

        output = data.get("response", "")

        return output.strip()

    except Exception as e:
        print("OLLAMA ERROR:", e)
        return ""

# ================== TOOLS ==================
def llm_summarize(data):
    if not data:
        return "No data available."

    prompt = f"""
You are a business analyst.

Convert this into ONE SHORT LINE.

Revenue: {data.get('revenue')}
Growth: {data.get('growth')}
Period: {data.get('period')}

Rules:
- One line only
- No labels
- Natural sentence
- No extra text

Example:
Revenue is $20,000 with 10% growth last week.

Answer:
"""

    response = call_ollama(prompt)

    # fallback safety
    if not response or len(response) < 5:
        return f"Revenue is ${data.get('revenue')} with {data.get('growth')} growth in {data.get('period')}."

    return response.strip()
async def get_sales_data():
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Sales).order_by(Sales.id.desc()).limit(1)
        )
        row = result.scalar_one_or_none()

        if not row:
            return {}

        return {
            "revenue": row.revenue,
            "growth": row.growth,
            "period": row.period
        }


def summarize_data(data):
    if not data:
        return "No data available."

    return f"""
Summary:
Revenue: ${data.get('revenue')}
Growth: {data.get('growth')}
Period: {data.get('period')}
"""


def send_email(content):
    print("\nEMAIL SENDING...\n")
    print(content)
    return "Email sent"


# ================== TOOL ROUTER ==================
class ToolAgent(Agent):

    def __init__(self):
        super().__init__(name="ToolAgent")
        self.name = "ToolAgent"

    async def reply(self, x: Msg = None):

        prompt = f"""
You are a tool selector.

You MUST return EXACTLY ONE of these words:

get_sales_data
summarize_data
send_email

STRICT RULES:
- Return ONLY ONE word
- No numbering
- No explanation
- No extra text
- Do NOT shorten words
- Do NOT return multiple lines

Wrong outputs:
1. sum
2. send
summary

Correct outputs:
get_sales_data
summarize_data
send_email

User:
{x.content}

Answer:
"""

        tool = call_ollama(prompt).strip().lower()

        print("TOOL DECISION:", tool)

        return Msg(name=self.name, content=tool, role="assistant")


# ================== MAIN WORKFLOW ==================

async def run_workflow(user_input):
    agent = ToolAgent()

    msg = Msg(name="user", content=user_input, role="user")
    decision_msg = await agent.reply(msg)

    raw_tool = decision_msg.content.strip().lower()

    valid_tools = ["get_sales_data", "summarize_data", "send_email"]

    tool = None
    for t in valid_tools:
        if t in raw_tool:
            tool = t
            break

    if not tool:
        tool = "get_sales_data"

    context = {}
    logs = []

    # ✅ GET DATA
    context["data"] = await get_sales_data()
    logs.append("OK got sales data")

    # ✅ SUMMARIES
    context["structured"] = summarize_data(context["data"])
    logs.append("OK structured summary ready")

    context["llm"] = llm_summarize(context["data"])
    logs.append("OK LLM summary ready")

    # ✅ EMAIL
    if tool == "send_email":
        logs.append(send_email(context["llm"]))

    # ✅ FIX: build log string BEFORE f-string
    log_text = "\n- ".join(logs)

    return f"""
LOGS:
- {log_text}

STRUCTURED:
{context['structured']}

ONE-LINE:
{context['llm']}
""".strip()



# async def run_workflow(user_input):
#     agent = ToolAgent()

#     msg = Msg(name="user", content=user_input, role="user")

#     decision_msg = await agent.reply(msg)
#     # tool = decision_msg.content.strip().lower()
#     raw_tool = decision_msg.content.strip().lower()

#     print("RAW TOOL:", repr(raw_tool))

#     # 🔥 extract first valid tool only
#     valid_tools = ["get_sales_data", "summarize_data", "send_email"]

#     tool = None

#     for t in valid_tools:
#         if t in raw_tool:
#             tool = t
#             break

#     # fallback if nothing valid
#     if not tool:
#         tool = "get_sales_data"

#     print("FINAL TOOL:", tool)


#     print("TOOL DECISION:", tool)

#     context = {}
#     logs = []

#     # ✅ 1. GET DATA
#     if tool == "get_sales_data":
#         context["data"] = await get_sales_data()
#         logs.append("OK got sales data")

#     # ✅ 2. SUMMARIZE (auto dependency)
#     if tool in ["summarize_data", "get_sales_data"]:
#         if "data" not in context:
#             context["data"] = await get_sales_data()
#             logs.append("OK got sales data (auto)")

#         context["summary"] = llm_summarize(context["data"])
#         logs.append("OK summarized data")

#     # ✅ 3. SEND EMAIL (auto dependency)
#     if tool == "send_email":
#         if "data" not in context:
#             context["data"] = await get_sales_data()
#             logs.append("OK got sales data (auto)")

#         if "summary" not in context:
#             context["summary"] = llm_summarize(context["data"])
#             logs.append("OK summarized data (auto)")

#         logs.append(send_email(context["summary"]))

#     # ✅ 4. SAFETY FALLBACK (LLM fails)
#     if not logs:
#         context["data"] = await get_sales_data()
#         context["summary"] = llm_summarize(context["data"])
#         logs = ["OK got sales data", "OK summarized data"]

#     return "\n".join(
#         logs + ["\nFINAL OUTPUT\n", context.get("summary", "No output")]
#     )