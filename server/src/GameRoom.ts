import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { Player } from './Player';
import { GameLogic } from './GameLogic';
import {
  Ship,
  Position,
  GamePhase,
  PlaceShipsPayload,
  ShootPayload,
  UseScanPayload,
  UseScoutPayload,
  UseFlagPayload,
  MoveShipPayload,
  RoomJoinedPayload,
  OpponentJoinedPayload,
  OpponentDisconnectedPayload,
  OpponentReconnectedPayload,
  GameStartPayload,
  TurnResultPayload,
  ScanResultPayload,
  ScoutResultPayload,
  ScoutSentPayload,
  FlagResultPayload,
  OpponentActionPayload,
  TurnChangedPayload,
  TimerUpdatePayload,
  GameOverPayload,
  RoomClosedPayload,
  SyncStatePayload,
  GameState,
  PlayerState,
  Board,
  GAME_CONSTANTS,
} from '../../shared/protocol';

interface JoinResult {
  success: boolean;
  error?: string;
  message?: string;
}

export class GameRoom {
  private roomId: string;
  private io: Server;
  private players: [Player | null, Player | null] = [null, null];
  private phase: GamePhase = 'waiting';
  private phaseBeforeDisconnect: GamePhase | null = null;
  private currentTurn: number = 0; // Индекс игрока (0 или 1)
  private turnNumber: number = 0;
  private gameLogic: GameLogic;
  private lastActivity: number = Date.now();
  
  // Таймеры
  private turnTimer: NodeJS.Timeout | null = null;
  private turnTimeLeft: number = GAME_CONSTANTS.TURN_TIME;
  private gameStartTime: number = 0;
  
  // Статистика
  private stats = {
    totalTurns: 0,
    shipsDestroyed: [0, 0] as [number, number],
    minesTriggered: [0, 0] as [number, number],
  };
  
  // Отложенные результаты разведки
  private pendingScouts: Array<{
    playerId: string;
    playerIndex: number;
    socketId: string;
    x: number;
    y: number;
    cellInfo: { hasShip: boolean; hasMine: boolean; adjacentCount: number };
    revealTurn: number;
  }> = [];
  private reconnectTimer: NodeJS.Timeout | null = null;
  
  constructor(roomId: string, io: Server) {
    this.roomId = roomId;
    this.io = io;
    this.gameLogic = new GameLogic();
  }
  
  // ==================== УПРАВЛЕНИЕ ИГРОКАМИ ====================
  
