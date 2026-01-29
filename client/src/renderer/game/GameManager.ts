import {
  Ship,
  Position,
  Board,
  Cell,
  PlaceShipsPayload,
  TurnResultPayload,
  ScanResultPayload,
  ScoutResultPayload,
  ScoutSentPayload,
  FlagResultPayload,
  OpponentActionPayload,
  TurnChangedPayload,
  TimerUpdatePayload,
  GameState,
  PlayerState,
  GAME_CONSTANTS,
} from '../../../../shared/protocol';
import { SoundManager } from '../audio/SoundManager';

export type AbilityMode = 'none' | 'scan' | 'scout' | 'flag';
type LogType = 'hit' | 'miss' | 'mine' | 'sunk' | 'info';

interface GameCallbacks {
  playerId: string;
  isMyTurn: boolean;
  onShoot: (x: number, y: number) => void;
  onScan: (x: number, y: number) => void;
  onScout: (x: number, y: number) => void;
  onFlag: (x: number, y: number) => void;
  onLog: (message: string, type: LogType) => void;
  onTurnChange: (isMyTurn: boolean) => void;
  onLivesChange: (selfLives: number, opponentLives: number) => void;
  onAbilityUpdate: (scanCooldown: number, scoutCount: number, scoutCooldown: number) => void;
  onAbilityModeChange?: (mode: AbilityMode) => void;
}

interface CellState {
  revealed: boolean;
  hit: boolean;
  armorHit: boolean;
  miss: boolean;
  mine: boolean;
  sunk: boolean;
  scanned: boolean;
  scouted: boolean;
  scoutPending: boolean; // Разведчик отправлен, ждём результат
  adjacentCount: number;
  shipId?: string;
}

interface ScanAnimation {
  x: number;
  y: number;
  hasShips: boolean;
  phase: 'scanning' | 'fading' | 'persistent';
  progress: number;      // 0-1, прогресс анимации сканирования
  alpha: number;         // Прозрачность для фазы fading
  startTime: number;     // Время начала анимации
}

interface ActiveScanZone {
  x: number;
  y: number;
  hasShips: boolean;
}

export class GameManager {
  private selfCanvas: HTMLCanvasElement;
  private opponentCanvas: HTMLCanvasElement;
  private selfCtx: CanvasRenderingContext2D;
  private opponentCtx: CanvasRenderingContext2D;
  private callbacks: GameCallbacks;
  
  private cellSize: number = 36; // Уменьшено для места под разметку
  private boardSize: number = GAME_CONSTANTS.BOARD_SIZE;
  private labelOffset: number = 25; // Отступ для разметки (буквы и цифры)
  
  // Состояние игры
  private myBoard: Board | null = null;
  private opponentCells: CellState[][] = [];
  private myCells: CellState[][] = [];
  
  private isMyTurn: boolean = false;
  private abilityMode: AbilityMode = 'none';
  private hoverPosition: Position | null = null;
  
  // Способности
  private scanCooldown: number = 0;
  private scoutCount: number = GAME_CONSTANTS.MAX_SCOUTS;
  private scoutCooldown: number = 0;
  
  // Жизни
  private myLives: number = GAME_CONSTANTS.MAX_LIVES;
  private opponentLives: number = GAME_CONSTANTS.MAX_LIVES;
  
  // Таймеры
  private turnTimeLeft: number = GAME_CONSTANTS.TURN_TIME;
  private gameTime: number = 0;
  private gameTimeInterval: number | null = null;
  
  // Анимации скана
  private scanAnimations: ScanAnimation[] = [];
  
  // Активные зоны скана (отображаются до следующего хода)
  private activeScanZones: ActiveScanZone[] = [];
  
  constructor(
    selfCanvas: HTMLCanvasElement,
    opponentCanvas: HTMLCanvasElement,
    callbacks: GameCallbacks
  ) {
    this.selfCanvas = selfCanvas;
    this.opponentCanvas = opponentCanvas;
    this.selfCtx = selfCanvas.getContext('2d')!;
    this.opponentCtx = opponentCanvas.getContext('2d')!;
    this.callbacks = callbacks;
    this.isMyTurn = callbacks.isMyTurn;
  }
  
  initialize(): void {
    // Инициализация звуков
    SoundManager.init();
    SoundManager.play('gameStart');
    
    // Инициализация сеток
    this.initializeCells();
    this.setupEventListeners();
    this.startGameTimer();
    this.render();
    
    this.callbacks.onAbilityUpdate(this.scanCooldown, this.scoutCount, this.scoutCooldown);
    this.callbacks.onAbilityModeChange?.(this.abilityMode);
  }
  
  private initializeCells(): void {
    for (let y = 0; y < this.boardSize; y++) {
      this.opponentCells[y] = [];
      this.myCells[y] = [];
      for (let x = 0; x < this.boardSize; x++) {
        this.opponentCells[y][x] = {
          revealed: false,
          hit: false,
          armorHit: false,
          miss: false,
          mine: false,
          sunk: false,
          scanned: false,
          scouted: false,
          scoutPending: false,
          adjacentCount: 0,
        };
        this.myCells[y][x] = {
          revealed: false,
          hit: false,
          armorHit: false,
          miss: false,
          mine: false,
          sunk: false,
          scanned: false,
          scouted: false,
          scoutPending: false,
          adjacentCount: 0,
        };
      }
    }
  }
  
