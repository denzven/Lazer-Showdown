@echo off
echo ===================================================
echo   LAZER SHOWDOWN: NEURAL NETWORK OFFLINE TRAINER
echo ===================================================
echo.
echo Starting overnight training loop...
echo (Press Ctrl+C to stop at any time)
echo.
node scripts/train.js --iterations=900 --games=50
echo.
echo Training complete! You can close this window.
pause