  addPlayer(socket: Socket, playerName: string, playerId?: string): JoinResult {
    this.lastActivity = Date.now();

    if (playerId) {
      const existingIndex = this.players.findIndex(p => p?.id === playerId);
      const existingPlayer = existingIndex >= 0 ? this.players[existingIndex] : null;

      if (existingPlayer) {
        existingPlayer.markConnected(socket.id);
        socket.emit('room_joined', {
          roomId: this.roomId,
          playerId: existingPlayer.id,
          playerNumber: (existingIndex + 1) as 1 | 2,
          waitingForOpponent: this.players.some(p => p?.disconnectedAt !== null) ||
            this.players[0] === null || this.players[1] === null,
        } as RoomJoinedPayload);

        const opponentIndex = existingIndex === 0 ? 1 : 0;
        const opponent = this.players[opponentIndex];
        if (opponent) {
          this.io.to(opponent.socketId).emit('opponent_reconnected', {
            opponentName: existingPlayer.name,
          } as OpponentReconnectedPayload);
        }

        this.pendingScouts = this.pendingScouts.map(scout =>
          scout.playerId === existingPlayer.id
            ? { ...scout, socketId: socket.id }
            : scout
        );

        this.clearReconnectTimer();
        if (this.players.every(p => p && p.disconnectedAt === null) && this.phaseBeforeDisconnect) {
          this.phase = this.phaseBeforeDisconnect;
          if (this.phase === 'battle') {
            this.resumeTurnTimer();
          }
          this.phaseBeforeDisconnect = null;
        }
        this.syncStateToPlayer(existingPlayer);
        return { success: true };
      }
    }

    const disconnectedIndexByName = this.players.findIndex(
      p => p?.name === playerName && p.disconnectedAt !== null
    );
    const disconnectedPlayerByName =
      disconnectedIndexByName >= 0 ? this.players[disconnectedIndexByName] : null;
    if (disconnectedPlayerByName) {
      disconnectedPlayerByName.markConnected(socket.id);
      socket.emit('room_joined', {
        roomId: this.roomId,
        playerId: disconnectedPlayerByName.id,
        playerNumber: (disconnectedIndexByName + 1) as 1 | 2,
        waitingForOpponent: this.players.some(p => p?.disconnectedAt !== null) ||
          this.players[0] === null || this.players[1] === null,
      } as RoomJoinedPayload);

      const opponentIndex = disconnectedIndexByName === 0 ? 1 : 0;
      const opponent = this.players[opponentIndex];
      if (opponent) {
        this.io.to(opponent.socketId).emit('opponent_reconnected', {
          opponentName: disconnectedPlayerByName.name,
        } as OpponentReconnectedPayload);
      }

      this.pendingScouts = this.pendingScouts.map(scout =>
        scout.playerId === disconnectedPlayerByName.id
          ? { ...scout, socketId: socket.id }
          : scout
      );

      this.clearReconnectTimer();
      if (this.players.every(p => p && p.disconnectedAt === null) && this.phaseBeforeDisconnect) {
        this.phase = this.phaseBeforeDisconnect;
        if (this.phase === 'battle') {
          this.resumeTurnTimer();
        }
        this.phaseBeforeDisconnect = null;
      }
      this.syncStateToPlayer(disconnectedPlayerByName);
      return { success: true };
    }
    
    // Проверяем, есть ли место
    const emptySlot = this.players.findIndex(p => p === null);
    if (emptySlot === -1) {
      return { success: false, error: 'ROOM_FULL', message: 'Комната заполнена' };
    }
    
    // Создаём игрока
    const playerIdGenerated = uuidv4();
    const player = new Player(playerIdGenerated, socket.id, playerName);
    this.players[emptySlot] = player;
    
    // Отправляем подтверждение
    const joinedPayload: RoomJoinedPayload = {
      roomId: this.roomId,
      playerId: playerIdGenerated,
      playerNumber: (emptySlot + 1) as 1 | 2,
      waitingForOpponent: this.players[0] === null || this.players[1] === null,
    };
    socket.emit('room_joined', joinedPayload);
    
    // Если оба игрока присоединились
    if (this.players[0] && this.players[1]) {
      // Уведомляем первого игрока о втором
      const opponent1 = this.players[0];
      const opponent2 = this.players[1];
      
      this.io.to(opponent1.socketId).emit('opponent_joined', {
        opponentName: opponent2.name,
      } as OpponentJoinedPayload);
      
      this.io.to(opponent2.socketId).emit('opponent_joined', {
        opponentName: opponent1.name,
      } as OpponentJoinedPayload);
      
      // Переходим к фазе расстановки
      this.phase = 'placement';
    }
    
    return { success: true };
  }
  
  handleDisconnect(socketId: string): void {
    const playerIndex = this.players.findIndex(p => p?.socketId === socketId);
    if (playerIndex === -1) return;
    
    const player = this.players[playerIndex];
    if (!player) return;
    
    player.markDisconnected();
    this.phaseBeforeDisconnect = this.phase;

    const opponentIndex = playerIndex === 0 ? 1 : 0;
    const opponent = this.players[opponentIndex];
    if (opponent) {
      this.io.to(opponent.socketId).emit('opponent_disconnected', {
        opponentName: player.name,
      } as OpponentDisconnectedPayload);
    }

    this.phase = 'waiting';
    this.stopTurnTimer();
    this.startReconnectTimer();
  }

  handleLeave(socketId: string): void {
    const playerIndex = this.players.findIndex(p => p?.socketId === socketId);
    if (playerIndex === -1) return;

    const player = this.players[playerIndex];
    if (!player) return;

    this.players[playerIndex] = null;
    this.phase = 'waiting';
    this.stopTurnTimer();
    this.clearReconnectTimer();

    this.io.to(this.roomId).emit('room_closed', {
      reason: 'left',
      message: `${player.name} покинул комнату.`,
    } as RoomClosedPayload);
  }
  
