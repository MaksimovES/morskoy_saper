#!/bin/bash

# Скрипт для деплоя сервера на VPS
# Использование: ./deploy-server.sh [vps-ip] [user]

set -e

VPS_IP="${1:-your-vps-ip}"
VPS_USER="${2:-root}"
REMOTE_DIR="/home/$VPS_USER/morskoy_saper"

echo "🚀 Деплой Морской Сапёр на $VPS_USER@$VPS_IP"
echo "=========================================="

# Собираем сервер локально
echo "📦 Сборка сервера..."
cd ../server
npm install
npm run build

# Копируем файлы на VPS
echo "📤 Копирование файлов на VPS..."
ssh $VPS_USER@$VPS_IP "mkdir -p $REMOTE_DIR/server"

rsync -avz --delete \
    --exclude 'node_modules' \
    --exclude '.git' \
    . $VPS_USER@$VPS_IP:$REMOTE_DIR/server/

# Копируем shared типы
rsync -avz ../shared/ $VPS_USER@$VPS_IP:$REMOTE_DIR/shared/

# Устанавливаем зависимости и запускаем
echo "⚙️ Настройка на VPS..."
ssh $VPS_USER@$VPS_IP << EOF
    cd $REMOTE_DIR/server
    
    # Устанавливаем зависимости
    npm install --production
    
    # Останавливаем старую версию если есть
    pm2 delete morskoy-saper-server 2>/dev/null || true
    
    # Запускаем новую версию
    pm2 start ecosystem.config.js
    pm2 save
    
    # Показываем статус
    pm2 status
EOF

echo "✅ Деплой завершён!"
echo "🌐 Сервер доступен на ws://$VPS_IP:3000"
