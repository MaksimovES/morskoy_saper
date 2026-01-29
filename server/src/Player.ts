import {
  Ship,
  Position,
  Board,
  PlaceShipsPayload,
  GAME_CONSTANTS,
} from '../../shared/protocol';

export class Player {
  id: string;
  socketId: string;
  name: string;
  ready: boolean = false;
  lives: number = GAME_CONSTANTS.MAX_LIVES;
  scoutsRemaining: number = GAME_CONSTANTS.MAX_SCOUTS;
  lastScanTurn: number = -GAME_CONSTANTS.SCAN_COOLDOWN; // Чтобы сразу можно было использовать
  lastScoutTurn: number = -GAME_CONSTANTS.SCOUT_COOLDOWN;
  disconnectedAt: number | null = null;
  
  private board: Board | null = null;
  private shots: Set<string> = new Set(); // "x,y" -> shot
  private flagAttempts: Set<string> = new Set();
  
  constructor(id: string, socketId: string, name: string) {
    this.id = id;
    this.socketId = socketId;
    this.name = name;
  }

  markDisconnected(): void {
    this.disconnectedAt = Date.now();
  }

  markConnected(socketId: string): void {
    this.socketId = socketId;
    this.disconnectedAt = null;
  }
  
  setBoard(data: PlaceShipsPayload): void {
    // Создаём карту брони: shipId -> segment
    const armorMap = new Map<string, number>();
    for (const armorInfo of data.armor) {
      armorMap.set(armorInfo.shipId, armorInfo.segment);
    }

    this.board = {
      cells: this.createEmptyCells(),
      ships: data.ships.map(s => {
        const armorSegment = armorMap.get(s.id) ?? null;
        return {
          ...s,
          armorSegment,
          armorBroken: false,
        };
      }),
      mines: data.mines,
    };
    
    // Заполняем информацию о клетках
    this.updateCellsInfo();
  }
  
  getBoard(): Board | null {
    return this.board;
  }
  
  hasBoard(): boolean {
    return this.board !== null;
  }
  
  addShot(x: number, y: number): void {
    this.shots.add(`${x},${y}`);
  }
  
  hasShot(x: number, y: number): boolean {
    return this.shots.has(`${x},${y}`);
  }

  addFlagAttempt(x: number, y: number): void {
    this.flagAttempts.add(`${x},${y}`);
  }

  hasFlagAttempt(x: number, y: number): boolean {
    return this.flagAttempts.has(`${x},${y}`);
  }
  
  private createEmptyCells(): any[][] {
    const cells: any[][] = [];
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
    return cells;
  }
  
  private updateCellsInfo(): void {
    if (!this.board) return;
    
    // Отмечаем корабли
    for (const ship of this.board.ships) {
      const cells = this.getShipCells(ship);
      for (let i = 0; i < cells.length; i++) {
        const pos = cells[i];
        if (this.isValidPosition(pos)) {
          this.board.cells[pos.y][pos.x].shipId = ship.id;
          this.board.cells[pos.y][pos.x].shipSegment = i;
        }
      }
    }
    
    // Отмечаем мины
    for (const mine of this.board.mines) {
      if (this.isValidPosition(mine)) {
        this.board.cells[mine.y][mine.x].hasMine = true;
      }
    }
    
    // Рассчитываем adjacentCount для каждой клетки
    for (let y = 0; y < GAME_CONSTANTS.BOARD_SIZE; y++) {
      for (let x = 0; x < GAME_CONSTANTS.BOARD_SIZE; x++) {
        let count = 0;
        
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            
            const nx = x + dx;
            const ny = y + dy;
            
            if (this.isValidPosition({ x: nx, y: ny })) {
              const cell = this.board.cells[ny][nx];
              if (cell.shipId !== null || cell.hasMine) {
                count++;
              }
            }
          }
        }
        
        this.board.cells[y][x].adjacentCount = count;
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
  
  private isValidPosition(pos: Position): boolean {
    return pos.x >= 0 && pos.x < GAME_CONSTANTS.BOARD_SIZE &&
           pos.y >= 0 && pos.y < GAME_CONSTANTS.BOARD_SIZE;
  }
}