  isEmpty(): boolean {
    return this.players[0] === null && this.players[1] === null;
  }
  
  getLastActivity(): number {
    return this.lastActivity;
  }
  
  // ==================== РАССТАНОВКА ====================
  
  handlePlaceShips(socketId: string, data: PlaceShipsPayload): void {
    this.lastActivity = Date.now();
    
    const player = this.getPlayerBySocketId(socketId);
    if (!player) return;
    
    if (this.phase !== 'placement') {
      this.sendError(socketId, 'WRONG_PHASE', 'Сейчас не фаза расстановки');
      return;
    }
    
    // Валидация расстановки
    const validation = this.gameLogic.validatePlacement(data);
    if (!validation.valid) {
      this.sendError(socketId, 'INVALID_PLACEMENT', validation.error || 'Неверная расстановка');
      return;
    }
    
    // Сохраняем расстановку
    player.setBoard(data);
  }
  
  handleReady(socketId: string): void {
    this.lastActivity = Date.now();
    
    const player = this.getPlayerBySocketId(socketId);
    if (!player) return;
    
    if (!player.hasBoard()) {
      this.sendError(socketId, 'NO_PLACEMENT', 'Сначала расставьте корабли');
      return;
    }
    
    player.ready = true;
    
    // Проверяем, готовы ли оба
    if (this.players[0]?.ready && this.players[1]?.ready) {
      this.startGame();
    }
  }
  
  // ==================== ИГРА ====================
  
  private startGame(): void {
    this.phase = 'battle';
    this.currentTurn = Math.random() < 0.5 ? 0 : 1;
    this.turnNumber = 1;
    this.gameStartTime = Date.now();
    
    // Уведомляем игроков
    for (let i = 0; i < 2; i++) {
      const player = this.players[i];
      const opponent = this.players[i === 0 ? 1 : 0];
      
      if (player && opponent) {
        const payload: GameStartPayload = {
          opponentName: opponent.name,
          yourTurn: i === this.currentTurn,
          yourPlayerId: player.id,
        };
        this.io.to(player.socketId).emit('game_start', payload);
      }
    }
    
    // Запускаем таймер хода
    this.startTurnTimer();
  }
  
  handleShoot(socketId: string, data: ShootPayload): void {
    this.lastActivity = Date.now();
    
    const playerIndex = this.getPlayerIndexBySocketId(socketId);
    if (playerIndex === -1) return;
    
    const player = this.players[playerIndex];
    const opponent = this.players[playerIndex === 0 ? 1 : 0];
    
    if (!player || !opponent) return;
    
    // Проверки
    if (this.phase !== 'battle') {
      this.sendError(socketId, 'WRONG_PHASE', 'Игра не началась');
      return;
    }
    
    if (this.currentTurn !== playerIndex) {
      this.sendError(socketId, 'NOT_YOUR_TURN', 'Сейчас не ваш ход');
      return;
    }
    
    const { x, y } = data;
    if (x < 0 || x >= GAME_CONSTANTS.BOARD_SIZE || y < 0 || y >= GAME_CONSTANTS.BOARD_SIZE) {
      this.sendError(socketId, 'INVALID_POSITION', 'Неверная позиция');
      return;
    }
    
    // Проверяем, не стреляли ли уже сюда
    if (player.hasShot(x, y)) {
      this.sendError(socketId, 'ALREADY_SHOT', 'Вы уже стреляли в эту клетку');
      return;
    }
    
    // Выполняем выстрел
    const result = this.gameLogic.processShot(opponent.getBoard()!, x, y);
    if (!result.armorHit) {
      player.addShot(x, y);
    }
    
    // Подсчёт числа рядом (как в сапёре)
    const adjacentCount = result.mineHit
      ? 0
      : this.gameLogic.getAdjacentCount(opponent.getBoard()!, x, y);
    
    // Формируем результат
    const turnResult: TurnResultPayload = {
      x,
      y,
      hit: result.hit,
      armorHit: result.armorHit,
      sunk: result.sunk,
      sunkShip: result.sunkShip,
      mineHit: result.mineHit,
      adjacentCount,
      gameOver: false,
    };
    
    // Если попал в мину - теряет жизнь
    if (result.mineHit) {
      player.lives--;
      this.stats.minesTriggered[playerIndex]++;
    }
    
    // Если потопил корабль
    if (result.sunk) {
      this.stats.shipsDestroyed[playerIndex]++;
    }
    
    // Проверяем условия победы
    const gameOver = this.checkGameOver();
    turnResult.gameOver = gameOver !== null;
    
    if (gameOver) {
      turnResult.winner = gameOver.winner;
    }
    
    // Отправляем результат стрелявшему
    this.io.to(player.socketId).emit('turn_result', turnResult);
    
    // Отправляем оппоненту информацию о действии
    const opponentAction: OpponentActionPayload = {
      action: 'shoot',
      position: { x, y },
      result: {
        hit: result.hit,
        armorHit: result.armorHit,
        mineHit: result.mineHit,
      },
    };
    this.io.to(opponent.socketId).emit('opponent_action', opponentAction);
    
    // Если игра окончена
    if (gameOver) {
      this.endGame(gameOver.winner, gameOver.reason);
      return;
    }
    
    // Если не попал ИЛИ попал в мину ИЛИ пробил броню - переход хода
    if (!result.hit || result.mineHit || result.armorHit) {
      this.nextTurn();
    } else {
      // Если попал - ход продолжается, но сбрасываем таймер
      this.resetTurnTimer();
    }
    
    this.stats.totalTurns++;
  }
  
