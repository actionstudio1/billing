@echo off
title Billing App — Supabase Setup Check
cd /d "%~dp0"

echo.
echo  Billing app for retail shop — Supabase setup
echo  Project: rzeptkazqjiflnzcrnwr
echo.

if not exist ".env" (
  echo  ERROR: .env file missing. Copy from .env.example and fill keys.
  pause
  exit /b 1
)

echo  Step 1: Checking connection and tables...
node --env-file=.env scripts/check-supabase.mjs
echo.

echo  Step 2: If tables are MISSING, open SQL Editor and run schema.sql:
echo  https://supabase.com/dashboard/project/rzeptkazqjiflnzcrnwr/sql/new
echo  File: supabase\schema.sql
echo.

echo  Step 3: Auth — Email ON, Confirm email OFF
echo  https://supabase.com/dashboard/project/rzeptkazqjiflnzcrnwr/auth/providers
echo.

set /p START="Start dev server now? (Y/N): "
if /i "%START%"=="Y" (
  start "" cmd /c "npm run dev"
)

pause
