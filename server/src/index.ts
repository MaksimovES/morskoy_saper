import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import { GameRoom } from './GameRoom';
import {
  JoinGamePayload,
  PlaceShipsPayload,
  ShootPayload,
  UseScanPayload,
  UseScoutPayload,
  UseFlagPayload,
  MoveShipPayload,
  ErrorPayload,
} from '../../shared/protocol';

const PORT = process.env.PORT || 3000;

// Создаём HTTP сервер
const httpServer = createServer((req, res) => {
  // Простой health check
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', rooms: rooms.size }));
    return;
  }
  
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`
    <html>
      <head><title>Морской Сапёр - Сервер</title></head>
      <body style="font-family: Arial; background: #1a1a2e; color: #e8e8e8; padding: 40px;">
        <h1>🚢 Морской Сапёр - Игровой Сервер</h1>
        <p>Сервер работает!</p>
        <p>Активных комнат: ${rooms.size}</p>
        <p>WebSocket endpoint: ws://localhost:${PORT}</p>
      </body>
    </html>
  `);
});

// Создаём Socket.io сервер
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Хранилище комнат
const rooms: Map<string, GameRoom> = new Map();

// Маппинг socket.id -> roomId для быстрого поиска
const playerRooms: Map<string, string> = new Map();

// Очистка пустых комнат каждые 5 минут
setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of rooms) {
    // Удаляем комнаты без активности более 30 минут
    if (room.isEmpty() || (now - room.getLastActivity() > 30 * 60 * 1000)) {
      console.log(`Удаление неактивной комнаты: ${roomId}`);
      rooms.delete(roomId);
    }
  }
}, 5 * 60 * 1000);

// Обработка подключений
io.on('connection', (socket: Socket) => {
  console.log(`Новое подключение: ${socket.id}`);
  
  // Присоединение к игре
  socket.on('join_game', (data: JoinGamePayload) => {
    try {
      const { roomId, playerName, playerId } = data;
      
      if (!roomId || !playerName) {
        sendError(socket, 'INVALID_DATA', 'Не указан код комнаты или имя игрока');
        return;
      }
      
      // Проверяем, не в комнате ли уже игрок
      if (playerRooms.has(socket.id)) {
        sendError(socket, 'ALREADY_IN_ROOM', 'Вы уже в комнате');
        return;
      }
      
      // Получаем или создаём комнату
      let room = rooms.get(roomId);
      
      if (!room) {
        room = new GameRoom(roomId, io);
        rooms.set(roomId, room);
        console.log(`Создана комната: ${roomId}`);
      }
      
      // Пытаемся присоединиться
      const result = room.addPlayer(socket, playerName, playerId);
      
      if (result.success) {
        playerRooms.set(socket.id, roomId);
        socket.join(roomId);
        console.log(`${playerName} присоединился к комнате ${roomId}`);
      } else {
        sendError(socket, result.error || 'JOIN_FAILED', result.message || 'Не удалось присоединиться');
      }
      
    } catch (error) {
      console.error('Ошибка join_game:', error);
      sendError(socket, 'SERVER_ERROR', 'Внутренняя ошибка сервера');
    }
  });

  socket.on('leave_room', () => {
    const roomId = playerRooms.get(socket.id);
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (room) {
      room.handleLeave(socket.id);
      if (room.isEmpty()) {
        rooms.delete(roomId);
      }
    }

    playerRooms.delete(socket.id);
    socket.leave(roomId);
  });
  
  // Расстановка кораблей
  socket.on('place_ships', (data: PlaceShipsPayload) => {
    const room = getPlayerRoom(socket);
    if (room) {
      room.handlePlaceShips(socket.id, data);
    }
  });
  
  // Готовность
  socket.on('ready', () => {
    const room = getPlayerRoom(socket);
    if (room) {
      room.handleReady(socket.id);
    }
  });
  
  // Выстрел
  socket.on('shoot', (data: ShootPayload) => {
    const room = getPlayerRoom(socket);
    if (room) {
      room.handleShoot(socket.id, data);
    }
  });
  
  // Скан
  socket.on('use_scan', (data: UseScanPayload) => {
    const room = getPlayerRoom(socket);
    if (room) {
      room.handleScan(socket.id, data);
    }
  });
  
  // Разведчик
  socket.on('use_scout', (data: UseScoutPayload) => {
    const room = getPlayerRoom(socket);
    if (room) {
      room.handleScout(socket.id, data);
    }
  });

  // Сапёрный флаг
  socket.on('use_flag', (data: UseFlagPayload) => {
    const room = getPlayerRoom(socket);
    if (room) {
      room.handleFlag(socket.id, data);
    }
  });
  
  // Перемещение корабля
  socket.on('move_ship', (data: MoveShipPayload) => {
    const room = getPlayerRoom(socket);
    if (room) {
      room.handleMoveShip(socket.id, data);
    }
  });
  
  // Отключение
  socket.on('disconnect', (reason) => {
    console.log(`Отключение: ${socket.id}, причина: ${reason}`);
    
    const roomId = playerRooms.get(socket.id);
    if (roomId) {
      const room = rooms.get(roomId);
      if (room) {
        room.handleDisconnect(socket.id);
        
        // Если комната пуста - удаляем
        if (room.isEmpty()) {
          rooms.delete(roomId);
          console.log(`Комната удалена: ${roomId}`);
        }
      }
      playerRooms.delete(socket.id);
    }
  });
});

// Вспомогательные функции
function getPlayerRoom(socket: Socket): GameRoom | null {
  const roomId = playerRooms.get(socket.id);
  if (!roomId) {
    sendError(socket, 'NOT_IN_ROOM', 'Вы не в комнате');
    return null;
  }
  
  const room = rooms.get(roomId);
  if (!room) {
    sendError(socket, 'ROOM_NOT_FOUND', 'Комната не найдена');
    return null;
  }
  
  return room;
}

function sendError(socket: Socket, code: string, message: string): void {
  const payload: ErrorPayload = { code, message };
  socket.emit('error', payload);
}

// Запуск сервера
httpServer.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════╗
║     🚢 Морской Сапёр - Игровой Сервер     ║
╠═══════════════════════════════════════════╣
║  Сервер запущен на порту: ${PORT}            ║
║  WebSocket: ws://localhost:${PORT}           ║
║  Health: http://localhost:${PORT}/health     ║
╚═══════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Получен SIGTERM, завершение работы...');
  
  // Уведомляем всех игроков
  io.emit('error', { code: 'SERVER_SHUTDOWN', message: 'Сервер перезагружается' });
  
  httpServer.close(() => {
    console.log('Сервер остановлен');
    process.exit(0);
  });
});
