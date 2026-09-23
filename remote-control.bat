@echo off
title Claude Remote Control - Financier

REM ── Pasta do projeto (mude aqui se quiser outra) ───────────────────────────
cd /d "C:\Users\user\.claude\projects\FinancierLaunch"

echo Iniciando Claude Code com Remote Control...
echo Pasta: %CD%
echo.

REM ── Resolve o claude.exe mais recente via PowerShell (ordena por versao) ────
set "CLAUDE_EXE="
for /f "usebackq delims=" %%E in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$d=Join-Path $env:APPDATA 'Claude\claude-code'; Get-ChildItem $d -Directory -ErrorAction SilentlyContinue | Sort-Object {[version]$_.Name} -Descending | ForEach-Object { Join-Path $_.FullName 'claude.exe' } | Where-Object { Test-Path $_ } | Select-Object -First 1"`) do set "CLAUDE_EXE=%%E"

if not defined CLAUDE_EXE (
  echo.
  echo [ERRO] Nao encontrei o claude.exe em %APPDATA%\Claude\claude-code
  echo Abra o app Claude Code uma vez e tente de novo.
  echo.
  pause
  exit /b 1
)

echo Usando: %CLAUDE_EXE%
echo.
"%CLAUDE_EXE%" --remote-control %*

echo.
echo Sessao encerrada.
pause