  handleScan(socketId: string, data: UseScanPayload): void {
    this.lastActivity = Date.now();
    
    const playerIndex = this.getPlayerIndexBySocketId(socketId);
    if (playerIndex === -1) return;
    
    const player = this.players[playerIndex];
    const opponent = this.players[playerIndex === 0 ? 1 : 0];
    
    if (!player || !opponent) return;
    
    // Проверки
    if (this.phase !== 'battle') return;
    if (this.currentTurn !== playerIndex) return;
    
    // Проверка кулдауна
    if (this.turnNumber - player.lastScanTurn < GAME_CONSTANTS.SCAN_COOLDOWN) {
      const remaining = GAME_CONSTANTS.SCAN_COOLDOWN - (this.turnNumber - player.lastScanTurn);
      this.sendError(socketId, 'COOLDOWN', `Скан будет доступен через ${remaining} ходов`);
      return;
    }
    
    const { x, y } = data;
    
    // Выполняем скан
    const hasShips = this.gameLogic.performScan(opponent.getBoard()!, x, y);
    player.lastScanTurn = this.turnNumber;
    
    const scanResult: ScanResultPayload = { x, y, hasShips };
    this.io.to(player.socketId).emit('scan_result', scanResult);
    
    // Уведомляем оппонента (он не знает результат)
    const opponentAction: OpponentActionPayload = {
      action: 'scan',
      position: { x, y },
    };
    this.io.to(opponent.socketId).emit('opponent_action', opponentAction);
  }
  
  handleScout(socketId: string, data: UseScoutPayload): void {
    this.lastActivity = Date.now();
    
    const playerIndex = this.getPlayerIndexBySocketId(socketId);
    if (playerIndex === -1) return;
    
    const player = this.players[playerIndex];
    const opponent = this.players[playerIndex === 0 ? 1 : 0];
    
    if (!player || !opponent) return;
    
    // Проверки
    if (this.phase !== 'battle') return;
    if (this.currentTurn !== playerIndex) return;
    
    // Проверка количества
    if (player.scoutsRemaining <= 0) {
      this.sendError(socketId, 'NO_SCOUTS', 'Разведчики закончились');
      return;
    }
    
    // Проверка кулдауна
    if (this.turnNumber - player.lastScoutTurn < GAME_CONSTANTS.SCOUT_COOLDOWN) {
      const remaining = GAME_CONSTANTS.SCOUT_COOLDOWN - (this.turnNumber - player.lastScoutTurn);
      this.sendError(socketId, 'COOLDOWN', `Разведчик будет доступен через ${remaining} ходов`);
      return;
    }
    
    const { x, y } = data;
    
    // Выполняем разведку
    const cellInfo = this.gameLogic.performScout(opponent.getBoard()!, x, y);
    player.scoutsRemaining--;
    player.lastScoutTurn = this.turnNumber;
    
    // Результат приходит на следующий ход игрока (через 2 хода - после хода оппонента)
    const revealTurn = this.turnNumber + 2;
    
    // Сохраняем результат в отложенные
    this.pendingScouts.push({
      playerId: player.id,
      playerIndex,
      socketId: player.socketId,
      x,
      y,
      cellInfo,
      revealTurn,
    });
    
    // Отправляем подтверждение отправки разведчика
    const scoutSent: ScoutSentPayload = { x, y, revealTurn };
    this.io.to(player.socketId).emit('scout_sent', scoutSent);
    
    // Оппонент НЕ знает о разведке (по правилам)
  }

