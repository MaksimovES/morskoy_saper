// Общие типы для клиента и сервера

// ==================== ИГРОВЫЕ ОБЪЕКТЫ ====================

export interface Position {
  x: number;
  y: number;
}

export type Rotation = 'horizontal' | 'vertical';

export interface Ship {
  id: string;
  size: number;           // 1, 2, 3 или 4
  position: Position;     // Начальная позиция (верхний левый угол)
  rotation: Rotation;
  hits: number[];         // Индексы поврежденных сегментов (0 до size-1)
  armorSegment: number | null;  // Индекс сегмента с бронёй (0 до size-1), null если нет
  armorBroken: boolean;   // Сломана ли броня
}

export interface Cell {
  x: number;
  y: number;
  revealed: boolean;      // Открыта ли клетка
  hasMine: boolean;       // Есть ли мина
  shipId: string | null;  // ID корабля если есть
  shipSegment: number;    // Какой сегмент корабля (0, 1, 2...)
  adjacentCount: number;  // Число кораблей и мин рядом (как в сапёре)
}

export interface Board {
  cells: Cell[][];        // 10x10
  ships: Ship[];
  mines: Position[];
}

export interface PlayerState {
  id: string;
  name: string;
  lives: number;          // 3 жизни
  board: Board;
  scansRemaining: number; // Оставшиеся сканы (для отображения)
  scoutsRemaining: number; // 10 разведчиков
  armorsPlaced: number;   // Размещено брони (макс 5)
  lastScanTurn: number;   // Ход последнего скана (для кулдауна)
  lastScoutTurn: number;  // Ход последнего разведчика
  ready: boolean;         // Готов к игре (расставил корабли)
}

export interface GameState {
  roomId: string;
  players: [PlayerState | null, PlayerState | null];
  currentTurn: number;    // 0 или 1 - индекс игрока
  turnNumber: number;     // Номер хода
  phase: GamePhase;
  turnTimeLeft: number;   // Секунды до конца хода
  gameTimeElapsed: number; // Прошло секунд с начала игры
  winner: string | null;
  pendingScoutResults: PendingScout[]; // Разведчики, результат которых придёт на след ход
}

export type GamePhase = 
  | 'waiting'      // Ожидание второго игрока
  | 'placement'    // Расстановка кораблей
  | 'battle'       // Бой
  | 'finished';    // Игра окончена

export interface PendingScout {
  playerId: string;
  position: Position;
  revealTurn: number;     // На каком ходу раскроется
}

// ==================== СОБЫТИЯ ОТ КЛИЕНТА К СЕРВЕРУ ====================

export interface JoinGamePayload {
  roomId: string;
  playerName: string;
  playerId?: string;
}

export interface PlaceShipsPayload {
  ships: Ship[];
  mines: Position[];      // 9 мин
  armor: Array<{shipId: string, segment: number}>;  // Броня с указанием сегмента (макс 5)
}

export interface ShootPayload {
  x: number;
  y: number;
}

export interface UseScanPayload {
  x: number;              // Центр 3x3 области
  y: number;
}

export interface UseScoutPayload {
  x: number;
  y: number;
}

export interface UseFlagPayload {
  x: number;
  y: number;
}

export interface MoveShipPayload {
  shipId: string;
  newPosition: Position;
  newRotation: Rotation;
}

// ==================== СОБЫТИЯ ОТ СЕРВЕРА К КЛИЕНТУ ====================

export interface GameStartPayload {
  opponentName: string;
  yourTurn: boolean;
  yourPlayerId: string;
}

export interface TurnResultPayload {
  x: number;
  y: number;
  hit: boolean;           // Попал в корабль
  armorHit: boolean;      // Попал в броню
  sunk: boolean;          // Потоплен
  sunkShip?: Ship;        // Данные потопленного корабля
  mineHit: boolean;       // Попал в мину
  adjacentCount: number;  // Число для "сапёра"
  gameOver: boolean;
  winner?: string;
}

export interface ScanResultPayload {
  x: number;
  y: number;
  hasShips: boolean;      // Красный если true, прозрачный если false
}

export interface ScoutResultPayload {
  x: number;
  y: number;
  cellInfo: {
    hasShip: boolean;
    hasMine: boolean;
    adjacentCount: number;
  };
}

