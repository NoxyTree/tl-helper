@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js was not found in PATH.& pause & exit /b 1)
"%LOCALAPPDATA%\Programs\Ollama\ollama.exe" list >nul 2>nul || (echo Ollama is not available. Start Ollama, then try again.& pause & exit /b 1)
start "" http://127.0.0.1:43120
node local-adviser/server.mjs
if errorlevel 1 pause