  handleFlag(socketId: string, data: UseFlagPayload): void {
    this.lastActivity = Date.now();

    const playerIndex = this.getPlayerIndexBySocketId(socketId);
    if (playerIndex === -1) return;

    const player = this.players[playerIndex];
    const opponent = this.players[playerIndex === 0 ? 1 : 0];

    if (!player || !opponent) return;

    if (this.phase !== 'battle') {
      this.sendError(socketId, 'WRONG_PHASE', 'Игра не началась');
      return;
    }

    if (this.currentTurn !== playerIndex) {
      this.sendError(socketId, 'NOT_YOUR_TURN', 'Сейчас не ваш ход');
      return;
    }

    const { x, y } = data;
    if (x < 0 || x >= GAME_CONSTANTS.BOARD_SIZE || y < 0 || y >= GAME_CONSTANTS.BOARD_SIZE) {
      this.sendError(socketId, 'INVALID_POSITION', 'Неверная позиция');
      return;
    }

    if (player.hasShot(x, y) || player.hasFlagAttempt(x, y)) {
      this.sendError(socketId, 'INVALID_FLAG', 'Нельзя ставить флаг на эту клетку');
      return;
    }

    const board = opponent.getBoard();
    if (!board) return;
    const cell = board.cells[y][x];
    if (cell.revealed) {
      this.sendError(socketId, 'INVALID_FLAG', 'Клетка уже открыта');
      return;
    }

    const hadMine = cell.hasMine;
    const wasShip = cell.shipId !== null;
    const disarmed = hadMine ? this.gameLogic.disarmMine(board, x, y) : false;

    let lifeGained = false;
    if (disarmed) {
      const beforeLives = player.lives;
      player.lives = Math.min(GAME_CONSTANTS.MAX_LIVES, player.lives + 1);
      lifeGained = player.lives > beforeLives;
    }

    player.addFlagAttempt(x, y);

    const flagResult: FlagResultPayload = {
      x,
      y,
      success: disarmed,
      wasShip,
      lifeGained,
      lives: player.lives,
    };
    this.io.to(player.socketId).emit('flag_result', flagResult);

    const opponentAction: OpponentActionPayload = {
      action: 'flag',
      position: { x, y },
    };
    this.io.to(opponent.socketId).emit('opponent_action', opponentAction);

    this.nextTurn();
    this.stats.totalTurns++;
  }
  
  handleMoveShip(socketId: string, data: MoveShipPayload): void {
    this.lastActivity = Date.now();
    
    const playerIndex = this.getPlayerIndexBySocketId(socketId);
    if (playerIndex === -1) return;
    
    const player = this.players[playerIndex];
    if (!player) return;
    
    // Проверки
    if (this.phase !== 'battle') return;
    if (this.currentTurn !== playerIndex) return;
    
    const { shipId, newPosition, newRotation } = data;
    
    // Выполняем перемещение
    const result = this.gameLogic.moveShip(player.getBoard()!, shipId, newPosition, newRotation);
    
    if (!result.success) {
      this.sendError(socketId, 'MOVE_FAILED', result.error || 'Не удалось переместить корабль');
      return;
    }
    
    // Перемещение завершает ход
    this.nextTurn();
  }
  
  // ==================== УПРАВЛЕНИЕ ХОДАМИ ====================
  