  setMyBoard(data: PlaceShipsPayload): void {
    this.myBoard = {
      cells: [],
      ships: data.ships,
      mines: data.mines,
    };
    
    // Отмечаем позиции кораблей и мин на своём поле
    for (const ship of data.ships) {
      const cells = this.getShipCells(ship);
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        if (this.myCells[cell.y] && this.myCells[cell.y][cell.x]) {
          this.myCells[cell.y][cell.x].shipId = ship.id;
        }
      }
    }
  }
  
  private getShipCells(ship: Ship): Position[] {
    const cells: Position[] = [];
    for (let i = 0; i < ship.size; i++) {
      if (ship.rotation === 'horizontal') {
        cells.push({ x: ship.position.x + i, y: ship.position.y });
      } else {
        cells.push({ x: ship.position.x, y: ship.position.y + i });
      }
    }
    return cells;
  }
  
  private setupEventListeners(): void {
    // Поле противника - кликаем для атаки
    this.opponentCanvas.addEventListener('mousemove', (e) => {
      this.hoverPosition = this.getGridPosition(e, this.opponentCanvas);
      this.updateOpponentCursor();
      this.render();
    });
    
    this.opponentCanvas.addEventListener('click', (e) => {
      if (!this.isMyTurn) return;
      
      const pos = this.getGridPosition(e, this.opponentCanvas);
      if (!pos) return;
      
      const cell = this.opponentCells[pos.y][pos.x];
      if (cell.revealed) return; // Уже открыта
      
      if (this.abilityMode === 'scan') {
        this.callbacks.onScan(pos.x, pos.y);
        this.setAbilityMode('none');
      } else if (this.abilityMode === 'scout') {
        this.callbacks.onScout(pos.x, pos.y);
        this.setAbilityMode('none');
      } else if (this.abilityMode === 'flag') {
        this.callbacks.onFlag(pos.x, pos.y);
        this.setAbilityMode('none');
      } else {
        this.callbacks.onShoot(pos.x, pos.y);
      }
    });
    
    this.opponentCanvas.addEventListener('mouseleave', () => {
      this.hoverPosition = null;
      this.updateOpponentCursor();
      this.render();
    });
  }

  private updateOpponentCursor(): void {
    // По умолчанию canvas в CSS имеет crosshair, но мы хотим показывать запрет
    // на недоступных клетках и когда не ваш ход.
    if (!this.isMyTurn) {
      this.opponentCanvas.style.cursor = 'not-allowed';
      return;
    }

    if (!this.hoverPosition) {
      this.opponentCanvas.style.cursor = 'crosshair';
      return;
    }

    const { x, y } = this.hoverPosition;
    if (x < 0 || x >= this.boardSize || y < 0 || y >= this.boardSize) {
      this.opponentCanvas.style.cursor = 'crosshair';
      return;
    }

    const cell = this.opponentCells[y][x];
    // Броня пробита (жёлтый крест) — стрелять можно, но на следующем ходе.
    // На своём ходе стрелять туда можно, поэтому не блокируем курсор.
    if (cell.revealed) {
      this.opponentCanvas.style.cursor = 'not-allowed';
      return;
    }

    this.opponentCanvas.style.cursor = 'crosshair';
  }
  
  private getGridPosition(e: MouseEvent, canvas: HTMLCanvasElement): Position | null {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left - this.labelOffset) / this.cellSize);
    const y = Math.floor((e.clientY - rect.top - this.labelOffset) / this.cellSize);
    
    if (x >= 0 && x < this.boardSize && y >= 0 && y < this.boardSize) {
      return { x, y };
    }
    return null;
  }
  
  setAbilityMode(mode: AbilityMode): void {
    if (mode === 'scan' && this.scanCooldown > 0) return;
    if (mode === 'scout' && (this.scoutCount <= 0 || this.scoutCooldown > 0)) return;
    
    this.abilityMode = this.abilityMode === mode ? 'none' : mode;
    this.callbacks.onAbilityModeChange?.(this.abilityMode);
    this.render();
  }
  
  // ==================== ОБРАБОТКА СОБЫТИЙ СЕРВЕРА ====================
  
  handleTurnResult(data: TurnResultPayload): void {
    const cell = this.opponentCells[data.y][data.x];
    cell.adjacentCount = data.adjacentCount;

    // Попадание в броню: выстрел потрачен, ход переходит, клетка должна оставаться доступной
    // для добивания на следующем ходу, но визуально отмечается жёлтым крестиком.
    if (data.armorHit) {
      cell.armorHit = true;
      cell.revealed = false;
      cell.hit = false;
      cell.miss = false;
      cell.mine = false;
      cell.sunk = false;

      this.callbacks.onLog(`Попадание в броню! [${this.coordToString(data.x, data.y)}]`, 'hit');
      SoundManager.play('hit');
      this.render();
      return;
    }

    // Обычный выстрел фиксирует клетку как раскрытую
    cell.armorHit = false;
    cell.revealed = true;
    
    if (data.hit) {
      cell.hit = true;
      this.callbacks.onLog(`Попадание! [${this.coordToString(data.x, data.y)}]`, 'hit');
      SoundManager.play('hit');
      
      if (data.sunk && data.sunkShip) {
        cell.sunk = true;
        // Отмечаем весь корабль как потопленный
        const shipCells = this.getShipCells(data.sunkShip);
        for (const sc of shipCells) {
          this.opponentCells[sc.y][sc.x].sunk = true;
        }
        this.callbacks.onLog(`Корабль потоплен! (${data.sunkShip.size}-палубный)`, 'sunk');
        SoundManager.play('sunk');
      }
    } else if (data.mineHit) {
      cell.mine = true;
      this.myLives--;
      this.callbacks.onLivesChange(this.myLives, this.opponentLives);
      this.callbacks.onLog(`Мина! Вы потеряли жизнь. [${this.coordToString(data.x, data.y)}]`, 'mine');
      SoundManager.play('mine');
    } else {
      cell.miss = true;
      this.callbacks.onLog(`Промах [${this.coordToString(data.x, data.y)}]`, 'miss');
      SoundManager.play('miss');
    }
    
    if (data.gameOver) {
      SoundManager.play('gameOver');
    }
    
    this.render();
  }
  
  handleScanResult(data: ScanResultPayload): void {
    // Добавляем анимацию скана с фазой сканирования
    this.scanAnimations.push({
      x: data.x,
      y: data.y,
      hasShips: data.hasShips,
      phase: 'scanning',
      progress: 0,
      alpha: 1,
      startTime: performance.now(),
    });
    
    this.scanCooldown = GAME_CONSTANTS.SCAN_COOLDOWN;
    this.callbacks.onAbilityUpdate(this.scanCooldown, this.scoutCount, this.scoutCooldown);
    
    const result = data.hasShips ? 'Обнаружены корабли!' : 'Чисто';
    this.callbacks.onLog(`Скан [${this.coordToString(data.x, data.y)}]: ${result}`, 'info');
    
    SoundManager.play('scan');
    
    // Запускаем анимацию сканирования
    this.animateScan();
    this.render();
  }
  
  handleScoutSent(data: ScoutSentPayload): void {
    const cell = this.opponentCells[data.y][data.x];
    cell.scoutPending = true;
    
    // Разведчик потрачен сразу
    this.scoutCount--;
    this.scoutCooldown = GAME_CONSTANTS.SCOUT_COOLDOWN;
    this.callbacks.onAbilityUpdate(this.scanCooldown, this.scoutCount, this.scoutCooldown);
    
    this.callbacks.onLog(`Разведчик отправлен [${this.coordToString(data.x, data.y)}]. Результат на следующем ходу.`, 'info');
    SoundManager.play('scout');
    this.render();
  }

  handleFlagResult(data: FlagResultPayload): void {
    this.myLives = data.lives;
    this.callbacks.onLivesChange(this.myLives, this.opponentLives);

    if (data.success) {
      const bonus = data.lifeGained ? ' Бонус: +1 жизнь.' : '';
      this.callbacks.onLog(`Флаг успешен! Мина обезврежена [${this.coordToString(data.x, data.y)}].${bonus}`, 'info');
      SoundManager.play('scout');
    } else if (data.wasShip) {
      this.callbacks.onLog(`Флаг сорван: в секторе был корабль [${this.coordToString(data.x, data.y)}].`, 'miss');
    } else {
      this.callbacks.onLog(`Флаг не дал результата [${this.coordToString(data.x, data.y)}].`, 'miss');
    }

    this.render();
  }
  
  handleScoutResult(data: ScoutResultPayload): void {
    const cell = this.opponentCells[data.y][data.x];
    cell.scouted = true;
    cell.scoutPending = false;
    cell.adjacentCount = data.cellInfo.adjacentCount;
    
    // Счётчик и кулдаун уже обновлены в handleScoutSent
    
    let info = '';
    if (data.cellInfo.hasShip) info = 'Корабль!';
    else if (data.cellInfo.hasMine) info = 'Мина!';
    else info = `Пусто (${data.cellInfo.adjacentCount} рядом)`;
    
    this.callbacks.onLog(`Разведчик вернулся [${this.coordToString(data.x, data.y)}]: ${info}`, 'info');
    SoundManager.play('scout');
    this.render();
  }
  
  handleOpponentAction(data: OpponentActionPayload): void {
    if (data.action === 'shoot' && data.result) {
      const cell = this.myCells[data.position.y][data.position.x];
      cell.revealed = true;
      
      if (data.result.armorHit) {
        cell.armorHit = true;
        cell.hit = false;
        cell.miss = false;
        cell.mine = false;
        cell.sunk = false;
        this.callbacks.onLog(`Противник пробил броню [${this.coordToString(data.position.x, data.position.y)}]`, 'hit');
        SoundManager.play('hit');
      } else if (data.result.hit) {
        cell.armorHit = false;
        cell.hit = true;
        this.callbacks.onLog(`Противник попал [${this.coordToString(data.position.x, data.position.y)}]`, 'hit');
        SoundManager.play('hit');
      } else if (data.result.mineHit) {
        cell.armorHit = false;
        cell.mine = true;
        this.opponentLives--;
        this.callbacks.onLivesChange(this.myLives, this.opponentLives);
        this.callbacks.onLog(`Противник попал в мину!`, 'mine');
        SoundManager.play('mine');
      } else {
        cell.armorHit = false;
        cell.miss = true;
        this.callbacks.onLog(`Противник промахнулся [${this.coordToString(data.position.x, data.position.y)}]`, 'miss');
        SoundManager.play('miss');
      }
    } else if (data.action === 'flag') {
      this.callbacks.onLog(`Попытка разминирования в секторе ${this.coordToString(data.position.x, data.position.y)}`, 'info');
    }
    
    this.render();
  }
  
  handleTurnChanged(data: TurnChangedPayload): void {
    this.isMyTurn = data.yourTurn;
    this.turnTimeLeft = GAME_CONSTANTS.TURN_TIME;
    this.updateOpponentCursor();
    
    // При начале нового хода игрока - очистить подсветку сканов
    if (data.yourTurn) {
      this.activeScanZones = [];
      
      // Уменьшаем кулдауны
      if (this.scanCooldown > 0) this.scanCooldown--;
      if (this.scoutCooldown > 0) this.scoutCooldown--;
      this.callbacks.onAbilityUpdate(this.scanCooldown, this.scoutCount, this.scoutCooldown);
      
      // Звук начала вашего хода
      SoundManager.play('turn');
    }
    
    this.callbacks.onTurnChange(data.yourTurn);
    this.render();
  }
  
  handleTimerUpdate(data: TimerUpdatePayload): void {
    this.turnTimeLeft = data.turnTimeLeft;
    this.gameTime = data.gameTimeElapsed;
  }

  applySyncState(gameState: GameState, yourBoard: Board, opponentBoard: Board, playerId: string): void {
    const selfState = gameState.players.find(p => p?.id === playerId) as PlayerState | null;
    const opponentState = gameState.players.find(p => p?.id !== playerId) as PlayerState | null;

    this.turnTimeLeft = gameState.turnTimeLeft;
    this.gameTime = gameState.gameTimeElapsed;
    this.isMyTurn = gameState.currentTurn === gameState.players.findIndex(p => p?.id === playerId);
    this.updateOpponentCursor();

    if (selfState) {
      this.myLives = selfState.lives;
      this.scoutCount = selfState.scoutsRemaining;
      this.scanCooldown = Math.max(0, GAME_CONSTANTS.SCAN_COOLDOWN - (gameState.turnNumber - selfState.lastScanTurn));
      this.scoutCooldown = Math.max(0, GAME_CONSTANTS.SCOUT_COOLDOWN - (gameState.turnNumber - selfState.lastScoutTurn));
    }

    if (opponentState) {
      this.opponentLives = opponentState.lives;
    }

    this.callbacks.onLivesChange(this.myLives, this.opponentLives);
    this.callbacks.onAbilityUpdate(this.scanCooldown, this.scoutCount, this.scoutCooldown);

    this.myBoard = yourBoard;
    this.initializeCells();
    this.applyMyBoardState(yourBoard);
    this.applyOpponentBoardState(opponentBoard);
    this.render();
  }

  getIsMyTurn(): boolean {
    return this.isMyTurn;
  }
  
  getGameTime(): number {
    return this.gameTime;
  }
  
  private startGameTimer(): void {
    this.gameTimeInterval = window.setInterval(() => {
      this.gameTime++;
    }, 1000);
  }

  private applyMyBoardState(board: Board): void {
    for (let y = 0; y < this.boardSize; y++) {
      for (let x = 0; x < this.boardSize; x++) {
        const cell = board.cells[y][x];
        const state = this.myCells[y][x];

        if (!cell.revealed) continue;

        state.revealed = true;
        state.adjacentCount = cell.adjacentCount;

        if (cell.shipId) {
          state.hit = true;
        } else if (cell.hasMine) {
          state.mine = true;
        } else {
          state.miss = true;
        }
      }
    }
  }

  private applyOpponentBoardState(board: Board): void {
    for (let y = 0; y < this.boardSize; y++) {
      for (let x = 0; x < this.boardSize; x++) {
        const cell = board.cells[y][x];
        const state = this.opponentCells[y][x];

        state.adjacentCount = cell.adjacentCount;

        if (!cell.revealed) continue;

        state.revealed = true;
        if (cell.shipId) {
          state.hit = true;
        } else if (cell.hasMine) {
          state.mine = true;
        } else {
          state.miss = true;
        }
      }
    }

    for (const ship of board.ships) {
      const shipCells = this.getShipCells(ship);
      for (const cell of shipCells) {
        const state = this.opponentCells[cell.y][cell.x];
        state.sunk = true;
        state.hit = true;
        state.revealed = true;
      }
    }
  }
  
  private coordToString(x: number, y: number): string {
    return `${String.fromCharCode(65 + x)}${y + 1}`;
  }
  
  private animateScan(): void {
    const SCAN_DURATION = 600; // Длительность анимации сканирования в мс
    const FADE_SPEED = 0.03;   // Скорость затухания
    
    const animate = () => {
      let hasActive = false;
      const now = performance.now();
      
      for (const scan of this.scanAnimations) {
        if (scan.phase === 'scanning') {
          // Фаза сканирования - движение слева направо
          const elapsed = now - scan.startTime;
          scan.progress = Math.min(elapsed / SCAN_DURATION, 1);
          
          if (scan.progress >= 1) {
            // Переход к фазе затухания
            scan.phase = 'fading';
            scan.alpha = 1;
          }
          hasActive = true;
        } else if (scan.phase === 'fading') {
          // Фаза затухания
          scan.alpha -= FADE_SPEED;
          
          if (scan.alpha <= 0.3) {
            // Переход к постоянной подсветке
            scan.phase = 'persistent';
            scan.alpha = 0.3;
            
            // Добавляем в активные зоны
            this.activeScanZones.push({
              x: scan.x,
              y: scan.y,
              hasShips: scan.hasShips,
            });
          }
          hasActive = true;
        }
        // persistent фаза не требует анимации, рисуется статично
      }
      
      // Удаляем анимации, перешедшие в persistent
      this.scanAnimations = this.scanAnimations.filter(s => s.phase !== 'persistent');
      
      this.render();
      
      if (hasActive) {
        requestAnimationFrame(animate);
      }
    };
    
    requestAnimationFrame(animate);
  }
  
  // ==================== РЕНДЕРИНГ ====================
  
  private render(): void {
    this.renderBoard(this.selfCtx, this.myCells, true);
    this.renderBoard(this.opponentCtx, this.opponentCells, false);
  }
  
  private renderBoard(
    ctx: CanvasRenderingContext2D,
    cells: CellState[][],
    isMyBoard: boolean
  ): void {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    
    // Рисуем сетку
    this.drawGrid(ctx);
    
    // Если своё поле - рисуем корабли и мины
    if (isMyBoard && this.myBoard) {
      this.drawMyShips(ctx);
      this.drawMyMines(ctx);
    }
    
    // Рисуем состояние клеток
    this.drawCells(ctx, cells, isMyBoard);
    
    // Рисуем анимации скана (только на поле противника)
    if (!isMyBoard) {
      this.drawScanAnimations(ctx);
    }
    
    // Рисуем превью (только на поле противника)
    if (!isMyBoard && this.hoverPosition && this.isMyTurn) {
      this.drawHover(ctx);
    }
  }
  
  private drawGrid(ctx: CanvasRenderingContext2D): void {
    const offset = this.labelOffset;
    
    // Рисуем сетку с учётом offset
    ctx.strokeStyle = '#2a3f5f';
    ctx.lineWidth = 1;
    
    for (let i = 0; i <= this.boardSize; i++) {
      ctx.beginPath();
      ctx.moveTo(offset + i * this.cellSize, offset);
      ctx.lineTo(offset + i * this.cellSize, offset + this.boardSize * this.cellSize);
      ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(offset, offset + i * this.cellSize);
      ctx.lineTo(offset + this.boardSize * this.cellSize, offset + i * this.cellSize);
      ctx.stroke();
    }
    
    // Рисуем разметку (буквы сверху, цифры слева)
    ctx.fillStyle = '#8899aa';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    for (let i = 0; i < this.boardSize; i++) {
      // Буквы сверху (A-J)
      ctx.fillText(
        String.fromCharCode(65 + i),
        offset + i * this.cellSize + this.cellSize / 2,
        offset / 2
      );
      
      // Цифры слева (1-10)
      ctx.fillText(
        String(i + 1),
        offset / 2,
        offset + i * this.cellSize + this.cellSize / 2
      );
    }
  }
  
  private drawMyShips(ctx: CanvasRenderingContext2D): void {
    if (!this.myBoard) return;
    const offset = this.labelOffset;
    
    for (const ship of this.myBoard.ships) {
      const cells = this.getShipCells(ship);
      const hasArmor = ship.armorSegment !== null;
      
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        const isHit = ship.hits.includes(i);
        const isArmoredCell = ship.armorSegment === i && !ship.armorBroken;
        
        if (isHit) {
          ctx.fillStyle = '#ff4757';
        } else if (isArmoredCell) {
          // Только клетка с бронёй - золотая
          ctx.fillStyle = '#ffd700';
        } else {
          ctx.fillStyle = '#3282b8';
        }
        
        ctx.fillRect(
          offset + cell.x * this.cellSize + 2,
          offset + cell.y * this.cellSize + 2,
          this.cellSize - 4,
          this.cellSize - 4
        );
      }
      
      // Рамка корабля (золотая если есть броня)
      if (hasArmor && !ship.armorBroken) {
        ctx.strokeStyle = '#ffaa00';
        ctx.lineWidth = 2;
        ctx.strokeRect(
          offset + cells[0].x * this.cellSize + 2,
          offset + cells[0].y * this.cellSize + 2,
          (ship.rotation === 'horizontal' ? ship.size * this.cellSize : this.cellSize) - 4,
          (ship.rotation === 'vertical' ? ship.size * this.cellSize : this.cellSize) - 4
        );
      }
    }
  }
  
  private drawMyMines(ctx: CanvasRenderingContext2D): void {
    if (!this.myBoard) return;
    const offset = this.labelOffset;
    
    ctx.fillStyle = '#ff4757';
    
    for (const mine of this.myBoard.mines) {
      // Проверяем, была ли мина активирована
      const cell = this.myCells[mine.y][mine.x];
      if (cell.revealed && cell.mine) continue; // Уже взорвалась
      
      ctx.beginPath();
      ctx.arc(
        offset + mine.x * this.cellSize + this.cellSize / 2,
        offset + mine.y * this.cellSize + this.cellSize / 2,
        this.cellSize / 4,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
  }
  
  private drawCells(ctx: CanvasRenderingContext2D, cells: CellState[][], isMyBoard: boolean): void {
    const offset = this.labelOffset;
    
    for (let y = 0; y < this.boardSize; y++) {
      for (let x = 0; x < this.boardSize; x++) {
        const cell = cells[y][x];
        
        if (!cell.revealed && !cell.armorHit && !cell.scouted && !cell.scoutPending) continue;
        
        const cx = offset + x * this.cellSize;
        const cy = offset + y * this.cellSize;
        
        if (cell.armorHit) {
          // Пробитая броня
          ctx.fillStyle = 'rgba(255, 215, 0, 0.18)';
          ctx.fillRect(cx + 2, cy + 2, this.cellSize - 4, this.cellSize - 4);

          ctx.strokeStyle = '#ffd700';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(cx + 10, cy + 10);
          ctx.lineTo(cx + this.cellSize - 10, cy + this.cellSize - 10);
          ctx.moveTo(cx + this.cellSize - 10, cy + 10);
          ctx.lineTo(cx + 10, cy + this.cellSize - 10);
          ctx.stroke();
        } else if (cell.hit) {
          // Попадание
          ctx.fillStyle = cell.sunk ? '#8b0000' : '#ff4757';
          ctx.fillRect(cx + 2, cy + 2, this.cellSize - 4, this.cellSize - 4);
          
          // Крестик
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(cx + 10, cy + 10);
          ctx.lineTo(cx + this.cellSize - 10, cy + this.cellSize - 10);
          ctx.moveTo(cx + this.cellSize - 10, cy + 10);
          ctx.lineTo(cx + 10, cy + this.cellSize - 10);
          ctx.stroke();
        } else if (cell.mine) {
          // Мина
          ctx.fillStyle = '#ff6b6b';
          ctx.beginPath();
          ctx.arc(
            cx + this.cellSize / 2,
            cy + this.cellSize / 2,
            this.cellSize / 3,
            0,
            Math.PI * 2
          );
          ctx.fill();
          
          // Взрыв
          ctx.strokeStyle = '#ffd700';
          ctx.lineWidth = 2;
          for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(
              cx + this.cellSize / 2 + Math.cos(angle) * (this.cellSize / 4),
              cy + this.cellSize / 2 + Math.sin(angle) * (this.cellSize / 4)
            );
            ctx.lineTo(
              cx + this.cellSize / 2 + Math.cos(angle) * (this.cellSize / 2.5),
              cy + this.cellSize / 2 + Math.sin(angle) * (this.cellSize / 2.5)
            );
            ctx.stroke();
          }
        } else if (cell.miss || cell.revealed) {
          // Промах или просто открытая клетка
          ctx.fillStyle = 'rgba(100, 100, 100, 0.3)';
          ctx.fillRect(cx + 2, cy + 2, this.cellSize - 4, this.cellSize - 4);
          
          // Точка
          ctx.fillStyle = '#666';
          ctx.beginPath();
          ctx.arc(cx + this.cellSize / 2, cy + this.cellSize / 2, 4, 0, Math.PI * 2);
          ctx.fill();
        }
        
        // Число (как в сапёре)
        if (cell.adjacentCount > 0 && (cell.revealed || cell.scouted)) {
          ctx.font = 'bold 16px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          
          const colors = ['#00d9ff', '#00ff88', '#ffd700', '#ff6b6b', '#ff4757', '#ff0000', '#8b0000', '#4a0000'];
          ctx.fillStyle = colors[Math.min(cell.adjacentCount - 1, colors.length - 1)];
          
          ctx.fillText(
            String(cell.adjacentCount),
            cx + this.cellSize / 2,
            cy + this.cellSize / 2
          );
        }
        
        // Индикатор разведки
        if (cell.scouted && !cell.revealed) {
          ctx.strokeStyle = '#00ff88';
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 4]);
          ctx.strokeRect(cx + 2, cy + 2, this.cellSize - 4, this.cellSize - 4);
          ctx.setLineDash([]);
        }
        
        // Индикатор ожидания разведки
        if (cell.scoutPending) {
          ctx.strokeStyle = '#ffaa00';
          ctx.lineWidth = 2;
          ctx.setLineDash([2, 2]);
          ctx.strokeRect(cx + 4, cy + 4, this.cellSize - 8, this.cellSize - 8);
          ctx.setLineDash([]);
          
          // Иконка песочных часов (простой вариант - точки)
          ctx.fillStyle = '#ffaa00';
          ctx.beginPath();
          ctx.arc(cx + this.cellSize / 2, cy + this.cellSize / 2, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }
  
  private drawScanAnimations(ctx: CanvasRenderingContext2D): void {
    // Отрисовка активных анимаций
    for (const scan of this.scanAnimations) {
      if (scan.phase === 'scanning') {
        // Фаза сканирования - движение слева направо
        this.drawScanningPhase(ctx, scan);
      } else if (scan.phase === 'fading') {
        // Фаза затухания
        this.drawFadingPhase(ctx, scan);
      }
    }
    
    // Отрисовка постоянных зон (до следующего хода)
    this.drawActiveScanZones(ctx);
  }
  
  private drawScanningPhase(ctx: CanvasRenderingContext2D, scan: ScanAnimation): void {
    const offset = this.labelOffset;
    const baseColor = scan.hasShips ? [255, 71, 87] : [0, 217, 255];
    const scanLineColor = scan.hasShips ? [255, 150, 150] : [150, 230, 255];
    
    // Определяем границы квадрата 3x3
    const minX = Math.max(0, scan.x - 1);
    const maxX = Math.min(this.boardSize - 1, scan.x + 1);
    const minY = Math.max(0, scan.y - 1);
    const maxY = Math.min(this.boardSize - 1, scan.y + 1);
    
    const totalColumns = maxX - minX + 1;
    
    // Текущий столбец, который сканируется
    const currentColumn = Math.floor(scan.progress * totalColumns);
    const columnProgress = (scan.progress * totalColumns) % 1;
    
    // Рисуем уже отсканированные столбцы (полупрозрачный фон)
    for (let col = 0; col < currentColumn; col++) {
      const x = minX + col;
      for (let y = minY; y <= maxY; y++) {
        ctx.fillStyle = `rgba(${baseColor[0]}, ${baseColor[1]}, ${baseColor[2]}, 0.25)`;
        ctx.fillRect(offset + x * this.cellSize, offset + y * this.cellSize, this.cellSize, this.cellSize);
      }
    }
    
    // Рисуем текущий сканируемый столбец (яркая линия)
    if (currentColumn < totalColumns) {
      const x = minX + currentColumn;
      for (let y = minY; y <= maxY; y++) {
        // Градиент яркости для эффекта "сканирующей линии"
        const brightness = 0.5 + columnProgress * 0.5;
        ctx.fillStyle = `rgba(${scanLineColor[0]}, ${scanLineColor[1]}, ${scanLineColor[2]}, ${brightness})`;
        ctx.fillRect(offset + x * this.cellSize, offset + y * this.cellSize, this.cellSize, this.cellSize);
        
        // Вертикальная линия сканера
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.8 * brightness})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(offset + x * this.cellSize + this.cellSize * columnProgress, offset + y * this.cellSize);
        ctx.lineTo(offset + x * this.cellSize + this.cellSize * columnProgress, offset + (y + 1) * this.cellSize);
        ctx.stroke();
      }
    }
    
    // Рамка области сканирования
    ctx.strokeStyle = `rgba(${baseColor[0]}, ${baseColor[1]}, ${baseColor[2]}, 0.8)`;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(
      offset + minX * this.cellSize,
      offset + minY * this.cellSize,
      (maxX - minX + 1) * this.cellSize,
      (maxY - minY + 1) * this.cellSize
    );
    ctx.setLineDash([]);
  }
  
  private drawFadingPhase(ctx: CanvasRenderingContext2D, scan: ScanAnimation): void {
    const offset = this.labelOffset;
    const baseColor = scan.hasShips ? [255, 71, 87] : [0, 217, 255];
    
    // Определяем границы квадрата 3x3
    const minX = Math.max(0, scan.x - 1);
    const maxX = Math.min(this.boardSize - 1, scan.x + 1);
    const minY = Math.max(0, scan.y - 1);
    const maxY = Math.min(this.boardSize - 1, scan.y + 1);
    
    // Заливка всего квадрата
    ctx.fillStyle = `rgba(${baseColor[0]}, ${baseColor[1]}, ${baseColor[2]}, ${scan.alpha * 0.4})`;
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        ctx.fillRect(offset + x * this.cellSize, offset + y * this.cellSize, this.cellSize, this.cellSize);
      }
    }
    
    // Рамка
    ctx.strokeStyle = `rgba(${baseColor[0]}, ${baseColor[1]}, ${baseColor[2]}, ${scan.alpha})`;
    ctx.lineWidth = 3;
    ctx.strokeRect(
      offset + minX * this.cellSize,
      offset + minY * this.cellSize,
      (maxX - minX + 1) * this.cellSize,
      (maxY - minY + 1) * this.cellSize
    );
  }
  
  private drawActiveScanZones(ctx: CanvasRenderingContext2D): void {
    const offset = this.labelOffset;
    
    for (const zone of this.activeScanZones) {
      const baseColor = zone.hasShips ? [255, 71, 87] : [0, 217, 255];
      
      // Определяем границы квадрата 3x3
      const minX = Math.max(0, zone.x - 1);
      const maxX = Math.min(this.boardSize - 1, zone.x + 1);
      const minY = Math.max(0, zone.y - 1);
      const maxY = Math.min(this.boardSize - 1, zone.y + 1);
      
      // Легкая заливка
      ctx.fillStyle = `rgba(${baseColor[0]}, ${baseColor[1]}, ${baseColor[2]}, 0.1)`;
      for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
          ctx.fillRect(offset + x * this.cellSize, offset + y * this.cellSize, this.cellSize, this.cellSize);
        }
      }
      
      // Яркая рамка для подсветки зоны
      ctx.strokeStyle = `rgba(${baseColor[0]}, ${baseColor[1]}, ${baseColor[2]}, 0.7)`;
      ctx.lineWidth = 3;
      ctx.strokeRect(
        offset + minX * this.cellSize + 1,
        offset + minY * this.cellSize + 1,
        (maxX - minX + 1) * this.cellSize - 2,
        (maxY - minY + 1) * this.cellSize - 2
      );
      
      // Внутренняя рамка для эффекта глубины
      ctx.strokeStyle = `rgba(${baseColor[0]}, ${baseColor[1]}, ${baseColor[2]}, 0.3)`;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(
        offset + minX * this.cellSize + 4,
        offset + minY * this.cellSize + 4,
        (maxX - minX + 1) * this.cellSize - 8,
        (maxY - minY + 1) * this.cellSize - 8
      );
      ctx.setLineDash([]);
    }
  }
  
  private drawHover(ctx: CanvasRenderingContext2D): void {
    if (!this.hoverPosition) return;
    const offset = this.labelOffset;
    
    const { x, y } = this.hoverPosition;
    const cell = this.opponentCells[y][x];
    
    if (cell.revealed) return;
    
    if (this.abilityMode === 'scan') {
      // Превью скана 3x3
      ctx.fillStyle = 'rgba(0, 217, 255, 0.2)';
      ctx.strokeStyle = '#00d9ff';
      ctx.lineWidth = 2;
      
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < this.boardSize && ny >= 0 && ny < this.boardSize) {
            ctx.fillRect(offset + nx * this.cellSize, offset + ny * this.cellSize, this.cellSize, this.cellSize);
          }
        }
      }
    } else if (this.abilityMode === 'scout') {
      // Превью разведчика
      ctx.fillStyle = 'rgba(0, 255, 136, 0.3)';
      ctx.strokeStyle = '#00ff88';
      ctx.lineWidth = 2;
      ctx.fillRect(offset + x * this.cellSize, offset + y * this.cellSize, this.cellSize, this.cellSize);
      ctx.strokeRect(offset + x * this.cellSize + 2, offset + y * this.cellSize + 2, this.cellSize - 4, this.cellSize - 4);
    } else if (this.abilityMode === 'flag') {
      // Превью флага
      ctx.fillStyle = 'rgba(255, 165, 2, 0.2)';
      ctx.fillRect(offset + x * this.cellSize, offset + y * this.cellSize, this.cellSize, this.cellSize);

      const poleX = offset + x * this.cellSize + this.cellSize * 0.45;
      const poleY = offset + y * this.cellSize + this.cellSize * 0.2;
      const poleHeight = this.cellSize * 0.6;

      ctx.strokeStyle = '#ffa502';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(poleX, poleY);
      ctx.lineTo(poleX, poleY + poleHeight);
      ctx.stroke();

      ctx.fillStyle = '#ff6b6b';
      ctx.beginPath();
      ctx.moveTo(poleX, poleY);
      ctx.lineTo(poleX + this.cellSize * 0.3, poleY + this.cellSize * 0.12);
      ctx.lineTo(poleX, poleY + this.cellSize * 0.24);
      ctx.closePath();
      ctx.fill();
    } else {
      // Превью выстрела
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.fillRect(offset + x * this.cellSize, offset + y * this.cellSize, this.cellSize, this.cellSize);
      
      // Прицел
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(offset + x * this.cellSize + this.cellSize / 2, offset + y * this.cellSize + this.cellSize / 2, this.cellSize / 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(offset + x * this.cellSize + this.cellSize / 2, offset + y * this.cellSize + 5);
      ctx.lineTo(offset + x * this.cellSize + this.cellSize / 2, offset + y * this.cellSize + this.cellSize - 5);
      ctx.moveTo(offset + x * this.cellSize + 5, offset + y * this.cellSize + this.cellSize / 2);
      ctx.lineTo(offset + x * this.cellSize + this.cellSize - 5, offset + y * this.cellSize + this.cellSize / 2);
      ctx.stroke();
    }
  }
  
  destroy(): void {
    if (this.gameTimeInterval) {
      clearInterval(this.gameTimeInterval);
    }
  }
}
