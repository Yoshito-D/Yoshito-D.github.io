@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Ask Codex to start the editor.
  pause
  exit /b 1
)
node editor\server.cjs --open
if errorlevel 1 pause
