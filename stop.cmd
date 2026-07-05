@echo off
title NORNICKEL Shutdown
cd /d "%~dp0"

echo.
echo Stopping NORNICKEL services...

echo   Stopping Backend...
taskkill /fi "WINDOWTITLE eq NORNICKEL Backend*" /f >nul 2>&1

echo   Stopping Frontend...
taskkill /fi "WINDOWTITLE eq NORNICKEL Frontend*" /f >nul 2>&1

echo   Stopping Neo4j...
docker compose stop neo4j >nul 2>&1

echo.
echo Done.
timeout /t 2 /nobreak >nul
