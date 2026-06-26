# Data Analysis Routes
import json
import time
import os
from fastapi import FastAPI, HTTPException, UploadFile, File, Query, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List

from models import get_db, UploadedCSV, User
from auth import get_current_user
from config import CSV_UPLOAD_DIR, ALLOWED_OLLAMA_MODELS, OLLAMA_BASE_URL
from data_analysis import (
    query_ollama_data_analysis, generate_fallback_code, execute_data_analysis_code,
    save_to_sql_database, load_csv_file, get_database_engine
)
from sqlalchemy import inspect

# Pydantic Models
class DataAnalysisRequest(BaseModel):
    prompt: str
    session_id: str
    model: str = "deepseek-coder-v2:latest"

class CSVUploadResponse(BaseModel):
    filename: str
    shape: tuple[int, int]
    columns: list[str]
    dtypes: dict[str, str]
    sample_data: list[dict]

async def get_optional_current_user(request: Request, db=Depends(get_db)):
    try:
        return await get_current_user(request, db)
    except HTTPException:
        dummy = db.query(User).filter_by(username="guest_dashboard").first()
        if not dummy:
            dummy = User(username="guest_dashboard", password_hash="dummy")
            db.add(dummy)
            db.commit()
            db.refresh(dummy)
        return dummy

def register_data_analysis_routes(app: FastAPI):
    
    @app.post("/upload-csv")
    async def upload_csv(
        request: Request,
        file: UploadFile = File(...),
        session_id: str = Query(..., min_length=1, description="Session ID for tracking uploads"),
        db=Depends(get_db),
        current_user=Depends(get_optional_current_user)
    ):
        """Upload CSV file for data analysis"""
        print(f"Received upload request for session: {session_id}")
        
        if not file.filename:
            raise HTTPException(status_code=400, detail="No file provided")
            
        if not file.filename.lower().endswith('.csv'):
            raise HTTPException(
                status_code=400, 
                detail=f"Invalid file type: {file.filename}. Only CSV files are allowed"
            )
        
        timestamp = int(time.time())
        filename = f"{current_user.id}_{session_id}_{timestamp}_{file.filename}"
        file_path = os.path.join(CSV_UPLOAD_DIR, filename)
        
        print(f"Processing file: {filename}")
        print(f"File size: {file.size if hasattr(file, 'size') else 'unknown'}")
        print(f"Content type: {file.content_type}")
        
        try:
            print("Reading file content...")
            content = await file.read()
            if not content:
                error_msg = "Uploaded file is empty"
                print(f"Error: {error_msg}")
                raise HTTPException(status_code=400, detail=error_msg)
            
            print(f"Read {len(content)} bytes, writing to {file_path}")
            
            os.makedirs(os.path.dirname(file_path), exist_ok=True)
            
            with open(file_path, "wb") as buffer:
                buffer.write(content)
            
            if not os.path.exists(file_path):
                error_msg = f"File was not saved to {file_path}"
                print(f"Error: {error_msg}")
                raise HTTPException(status_code=500, detail=error_msg)
                
            file_size = os.path.getsize(file_path)
            print(f"File saved successfully. Size: {file_size} bytes")
            
            if file_size == 0:
                error_msg = "Saved file is empty"
                print(f"Error: {error_msg}")
                os.remove(file_path)
                raise HTTPException(status_code=400, detail=error_msg)
                
        except Exception as e:
            if os.path.exists(file_path):
                os.remove(file_path)
            raise HTTPException(status_code=500, detail=f"Error saving file: {str(e)}")
        
        try:
            print(f"Attempting to load CSV file: {file_path}")
            df = load_csv_file(file_path)
            if df is None or df.empty:
                if os.path.exists(file_path):
                    os.remove(file_path)
                raise HTTPException(
                    status_code=400, 
                    detail="Could not read CSV file. The file might have an unsupported format or encoding. Please ensure it's a valid CSV file with UTF-8 or similar encoding."
                )
            
            try:
                sample_data = df.head(5).to_dict('records') if len(df) > 0 else {}
                
                columns_info = {
                    'columns': df.columns.tolist(),
                    'dtypes': df.dtypes.astype(str).to_dict(),
                    'shape': df.shape,
                    'sample_data': sample_data
                }
            except Exception as e:
                if os.path.exists(file_path):
                    os.remove(file_path)
                raise HTTPException(status_code=400, detail=f"Error processing CSV data: {str(e)}")
            
            table_name = f"data_{current_user.id}_{session_id}_{int(time.time())}"
            engine = save_to_sql_database(df, table_name)
            
            csv_record = UploadedCSV(
                user_id=current_user.id,
                session_id=session_id,
                filename=file.filename,
                file_path=file_path,
                columns_info=json.dumps(columns_info),
                table_name=table_name
            )
            db.add(csv_record)
            db.commit()
            db.refresh(csv_record)
            
            response_data = CSVUploadResponse(
                filename=file.filename,
                shape=df.shape,
                columns=df.columns.tolist(),
                dtypes=df.dtypes.astype(str).to_dict(),
                sample_data=sample_data
            )
            
            return response_data
            
        except Exception as e:
            if os.path.exists(file_path):
                os.remove(file_path)
            raise HTTPException(status_code=400, detail=f"Error processing CSV: {str(e)}")

    @app.post("/data-analysis")
    def data_analysis(
        request: Request,
        data: DataAnalysisRequest,
        db=Depends(get_db),
        current_user=Depends(get_optional_current_user)
    ):
        """Process data analysis questions"""
        
        csv_record = db.query(UploadedCSV).filter(
            UploadedCSV.user_id == current_user.id,
            UploadedCSV.session_id == data.session_id
        ).order_by(UploadedCSV.timestamp.desc()).first()
        
        if not csv_record:
            raise HTTPException(status_code=400, detail="No CSV file uploaded for this session")
        
        if not os.path.exists(csv_record.file_path):
            raise HTTPException(status_code=400, detail="CSV file not found. Please re-upload.")
        
        try:
            df = load_csv_file(csv_record.file_path)
            if df is None:
                raise HTTPException(status_code=400, detail="Could not load CSV file")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Error loading CSV: {str(e)}")
        
        def stream_data_analysis():
            try:
                ollama_available = True
                try:
                    import requests
                    response = requests.get(f"{OLLAMA_BASE_URL}/api/version", timeout=5)
                    if response.status_code != 200:
                        ollama_available = False
                except:
                    ollama_available = False
                
                if ollama_available and data.model in ALLOWED_OLLAMA_MODELS:
                    yield json.dumps({
                        "type": "status",
                        "message": "Generating analysis code with AI...",
                        "done": False
                    }) + "\n"
                    
                    context = f"""
Dataset: {df.shape[0]} rows, {df.shape[1]} columns
Columns: {list(df.columns)}
Types: {dict(df.dtypes)}

RULES:
1. Use 'df' (already loaded)
2. Generate executable Python code only
3. Use print() for results
4. Keep code concise
5. Include matplotlib plots when appropriate

Question: {data.prompt}
Code:"""
                    
                    ai_response = query_ollama_data_analysis(context, model=data.model)
                    
                    if "Error" in ai_response or "TIMEOUT" in ai_response:
                        yield json.dumps({
                            "type": "status",
                            "message": "AI unavailable, using fallback code generation...",
                            "done": False
                        }) + "\n"
                        code = generate_fallback_code(data.prompt, df)
                    else:
                        if '```python' in ai_response:
                            code_start = ai_response.find('```python') + 9
                            code_end = ai_response.find('```', code_start)
                            code = ai_response[code_start:code_end].strip()
                        else:
                            code = ai_response.strip()
                else:
                    yield json.dumps({
                        "type": "status",
                        "message": "Using fallback code generation...",
                        "done": False
                    }) + "\n"
                    code = generate_fallback_code(data.prompt, df)
                
                yield json.dumps({
                    "type": "code",
                    "content": code,
                    "done": False
                }) + "\n"
                
                yield json.dumps({
                    "type": "status",
                    "message": "Executing analysis...",
                    "done": False
                }) + "\n"
                
                result = execute_data_analysis_code(code, df, csv_record.table_name)
                
                if result['success']:
                    if result.get('output'):
                        yield json.dumps({
                            "type": "output",
                            "content": result['output'],
                            "done": False
                        }) + "\n"
                    
                    if result.get('chart'):
                        yield json.dumps({
                            "type": "chart",
                            "content": result['chart'],
                            "done": False
                        }) + "\n"
                    
                    explanation = f"Analysis completed successfully. The results show patterns and insights from your dataset with {df.shape} rows and {df.shape} columns."
                    yield json.dumps({
                        "type": "explanation",
                        "content": explanation,
                        "done": False
                    }) + "\n"
                    
                else:
                    yield json.dumps({
                        "type": "error",
                        "content": f"Execution error: {result['error']}",
                        "done": False
                    }) + "\n"
                
                yield json.dumps({
                    "type": "analysis_complete",
                    "done": True
                }) + "\n"
                
            except Exception as e:
                yield json.dumps({
                    "type": "error",
                    "content": f"Analysis error: {str(e)}",
                    "done": True
                }) + "\n"
        
        return StreamingResponse(stream_data_analysis(), media_type="application/jsonl")

    @app.get("/csv-info")
    def get_csv_info(
        request: Request,
        session_id: str = Query(...),
        db=Depends(get_db),
        current_user=Depends(get_optional_current_user)
    ):
        """Get information about uploaded CSV for this session"""
        csv_record = db.query(UploadedCSV).filter(
            UploadedCSV.user_id == current_user.id,
            UploadedCSV.session_id == session_id
        ).order_by(UploadedCSV.timestamp.desc()).first()
        
        if not csv_record:
            return {"has_csv": False}
        
        columns_info = json.loads(csv_record.columns_info) if csv_record.columns_info else {}
        
        return {
            "has_csv": True,
            "filename": csv_record.filename,
            "uploaded_at": csv_record.timestamp.isoformat(),
            **columns_info
        }

    @app.get("/list-tables")
    def list_uploaded_tables(current_user=Depends(get_current_user)):
        engine = get_database_engine()
        inspector = inspect(engine)
        tables = inspector.get_table_names()
        if not tables:
            raise HTTPException(status_code=404, detail="No tables found in the database.")
        return {"tables": tables}

    @app.get("/describe-table")
    def describe_table(
        table_name: str = Query(..., description="Name of the table to describe"),
        current_user=Depends(get_current_user)
    ):
        engine = get_database_engine()
        inspector = inspect(engine)
        columns = inspector.get_columns(table_name)
        if not columns:
            raise HTTPException(status_code=404, detail=f"Table '{table_name}' not found.")
        return {
            "table": table_name,
            "columns": [
                {"name": col["name"], "type": str(col["type"]), "nullable": col["nullable"]}
                for col in columns
            ]
        }

    @app.post("/execute-sql")
    def execute_sql(
        query: str = Query(..., description="SQL query to execute (SELECT only)"),
        current_user=Depends(get_current_user)
    ):
        if not query.strip().lower().startswith("select"):
            raise HTTPException(status_code=400, detail="Only SELECT queries are allowed for safety.")

        engine = get_database_engine()
        try:
            import pandas as pd
            df = pd.read_sql_query(query, engine)
            records = df.head(50).to_dict(orient="records")
            return {"success": True, "row_count": len(df), "columns": list(df.columns), "data": records}
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"SQL execution error: {str(e)}")