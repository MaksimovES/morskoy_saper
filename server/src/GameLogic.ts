import {
  Ship,
  Position,
  Rotation,
  Board,
  PlaceShipsPayload,
  GAME_CONSTANTS,
} from '../../shared/protocol';

interface ValidationResult {
  valid: boolean;
  error?: string;
}

interface ShotResult {
  hit: boolean;
  armorHit: boolean;
  sunk: boolean;
  sunkShip?: Ship;
  mineHit: boolean;
}

interface MoveResult {
  success: boolean;
  error?: string;
}

interface ScoutInfo {
  hasShip: boolean;
  hasMine: boolean;
  adjacentCount: number;
}

export class GameLogic {
  
  // ==================== ВАЛИДАЦИЯ РАССТАНОВКИ ====================
  
  validatePlacement(data: PlaceShipsPayload): ValidationResult {
    const { ships, mines, armor } = data;
    
    // Проверяем количество кораблей
    const shipCounts = new Map<number, number>();
    for (const ship of ships) {
      shipCounts.set(ship.size, (shipCounts.get(ship.size) || 0) + 1);
    }
    
    for (const config of GAME_CONSTANTS.SHIPS) {
      const count = shipCounts.get(config.size) || 0;
      if (count !== config.count) {
        return {
          valid: false,
          error: `Неверное количество ${config.size}-палубных кораблей: ${count} вместо ${config.count}`,
        };
      }
    }
    
    // Проверяем количество мин
    if (mines.length !== GAME_CONSTANTS.MINES_COUNT) {
      return {
        valid: false,
        error: `Неверное количество мин: ${mines.length} вместо ${GAME_CONSTANTS.MINES_COUNT}`,
      };
    }
    
    // Проверяем количество брони
    if (armor.length > GAME_CONSTANTS.MAX_ARMOR) {
      return {
        valid: false,
        error: `Слишком много брони: ${armor.length} (максимум ${GAME_CONSTANTS.MAX_ARMOR})`,
      };
    }
    
    // Создаём карту занятых клеток
    const occupied = new Set<string>();
    
    // Проверяем корабли
    for (const ship of ships) {
      const cells = this.getShipCells(ship);
      
      // Проверяем границы
      for (const cell of cells) {
        if (!this.isValidPosition(cell)) {
          return {
            valid: false,
            error: `Корабль выходит за границы поля`,
          };
        }
        
        const key = `${cell.x},${cell.y}`;
        if (occupied.has(key)) {
          return {
            valid: false,
            error: `Корабли пересекаются`,
          };
        }
      }
      
      // Проверяем, что корабли не касаются друг друга
      for (const cell of cells) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            
            const nx = cell.x + dx;
            const ny = cell.y + dy;
            const neighborKey = `${nx},${ny}`;
            
            if (occupied.has(neighborKey)) {
              // Проверяем, не часть ли это того же корабля
              const isPartOfSameShip = cells.some(c => c.x === nx && c.y === ny);
              if (!isPartOfSameShip) {
                return {
                  valid: false,
                  error: `Корабли не должны касаться друг друга`,
                };
              }
            }
          }
        }
      }
      
      // Добавляем клетки корабля в занятые
      for (const cell of cells) {
        occupied.add(`${cell.x},${cell.y}`);
      }
    }
    
    // Проверяем мины (не должны быть на кораблях)
    for (const mine of mines) {
      if (!this.isValidPosition(mine)) {
        return {
          valid: false,
          error: `Мина за пределами поля`,
        };
      }
      
      const key = `${mine.x},${mine.y}`;
      if (occupied.has(key)) {
        return {
          valid: false,
          error: `Мина не может быть на корабле`,
        };
      }
    }
    
    // Проверяем, что броня назначена существующим кораблям и корректным сегментам
    const shipMap = new Map(ships.map(s => [s.id, s]));
    for (const armorInfo of armor) {
      const ship = shipMap.get(armorInfo.shipId);
      if (!ship) {
        return {
          valid: false,
          error: `Броня назначена несуществующему кораблю`,
        };
      }
      if (armorInfo.segment < 0 || armorInfo.segment >= ship.size) {
        return {
          valid: false,
          error: `Неверный сегмент брони для корабля`,
        };
      }
    }
    
    return { valid: true };
  }
  
  // ==================== ОБРАБОТКА ВЫСТРЕЛА ====================
  
  processShot(board: Board, x: number, y: number): ShotResult {
    const result: ShotResult = {
      hit: false,
      armorHit: false,
      sunk: false,
      mineHit: false,
    };
    
    const cell = board.cells[y][x];
    cell.revealed = true;
    
    // Проверяем мину
    if (cell.hasMine) {
      result.mineHit = true;
      return result;
    }
    
    // Проверяем корабль
    if (cell.shipId) {
      const ship = board.ships.find(s => s.id === cell.shipId);
      if (ship) {
        // Проверяем броню НА ЭТОМ СЕГМЕНТЕ
        if (ship.armorSegment !== null && !ship.armorBroken && 
            cell.shipSegment === ship.armorSegment) {
          ship.armorBroken = true;
          result.hit = true;
          result.armorHit = true;
          return result;
        }
        
        // Повреждаем сегмент
        if (!ship.hits.includes(cell.shipSegment)) {
          ship.hits.push(cell.shipSegment);
        }
        
        result.hit = true;
        
        // Проверяем потопление
        if (ship.hits.length >= ship.size) {
          result.sunk = true;
          result.sunkShip = ship;
        }
      }
    }
    
    return result;
  }
  
  // ==================== ЧИСЛА САПЁРА ====================
  
  getAdjacentCount(board: Board, x: number, y: number): number {
    return board.cells[y][x].adjacentCount;
  }

  disarmMine(board: Board, x: number, y: number): boolean {
    const cell = board.cells[y][x];
    if (!cell.hasMine) {
      return false;
    }

    cell.hasMine = false;
    board.mines = board.mines.filter(mine => !(mine.x === x && mine.y === y));
    this.recalculateAdjacentCounts(board);
    return true;
  }
  
  // ==================== СКАН ====================
  
  performScan(board: Board, centerX: number, centerY: number): boolean {
    // Проверяем область 3x3
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = centerX + dx;
        const y = centerY + dy;
        
        if (this.isValidPosition({ x, y })) {
          const cell = board.cells[y][x];
          // Не проверяем открытые клетки
          if (!cell.revealed && cell.shipId !== null) {
            return true;
          }
        }
      }
    }
    
    return false;
  }
  
  // ==================== РАЗВЕДЧИК ====================
  
  performScout(board: Board, x: number, y: number): ScoutInfo {
    const cell = board.cells[y][x];
    
    return {
      hasShip: cell.shipId !== null,
      hasMine: cell.hasMine,
      adjacentCount: cell.adjacentCount,
    };
  }
  
  // ==================== ПЕРЕМЕЩЕНИЕ КОРАБЛЯ ====================
  
  moveShip(board: Board, shipId: string, newPosition: Position, newRotation: Rotation): MoveResult {
    const ship = board.ships.find(s => s.id === shipId);
    
    if (!ship) {
      return { success: false, error: 'Корабль не найден' };
    }
    
    // Корабль можно переместить только если он цел
    if (ship.hits.length > 0) {
      return { success: false, error: 'Повреждённый корабль нельзя перемещать' };
    }
    
    // Очищаем старую позицию
    const oldCells = this.getShipCells(ship);
    for (const cell of oldCells) {
      if (this.isValidPosition(cell)) {
        board.cells[cell.y][cell.x].shipId = null;
        board.cells[cell.y][cell.x].shipSegment = -1;
      }
    }
    
    // Проверяем новую позицию
    const newShip = { ...ship, position: newPosition, rotation: newRotation };
    const newCells = this.getShipCells(newShip);
    
    for (const cell of newCells) {
      if (!this.isValidPosition(cell)) {
        // Откатываем
        this.restoreShipPosition(board, ship);
        return { success: false, error: 'Корабль выходит за границы' };
      }
      
      const boardCell = board.cells[cell.y][cell.x];
      
      // Нельзя ставить на открытые клетки
      if (boardCell.revealed) {
        this.restoreShipPosition(board, ship);
        return { success: false, error: 'Нельзя поставить на открытую клетку' };
      }
      
      // Нельзя ставить на другие корабли
      if (boardCell.shipId !== null) {
        this.restoreShipPosition(board, ship);
        return { success: false, error: 'Клетка занята другим кораблём' };
      }
      
      // Нельзя ставить на мины
      if (boardCell.hasMine) {
        this.restoreShipPosition(board, ship);
        return { success: false, error: 'Нельзя поставить на мину' };
      }
    }
    
    // Проверяем соседство с другими кораблями
    for (const cell of newCells) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          
          const nx = cell.x + dx;
          const ny = cell.y + dy;
          
          if (this.isValidPosition({ x: nx, y: ny })) {
            const neighborCell = board.cells[ny][nx];
            if (neighborCell.shipId !== null && neighborCell.shipId !== ship.id) {
              // Проверяем, не часть ли это нового расположения
              const isPartOfMove = newCells.some(c => c.x === nx && c.y === ny);
              if (!isPartOfMove) {
                this.restoreShipPosition(board, ship);
                return { success: false, error: 'Корабли не должны касаться друг друга' };
              }
            }
          }
        }
      }
    }
    
    // Обновляем позицию корабля
    ship.position = newPosition;
    ship.rotation = newRotation;
    
    // Устанавливаем новую позицию
    for (let i = 0; i < newCells.length; i++) {
      const cell = newCells[i];
      board.cells[cell.y][cell.x].shipId = ship.id;
      board.cells[cell.y][cell.x].shipSegment = i;
    }
    
    // Пересчитываем adjacentCount
    this.recalculateAdjacentCounts(board);
    
    return { success: true };
  }
  
  private restoreShipPosition(board: Board, ship: Ship): void {
    const cells = this.getShipCells(ship);
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      if (this.isValidPosition(cell)) {
        board.cells[cell.y][cell.x].shipId = ship.id;
        board.cells[cell.y][cell.x].shipSegment = i;
      }
    }
  }
  
  private recalculateAdjacentCounts(board: Board): void {
    for (let y = 0; y < GAME_CONSTANTS.BOARD_SIZE; y++) {
      for (let x = 0; x < GAME_CONSTANTS.BOARD_SIZE; x++) {
        let count = 0;
        
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            
            const nx = x + dx;
            const ny = y + dy;
            
            if (this.isValidPosition({ x: nx, y: ny })) {
              const cell = board.cells[ny][nx];
              if (cell.shipId !== null || cell.hasMine) {
                count++;
              }
            }
          }
        }
        
        board.cells[y][x].adjacentCount = count;
      }
    }
  }
  
  // ==================== ПРОВЕРКА ПОБЕДЫ ====================
  
  areAllShipsSunk(board: Board): boolean {
    return board.ships.every(ship => ship.hits.length >= ship.size);
  }
  
  // ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
  
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
