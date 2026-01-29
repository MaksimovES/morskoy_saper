@echo off
echo ======================================
echo   Запуск клиента Морской Сапёр
echo ======================================
echo.

cd /d "%~dp0\..\client"

echo Проверка зависимостей...
if not exist "node_modules" (
    echo Установка зависимостей...
    call npm install
)

echo.
echo Запуск клиента...
echo ======================================
echo.

call npm start
