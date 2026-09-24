@echo off
echo === SetForge: matando pythons orfaos ===
taskkill /F /IM python.exe 2>nul
timeout /t 2 /nobreak >nul

echo === Subindo Flask ===
cd /d C:\Users\bruno\setforge
call .venv\Scripts\activate.bat
start "SetForge Flask" cmd /k python run_server.py

echo === Aguardando Flask subir ===
timeout /t 5 /nobreak >nul

echo === Subindo Next.js ===
start "SetForge Next" cmd /k npm run dev

echo === Pronto! ===
echo Flask: http://localhost:8000/health
echo App:   http://localhost:3000
timeout /t 5 /nobreak >nul