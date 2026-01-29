@echo off
echo ======================================
echo   Запуск сервера Морской Сапёр
echo ======================================
echo.

cd /d "%~dp0\..\server"

echo Проверка зависимостей...
if not exist "node_modules" (
    echo Установка зависимостей...
    call npm install
)

echo.
echo Запуск сервера в режиме разработки...
echo.
echo Сервер будет доступен по адресу:
echo   http://localhost:3000
echo   ws://localhost:3000
echo.
echo Нажмите Ctrl+C для остановки
echo ======================================
echo.

call npm run dev