  private nextTurn(): void {
    this.currentTurn = this.currentTurn === 0 ? 1 : 0;
    this.turnNumber++;
    
    // Уведомляем игроков
    for (let i = 0; i < 2; i++) {
      const player = this.players[i];
      if (player) {
        const payload: TurnChangedPayload = {
          currentTurn: this.currentTurn,
          turnNumber: this.turnNumber,
          yourTurn: i === this.currentTurn,
        };
        this.io.to(player.socketId).emit('turn_changed', payload);
      }
    }
    
    // Отправляем результаты разведки, которые должны раскрыться на этом ходу
    this.processPendingScouts();
    
    this.resetTurnTimer();
  }
  
  private processPendingScouts(): void {
    // Находим разведки, которые должны раскрыться на текущем ходу для текущего игрока
    const readyScouts = this.pendingScouts.filter(
      scout => scout.revealTurn <= this.turnNumber && scout.playerIndex === this.currentTurn
    );
    
    // Отправляем результаты
    for (const scout of readyScouts) {
      const player = this.players[scout.playerIndex];
      if (player) {
        const scoutResult: ScoutResultPayload = {
          x: scout.x,
          y: scout.y,
          cellInfo: scout.cellInfo,
        };
        this.io.to(player.socketId).emit('scout_result', scoutResult);
      }
    }
    
    // Удаляем обработанные разведки
    this.pendingScouts = this.pendingScouts.filter(
      scout => !(scout.revealTurn <= this.turnNumber && scout.playerIndex === this.currentTurn)
    );
  }
  
  private startTurnTimer(): void {
    this.turnTimeLeft = GAME_CONSTANTS.TURN_TIME;
    this.resumeTurnTimer();
  }

  private resumeTurnTimer(): void {
    if (this.turnTimer) return;
    if (this.turnTimeLeft <= 0) {
      this.turnTimeLeft = GAME_CONSTANTS.TURN_TIME;
    }

    this.turnTimer = setInterval(() => {
      this.turnTimeLeft--;

      // Отправляем обновление таймера
      const payload: TimerUpdatePayload = {
        turnTimeLeft: this.turnTimeLeft,
        gameTimeElapsed: Math.floor((Date.now() - this.gameStartTime) / 1000),
      };
      this.io.to(this.roomId).emit('timer_update', payload);

      // Если время вышло - автоматический пропуск хода
      if (this.turnTimeLeft <= 0) {
        this.nextTurn();
      }
    }, 1000);
  }
  
  private resetTurnTimer(): void {
    this.turnTimeLeft = GAME_CONSTANTS.TURN_TIME;
  }
  
  private stopTurnTimer(): void {
    if (this.turnTimer) {
      clearInterval(this.turnTimer);
      this.turnTimer = null;
    }
  }

