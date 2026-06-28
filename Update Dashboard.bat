@echo off
title LTA Review Dashboard Updater
echo ============================================
echo   LTA Review Dashboard - Update Reviews
echo ============================================
echo.
echo Starting scraper for all 21 restaurants...
echo Chrome will open and run automatically.
echo.
cd /d "%~dp0"
set PYTHONUTF8=1
python auto_update.py --local
echo.
echo ============================================
echo   Done! Dashboard is updated and deployed.
echo ============================================
pause
