@echo off
echo ======================================
echo   Сборка Морской Сапёр (Клиент)
echo ======================================
echo.

cd /d "%~dp0\..\client"

echo [1/4] Установка зависимостей...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo ОШИБКА: Не удалось установить зависимости
    pause
    exit /b 1
)

echo.
echo [2/4] Компиляция TypeScript...
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo ОШИБКА: Не удалось скомпилировать TypeScript
    pause
    exit /b 1
)

echo.
echo [3/4] Сборка exe файла...
call npm run dist
if %ERRORLEVEL% NEQ 0 (
    echo ОШИБКА: Не удалось собрать exe файл
    pause
    exit /b 1
)

echo.
echo [4/4] Готово!
echo.
echo ======================================
echo   Сборка завершена успешно!
echo   Файлы находятся в папке: client\release
echo ======================================
echo.

explorer "%~dp0\..\client\release"

pause
