@echo off
setlocal

echo ================================================
echo   SetForge - Iniciando servidores
echo ================================================
echo.

cd /d C:\Users\bruno\setforge

:: ─────────────────────────────────────────────
:: 1. Mata pythons orfaos (evita EADDRINUSE)
:: ─────────────────────────────────────────────
echo [1/4] Matando processos python orfaos...
taskkill /F /IM python.exe 2>nul
if %errorlevel%==0 (
    echo       OK - pythons finalizados
) else (
    echo       OK - nenhum python rodando
)

:: ─────────────────────────────────────────────
:: 2. Verifica se as pastas .venv existem
:: ─────────────────────────────────────────────
echo.
echo [2/4] Verificando ambientes virtuais...
if not exist ".venv\Scripts\activate.bat" (
    echo       ERRO: .venv nao encontrado em C:\Users\bruno\setforge\.venv
    echo       Rode: python -m venv .venv
    pause
    exit /b 1
)
if not exist ".venv-skey\Scripts\python.exe" (
    echo       AVISO: .venv-skey nao encontrado - S-KEY nao vai funcionar
    echo       (Continue mesmo assim se nao precisa de deteccao de tom)
)
echo       OK

:: ─────────────────────────────────────────────
:: 3. Sobe o Flask numa janela separada
:: ─────────────────────────────────────────────
echo.
echo [3/4] Subindo Flask (porta 8000)...
start "SetForge Flask" cmd /k "cd /d C:\Users\bruno\setforge && call .venv\Scripts\activate.bat && python run_server.py"

:: Espera o Flask subir e bindar na 8000
echo       Aguardando Flask iniciar...
timeout /t 8 /nobreak >nul

:: ─────────────────────────────────────────────
:: 4. Sobe o Next.js numa janela separada
:: ─────────────────────────────────────────────
echo.
echo [4/4] Subindo Next.js (porta 3000)...
start "SetForge Next" cmd /k "cd /d C:\Users\bruno\setforge && npm run dev"

:: Espera o Next compilar a primeira rota
echo       Aguardando Next.js iniciar...
timeout /t 6 /nobreak >nul

:: ─────────────────────────────────────────────
:: 5. Abre o navegador
:: ─────────────────────────────────────────────
echo.
echo ================================================
echo   Pronto!
echo ================================================
echo.
echo   Flask:  http://localhost:8000/health
echo   App:    http://localhost:3000
echo.
echo   Para parar: feche as duas janelas abertas
echo   (SetForge Flask / SetForge Next)
echo.

timeout /t 3 /nobreak >nul
start http://localhost:3000

endlocal