export interface ScoutSentPayload {
  x: number;
  y: number;
  revealTurn: number; // На каком ходу придёт результат
}

export interface FlagResultPayload {
  x: number;
  y: number;
  success: boolean;        // Мина была в клетке
  wasShip: boolean;        // В клетке был корабль
  lifeGained: boolean;     // Получена жизнь за обезвреживание
  lives: number;           // Текущее число жизней
}

export interface OpponentActionPayload {
  action: 'shoot' | 'scan' | 'scout' | 'move_ship' | 'flag';
  position: Position;
  result?: {
    hit?: boolean;
    armorHit?: boolean;
    mineHit?: boolean;
  };
}

export interface GameOverPayload {
  winner: string;
  winnerName: string;
  reason: 'ships_destroyed' | 'lives_depleted' | 'disconnect' | 'timeout';
  stats: {
    totalTurns: number;
    shipsDestroyed: [number, number];
    minesTriggered: [number, number];
  };
}

export interface SyncStatePayload {
  gameState: GameState;
  yourBoard: Board;       // Полная информация о своём поле
  opponentBoard: Board;   // Частичная информация о поле соперника (только открытые)
}

export interface ErrorPayload {
  code: string;
  message: string;
}

export interface RoomJoinedPayload {
  roomId: string;
  playerId: string;
  playerNumber: 1 | 2;
  waitingForOpponent: boolean;
}

export interface OpponentJoinedPayload {
  opponentName: string;
}

export interface OpponentDisconnectedPayload {
  opponentName: string;
}

export interface OpponentReconnectedPayload {
  opponentName: string;
}

export interface RoomClosedPayload {
  reason: 'left' | 'timeout' | 'server';
  message?: string;
}

export interface TimerUpdatePayload {
  turnTimeLeft: number;
  gameTimeElapsed: number;
}

export interface TurnChangedPayload {
  currentTurn: number;
  turnNumber: number;
  yourTurn: boolean;
}

// ==================== ТИПЫ СОБЫТИЙ ====================

export type ClientEvents = {
  join_game: JoinGamePayload;
  place_ships: PlaceShipsPayload;
  ready: void;
  shoot: ShootPayload;
  use_scan: UseScanPayload;
  use_scout: UseScoutPayload;
  use_flag: UseFlagPayload;
  move_ship: MoveShipPayload;
  leave_room: void;
  disconnect: void;
};

export type ServerEvents = {
  room_joined: RoomJoinedPayload;
  opponent_joined: OpponentJoinedPayload;
  opponent_disconnected: OpponentDisconnectedPayload;
  opponent_reconnected: OpponentReconnectedPayload;
  room_closed: RoomClosedPayload;
  game_start: GameStartPayload;
  turn_result: TurnResultPayload;
  scan_result: ScanResultPayload;
  scout_result: ScoutResultPayload;
  scout_sent: ScoutSentPayload;
  flag_result: FlagResultPayload;
  opponent_action: OpponentActionPayload;
  turn_changed: TurnChangedPayload;
  timer_update: TimerUpdatePayload;
  game_over: GameOverPayload;
  sync_state: SyncStatePayload;
  error: ErrorPayload;
};

// ==================== КОНСТАНТЫ ИГРЫ ====================

export const GAME_CONSTANTS = {
  BOARD_SIZE: 10,
  
  // Корабли: 1х4, 2х3, 3х2, 4х1
  SHIPS: [
    { size: 4, count: 1 },
    { size: 3, count: 2 },
    { size: 2, count: 3 },
    { size: 1, count: 4 },
  ],
  TOTAL_SHIP_CELLS: 20,   // 4 + 6 + 6 + 4
  
  MINES_COUNT: 9,
  MAX_ARMOR: 5,
  MAX_LIVES: 3,
  MAX_SCOUTS: 10,
  
  SCAN_COOLDOWN: 5,       // Ходов между сканами
  SCOUT_COOLDOWN: 5,      // Ходов между разведчиками
  SCOUT_DELAY: 1,         // Ход задержки результата разведчика
  
  TURN_TIME: 60,          // Секунд на ход
  RECONNECT_TIMEOUT: 60,  // Секунд на переподключение
};