  private startReconnectTimer(): void {
    if (this.reconnectTimer) return;

    this.reconnectTimer = setTimeout(() => {
      const disconnectedPlayers = this.players.filter(p => p?.disconnectedAt !== null) as Player[];
      if (disconnectedPlayers.length === 0) {
        this.clearReconnectTimer();
        return;
      }

      this.players = [null, null];
      this.phase = 'finished';
      this.stopTurnTimer();

      this.io.to(this.roomId).emit('room_closed', {
        reason: 'timeout',
        message: 'Противник не переподключился вовремя.',
      } as RoomClosedPayload);

      this.clearReconnectTimer();
    }, GAME_CONSTANTS.RECONNECT_TIMEOUT * 1000);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private syncStateToPlayer(player: Player): void {
    if (!player.getBoard()) return;
    const gameState = this.buildGameState();
    const opponentIndex = this.players.findIndex(p => p?.id !== player.id);
    const opponent = opponentIndex >= 0 ? this.players[opponentIndex] : null;

    const payload: SyncStatePayload = {
      gameState,
      yourBoard: player.getBoard()!,
      opponentBoard: opponent?.getBoard() ? this.getMaskedBoard(opponent.getBoard()!) : this.createEmptyBoard(),
    };

    this.io.to(player.socketId).emit('sync_state', payload);
  }

  private buildGameState(): GameState {
    return {
      roomId: this.roomId,
      players: this.players.map(p => (p ? this.buildPlayerState(p) : null)) as [PlayerState | null, PlayerState | null],
      currentTurn: this.currentTurn,
      turnNumber: this.turnNumber,
      phase: this.phase,
      turnTimeLeft: this.turnTimeLeft,
      gameTimeElapsed: this.gameStartTime ? Math.floor((Date.now() - this.gameStartTime) / 1000) : 0,
      winner: null,
      pendingScoutResults: this.pendingScouts.map(scout => ({
        playerId: scout.playerId,
        position: { x: scout.x, y: scout.y },
        revealTurn: scout.revealTurn,
      })),
    };
  }

  private buildPlayerState(player: Player): PlayerState {
    return {
      id: player.id,
      name: player.name,
      lives: player.lives,
      board: player.getBoard()!,
      scansRemaining: Math.max(0, GAME_CONSTANTS.SCAN_COOLDOWN - (this.turnNumber - player.lastScanTurn)),
      scoutsRemaining: player.scoutsRemaining,
      armorsPlaced: player.getBoard()?.ships.filter(ship => ship.armorSegment !== null).length ?? 0,
      lastScanTurn: player.lastScanTurn,
      lastScoutTurn: player.lastScoutTurn,
      ready: player.ready,
    };
  }

  private getMaskedBoard(board: Board): Board {
    const maskedShips = board.ships
      .filter(ship => ship.hits.length >= ship.size)
      .map((ship: Ship) => ({
        ...ship,
        hits: [...ship.hits],
      }));

    return {
      cells: board.cells.map((row: Board['cells'][number]) =>
        row.map((cell: Board['cells'][number][number]) => ({
          ...cell,
          shipId: cell.revealed ? cell.shipId : null,
          shipSegment: cell.revealed ? cell.shipSegment : -1,
          hasMine: cell.revealed ? cell.hasMine : false,
        }))
      ),
      ships: maskedShips,
      mines: [],
    };
  }

  private createEmptyBoard(): Board {
    const cells = [] as Board['cells'];
    for (let y = 0; y < GAME_CONSTANTS.BOARD_SIZE; y++) {
      cells[y] = [];
      for (let x = 0; x < GAME_CONSTANTS.BOARD_SIZE; x++) {
        cells[y][x] = {
          x,
          y,
          revealed: false,
          hasMine: false,
          shipId: null,
          shipSegment: -1,
          adjacentCount: 0,
        };
      }
    }

    return {
      cells,
      ships: [],
      mines: [],
    };
  }
  
  // ==================== ЗАВЕРШЕНИЕ ИГРЫ ====================
  
  private checkGameOver(): { winner: string; reason: 'ships_destroyed' | 'lives_depleted' } | null {
    for (let i = 0; i < 2; i++) {
      const player = this.players[i];
      const opponent = this.players[i === 0 ? 1 : 0];
      
      if (!player || !opponent) continue;
      
      // Проверяем жизни
      if (player.lives <= 0) {
        return { winner: opponent.id, reason: 'lives_depleted' };
      }
      
      // Проверяем корабли
      if (this.gameLogic.areAllShipsSunk(player.getBoard()!)) {
        return { winner: opponent.id, reason: 'ships_destroyed' };
      }
    }
    
    return null;
  }
  
  private endGame(winnerId: string, reason: 'ships_destroyed' | 'lives_depleted' | 'disconnect' | 'timeout'): void {
    this.phase = 'finished';
    this.stopTurnTimer();
    
    const winner = this.players.find(p => p?.id === winnerId);
    
    const payload: GameOverPayload = {
      winner: winnerId,
      winnerName: winner?.name || 'Unknown',
      reason,
      stats: this.stats,
    };
    
    this.io.to(this.roomId).emit('game_over', payload);
  }
  
  // ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
  
  private getPlayerBySocketId(socketId: string): Player | null {
    return this.players.find(p => p?.socketId === socketId) || null;
  }
  
  private getPlayerIndexBySocketId(socketId: string): number {
    return this.players.findIndex(p => p?.socketId === socketId);
  }
  
  private sendError(socketId: string, code: string, message: string): void {
    this.io.to(socketId).emit('error', { code, message });
  }
}
