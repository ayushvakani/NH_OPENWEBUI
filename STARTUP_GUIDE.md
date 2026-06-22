# NemhemAI – Quick Startup Guide

Welcome to the **NemhemAI** project! This guide will walk you through setting up the application from scratch after cloning the repository. The project consists of three main components that need to run simultaneously:

1. **Frontend** (React/Next.js UI)
2. **Main Backend** (FastAPI Core System)
3. **Workflow Engine** (OpenAgent AI Processing)

---

## 🛠 Prerequisites

Before starting, ensure you have the following installed on your system:
- **Node.js** (v18 or higher)
- **Python** (v3.10 or higher)
- **Ollama** (for local AI inference, make sure `gemma3:270m` is pulled: `ollama run gemma3:270m`)
- **Git**

---

## 🚀 1. Setup the Main Backend (Port 8000)

The main backend handles the core APIs, authentications, and database logic.

1. Open a new terminal and navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Create and activate a Python virtual environment (optional but recommended):
   ```bash
   python -m venv venv
   # On Windows:
   .\venv\Scripts\activate
   # On Mac/Linux:
   source venv/bin/activate
   ```
3. Install the required Python packages:
   ```bash
   pip install -r requirements.txt
   ```
4. Start the backend server:
   ```bash
   uvicorn main:app --reload --port 8000
   ```

---

## 🤖 2. Setup the Workflow Engine (Port 9000)

The workflow engine handles all AI agents, live charting, and complex background tasks.

1. Open a **second** terminal window and navigate to the workflow directory:
   ```bash
   cd workflow
   ```
2. Install the required Python packages:
   ```bash
   pip install -r requirements.txt
   ```
3. Run the initial database seed script to populate mock sales data (if Postgres is unavailable):
   ```bash
   python seed_db.py
   ```
4. Start the workflow server:
   ```bash
   uvicorn openagent.api:app --reload --port 9000
   ```

---

## 💻 3. Setup the Frontend (Port 3000)

The frontend contains the chat interface and the team dashboards.

1. Open a **third** terminal window in the root directory of the project:
   ```bash
   # Make sure you are in the main nemhemai/ folder
   ```
2. Install all Node.js dependencies:
   ```bash
   npm install
   ```
3. Start the frontend development server:
   ```bash
   npm run dev
   ```

---

## 🔑 4. Environment Variables (`.env`)

You will need an `.env` file in the root of your project for the application to function perfectly. 
Copy the `.env.example` file and rename it to `.env`, then fill in your API keys.

**Key Environment Variables to Check:**
- `OPENAGENT_DATABASE_URL` (For production PostgreSQL connection; defaults to local SQLite if empty).
- API Keys for Discord, Telegram, or Microsoft Teams (if you are running the unified bots).

---

## 🧪 5. Testing with OpenWebUI (Optional)

If you want to test the workflow engine independently before using the frontend, you can use OpenWebUI.

1. Open a **fourth** terminal window.
2. Install OpenWebUI if you haven't already:
   ```bash
   pip install open-webui
   ```
3. Start the OpenWebUI server:
   ```bash
   open-webui serve --port 8080
   ```
   *(Note: If port 8080 is in use, you can use `--port 8081`)*
4. Open your browser and go to `http://localhost:8080`.
5. Create an admin account and go to **Profile > Admin Panel > Settings > Connections**.
6. Click the `+` under **OpenAI API**:
   - **Base URL:** `http://localhost:9000/v1`
   - **API Key:** `dummy-key`
7. Save, refresh the models, select `report-model`, and type *"Generate a sales report"*.

---

## 🎉 Success!

You are all set! Open your browser and navigate to:
👉 **http://localhost:3000** (For the React Frontend)

**Testing the Full System:**
1. Log into the React application.
2. Open the AI Chat interface.
3. Type: *"Generate a sales report"*
4. The system should process your request through the workflow engine and render an interactive sales dashboard directly inside the chat!
