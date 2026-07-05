@echo off
title NORNICKEL Dev Launcher
cd /d "%~dp0"

echo.
echo ============================================================
echo         NORNICKEL "Nauchnyj Klubok" — Dev Mode
echo ============================================================
echo.

:: --- Kill stale processes ---
echo [0/3] Killing old processes...
taskkill /fi "WINDOWTITLE eq NORNICKEL Backend*" /f >nul 2>&1
taskkill /fi "WINDOWTITLE eq NORNICKEL Frontend*" /f >nul 2>&1
timeout /t 2 /nobreak >nul

:: --- Neo4j ---
echo [1/3] Starting Neo4j (Docker)...
docker compose up -d neo4j 2>&1
if %ERRORLEVEL% neq 0 (
    echo [WARN] Neo4j failed - is Docker running?
)
echo.

:: --- Backend ---
echo [2/3] Starting Backend on http://localhost:8000...
start "NORNICKEL Backend" cmd /k cd /d "%~dp0backend" ^&^& python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
echo.

:: --- Frontend ---
echo [3/3] Starting Frontend on http://localhost...
start "NORNICKEL Frontend" cmd /k cd /d "%~dp0frontend" ^&^& set CORPUS_VAULT_PATH=..\corpus^&^& set AUTO_CREATE_DEFAULT=false^&^& set AGENT_API_KEY=res-key-test^&^& node server/index.js
echo.

echo ============================================================
echo   Login: admin / 321321
echo   Run stop.cmd to shut everything down
echo ============================================================
echo.

timeout /t 5 /nobreak >nul
start "" "http://localhost"
