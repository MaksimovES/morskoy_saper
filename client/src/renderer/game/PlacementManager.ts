import {
  Ship,
  Position,
  Rotation,
  PlaceShipsPayload,
  GAME_CONSTANTS,
} from '../../../../shared/protocol';

interface PlacementCallbacks {
  onShipsChanged: () => void;
  onMinesChanged: (count: number) => void;
  onArmorChanged: (count: number) => void;
}

interface ShipTemplate {
  size: number;
  count: number;
  placed: number;
}

export class PlacementManager {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private shipsContainer: HTMLElement;
  private callbacks: PlacementCallbacks;
  
  private cellSize: number = 45; // Уменьшено для места под разметку
  private boardSize: number = GAME_CONSTANTS.BOARD_SIZE;
  private labelOffset: number = 25; // Отступ для разметки
  
  private ships: Ship[] = [];
  private mines: Position[] = [];
  private armor: Map<string, number> = new Map(); // shipId -> segment
  
  private shipTemplates: ShipTemplate[] = [];
  private selectedShipSize: number = 0;
  private currentRotation: Rotation = 'horizontal';
  private hoverPosition: Position | null = null;
  
  private placementMode: 'ship' | 'mine' | 'armor' = 'ship';
  
  constructor(
    canvas: HTMLCanvasElement,
    shipsContainer: HTMLElement,
    callbacks: PlacementCallbacks
  ) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.shipsContainer = shipsContainer;
    this.callbacks = callbacks;
  }
  
  initialize(): void {
    // Инициализация шаблонов кораблей
    this.shipTemplates = GAME_CONSTANTS.SHIPS.map(s => ({
      size: s.size,
      count: s.count,
      placed: 0,
    }));
    
    this.renderShipsList();
    this.setupEventListeners();
    this.render();
  }
  
  private renderShipsList(): void {
    this.shipsContainer.innerHTML = '';
    
    this.shipTemplates.forEach((template, index) => {
      const remaining = template.count - template.placed;
      
      for (let i = 0; i < template.count; i++) {
        const item = document.createElement('div');
        item.className = `ship-item${i < template.placed ? ' placed' : ''}`;
        item.dataset.size = String(template.size);
        item.dataset.index = String(index);
        
        const preview = document.createElement('div');
        preview.className = 'ship-preview';
        for (let j = 0; j < template.size; j++) {
          const cell = document.createElement('div');
          cell.className = 'ship-cell';
          preview.appendChild(cell);
        }
        
        const label = document.createElement('span');
        label.textContent = `${template.size}-палубный`;
        
        item.appendChild(preview);
        item.appendChild(label);
        
        if (i >= template.placed) {
          item.addEventListener('click', () => this.selectShip(template.size));
        }
        
        this.shipsContainer.appendChild(item);
      }
    });
    
    // Добавляем кнопки режимов
    const modeButtons = document.createElement('div');
    modeButtons.className = 'placement-modes';
    modeButtons.style.marginTop = '20px';
    modeButtons.innerHTML = `
      <button class="btn btn-small ${this.placementMode === 'mine' ? 'active' : ''}" id="mode-mine">
        Ставить мины
      </button>
      <button class="btn btn-small ${this.placementMode === 'armor' ? 'active' : ''}" id="mode-armor">
        Ставить броню
      </button>
    `;
    this.shipsContainer.appendChild(modeButtons);
    
    document.getElementById('mode-mine')?.addEventListener('click', () => {
      this.placementMode = 'mine';
      this.selectedShipSize = 0;
      this.updateModeButtons();
      this.render();
    });
    
    document.getElementById('mode-armor')?.addEventListener('click', () => {
      this.placementMode = 'armor';
      this.selectedShipSize = 0;
      this.updateModeButtons();
      this.render();
    });
  }
  
  private updateModeButtons(): void {
    document.querySelectorAll('.ship-item').forEach(item => {
      item.classList.remove('selected');
      if (this.selectedShipSize > 0 && item.getAttribute('data-size') === String(this.selectedShipSize)) {
        item.classList.add('selected');
      }
    });
    
    const mineBtn = document.getElementById('mode-mine');
    const armorBtn = document.getElementById('mode-armor');
    
    if (mineBtn) {
      mineBtn.className = `btn btn-small ${this.placementMode === 'mine' ? 'active' : ''}`;
    }
    if (armorBtn) {
      armorBtn.className = `btn btn-small ${this.placementMode === 'armor' ? 'active' : ''}`;
    }
  }
  
  private selectShip(size: number): void {
    this.selectedShipSize = size;
    this.placementMode = 'ship';
    this.updateModeButtons();
    this.render();
  }
  
  private setupEventListeners(): void {
    this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    this.canvas.addEventListener('click', (e) => this.onClick(e));
    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.onRightClick(e);
    });
    this.canvas.addEventListener('mouseleave', () => {
      this.hoverPosition = null;
      this.render();
    });
  }
  
  private getGridPosition(e: MouseEvent): Position | null {
    const rect = this.canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left - this.labelOffset) / this.cellSize);
    const y = Math.floor((e.clientY - rect.top - this.labelOffset) / this.cellSize);
    
    if (x >= 0 && x < this.boardSize && y >= 0 && y < this.boardSize) {
      return { x, y };
    }
    return null;
  }
  
  private onMouseMove(e: MouseEvent): void {
    this.hoverPosition = this.getGridPosition(e);
    this.render();
  }
  
  private onClick(e: MouseEvent): void {
    const pos = this.getGridPosition(e);
    if (!pos) return;
    
    if (this.placementMode === 'ship' && this.selectedShipSize > 0) {
      this.placeShip(pos);
    } else if (this.placementMode === 'mine') {
      this.placeMine(pos);
    } else if (this.placementMode === 'armor') {
      this.placeArmor(pos);
    }
  }
  
  private onRightClick(e: MouseEvent): void {
    const pos = this.getGridPosition(e);
    if (!pos) return;
    
    // Удаление объекта
    this.removeAt(pos);
  }
  
  private placeShip(pos: Position): void {
    if (!this.canPlaceShip(pos, this.selectedShipSize, this.currentRotation)) {
      return;
    }
    
    const template = this.shipTemplates.find(t => 
      t.size === this.selectedShipSize && t.placed < t.count
    );
    
    if (!template) return;
    
    const ship: Ship = {
      id: `ship-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      size: this.selectedShipSize,
      position: pos,
      rotation: this.currentRotation,
      hits: [],
      armorSegment: null,
      armorBroken: false,
    };
    
    this.ships.push(ship);
    template.placed++;
    
    // Автоматически выбираем следующий корабль
    const nextTemplate = this.shipTemplates.find(t => t.placed < t.count);
    if (nextTemplate) {
      this.selectedShipSize = nextTemplate.size;
    } else {
      this.selectedShipSize = 0;
      // Переключаемся на мины
      if (this.mines.length < GAME_CONSTANTS.MINES_COUNT) {
        this.placementMode = 'mine';
      }
    }
    
    this.renderShipsList();
    this.callbacks.onShipsChanged();
    this.render();
  }
  
  private placeMine(pos: Position): void {
    if (this.mines.length >= GAME_CONSTANTS.MINES_COUNT) return;
    if (this.isOccupied(pos)) return;
    if (this.mines.some(m => m.x === pos.x && m.y === pos.y)) return;
    
    this.mines.push(pos);
    this.callbacks.onMinesChanged(this.mines.length);
    this.render();
  }
  
  private placeArmor(pos: Position): void {
    if (this.armor.size >= GAME_CONSTANTS.MAX_ARMOR) return;
    
    // Найти корабль на этой позиции
    const ship = this.getShipAt(pos);
    if (!ship) return;
    if (this.armor.has(ship.id)) return; // Уже есть броня на этом корабле
    
    // Определяем индекс сегмента по позиции клика
    const segment = this.getSegmentAt(ship, pos);
    if (segment === -1) return;
    
    this.armor.set(ship.id, segment);
    ship.armorSegment = segment;
    this.callbacks.onArmorChanged(this.armor.size);
    this.render();
  }
  
  private getSegmentAt(ship: Ship, pos: Position): number {
    const cells = this.getShipCells(ship.position, ship.size, ship.rotation);
    return cells.findIndex(c => c.x === pos.x && c.y === pos.y);
  }
  
  private removeAt(pos: Position): void {
    // Удаление мины
    const mineIndex = this.mines.findIndex(m => m.x === pos.x && m.y === pos.y);
    if (mineIndex >= 0) {
      this.mines.splice(mineIndex, 1);
      this.callbacks.onMinesChanged(this.mines.length);
      this.render();
      return;
    }
    
    // Проверяем, можно ли удалить только броню (если кликнули на клетку с бронёй)
    const ship = this.getShipAt(pos);
    if (ship && this.armor.has(ship.id)) {
      const armorSegment = this.armor.get(ship.id)!;
      const segment = this.getSegmentAt(ship, pos);
      if (segment === armorSegment) {
        // Удаляем только броню
        this.armor.delete(ship.id);
        ship.armorSegment = null;
        this.callbacks.onArmorChanged(this.armor.size);
        this.render();
        return;
      }
    }
    
    // Удаление корабля
    const shipIndex = this.ships.findIndex(s => this.isShipAt(s, pos));
    if (shipIndex >= 0) {
      const shipToRemove = this.ships[shipIndex];
      const template = this.shipTemplates.find(t => t.size === shipToRemove.size);
      if (template) template.placed--;
      
      // Удаляем броню если была
      this.armor.delete(shipToRemove.id);
      this.callbacks.onArmorChanged(this.armor.size);
      
      this.ships.splice(shipIndex, 1);
      this.renderShipsList();
      this.callbacks.onShipsChanged();
      this.render();
    }
  }
  
  private canPlaceShip(pos: Position, size: number, rotation: Rotation): boolean {
    const cells = this.getShipCells(pos, size, rotation);
    
    // Проверяем границы
    for (const cell of cells) {
      if (cell.x < 0 || cell.x >= this.boardSize || 
          cell.y < 0 || cell.y >= this.boardSize) {
        return false;
      }
    }
    
    // Проверяем занятость (включая соседние клетки)
    for (const cell of cells) {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const nx = cell.x + dx;
          const ny = cell.y + dy;
          if (nx >= 0 && nx < this.boardSize && ny >= 0 && ny < this.boardSize) {
            if (this.isOccupiedByShip({ x: nx, y: ny })) {
              return false;
            }
          }
        }
      }
    }
    
    return true;
  }
  
  private getShipCells(pos: Position, size: number, rotation: Rotation): Position[] {
    const cells: Position[] = [];
    for (let i = 0; i < size; i++) {
      if (rotation === 'horizontal') {
        cells.push({ x: pos.x + i, y: pos.y });
      } else {
        cells.push({ x: pos.x, y: pos.y + i });
      }
    }
    return cells;
  }
  
  private isOccupied(pos: Position): boolean {
    return this.isOccupiedByShip(pos) || this.mines.some(m => m.x === pos.x && m.y === pos.y);
  }
  
  private isOccupiedByShip(pos: Position): boolean {
    return this.ships.some(ship => this.isShipAt(ship, pos));
  }
  
  private isShipAt(ship: Ship, pos: Position): boolean {
    const cells = this.getShipCells(ship.position, ship.size, ship.rotation);
    return cells.some(c => c.x === pos.x && c.y === pos.y);
  }
  
  private getShipAt(pos: Position): Ship | null {
    return this.ships.find(ship => this.isShipAt(ship, pos)) || null;
  }
  
  rotateSelectedShip(): void {
    this.currentRotation = this.currentRotation === 'horizontal' ? 'vertical' : 'horizontal';
    this.render();
  }
  
  clearBoard(): void {
    this.ships = [];
    this.mines = [];
    this.armor = new Map();
    this.shipTemplates.forEach(t => t.placed = 0);
    this.selectedShipSize = this.shipTemplates[0].size;
    this.placementMode = 'ship';
    
    this.renderShipsList();
    this.callbacks.onShipsChanged();
    this.callbacks.onMinesChanged(0);
    this.callbacks.onArmorChanged(0);
    this.render();
  }
  
  randomPlacement(): void {
    this.clearBoard();
    
    // Расставляем корабли
    for (const template of this.shipTemplates) {
      for (let i = 0; i < template.count; i++) {
        let placed = false;
        let attempts = 0;
        
        while (!placed && attempts < 1000) {
          const rotation: Rotation = Math.random() > 0.5 ? 'horizontal' : 'vertical';
          const maxX = rotation === 'horizontal' ? this.boardSize - template.size : this.boardSize - 1;
          const maxY = rotation === 'vertical' ? this.boardSize - template.size : this.boardSize - 1;
          
          const pos: Position = {
            x: Math.floor(Math.random() * (maxX + 1)),
            y: Math.floor(Math.random() * (maxY + 1)),
          };
          
          if (this.canPlaceShip(pos, template.size, rotation)) {
            const ship: Ship = {
              id: `ship-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              size: template.size,
              position: pos,
              rotation,
              hits: [],
              armorSegment: null,
              armorBroken: false,
            };
            this.ships.push(ship);
            template.placed++;
            placed = true;
          }
          attempts++;
        }
      }
    }
    
    // Расставляем мины
    while (this.mines.length < GAME_CONSTANTS.MINES_COUNT) {
      const pos: Position = {
        x: Math.floor(Math.random() * this.boardSize),
        y: Math.floor(Math.random() * this.boardSize),
      };
      
      if (!this.isOccupied(pos)) {
        this.mines.push(pos);
      }
    }
    
    // Расставляем броню на случайные сегменты случайных кораблей
    const shipIds = this.ships.map(s => s.id);
    while (this.armor.size < GAME_CONSTANTS.MAX_ARMOR && shipIds.length > 0) {
      const index = Math.floor(Math.random() * shipIds.length);
      const shipId = shipIds.splice(index, 1)[0];
      const ship = this.ships.find(s => s.id === shipId);
      if (ship) {
        // Выбираем случайный сегмент корабля
        const randomSegment = Math.floor(Math.random() * ship.size);
        this.armor.set(shipId, randomSegment);
        ship.armorSegment = randomSegment;
      }
    }
    
    this.selectedShipSize = 0;
    this.placementMode = 'ship';
    
    this.renderShipsList();
    this.callbacks.onShipsChanged();
    this.callbacks.onMinesChanged(this.mines.length);
    this.callbacks.onArmorChanged(this.armor.size);
    this.render();
  }
  
  isPlacementComplete(): boolean {
    const allShipsPlaced = this.shipTemplates.every(t => t.placed === t.count);
    const allMinesPlaced = this.mines.length === GAME_CONSTANTS.MINES_COUNT;
    return allShipsPlaced && allMinesPlaced;
  }
  
  getPlacementData(): PlaceShipsPayload {
    return {
      ships: this.ships.map(s => ({ 
        ...s, 
        armorSegment: this.armor.get(s.id) ?? null 
      })),
      mines: [...this.mines],
      armor: Array.from(this.armor.entries()).map(([shipId, segment]) => ({ shipId, segment })),
    };
  }

  setPlacementData(data: PlaceShipsPayload): void {
    this.ships = data.ships.map(ship => ({ ...ship }));
    this.mines = [...data.mines];
    this.armor = new Map(data.armor.map(item => [item.shipId, item.segment]));

    this.shipTemplates.forEach(template => {
      template.placed = this.ships.filter(ship => ship.size === template.size).length;
    });

    this.selectedShipSize = 0;
    this.placementMode = 'ship';

    this.renderShipsList();
    this.callbacks.onShipsChanged();
    this.callbacks.onMinesChanged(this.mines.length);
    this.callbacks.onArmorChanged(this.armor.size);
    this.render();
  }
  
  private render(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Рисуем сетку
    this.drawGrid();
    
    // Рисуем корабли
    this.drawShips();
    
    // Рисуем мины
    this.drawMines();
    
    // Рисуем превью
    if (this.hoverPosition) {
      this.drawPreview();
    }
  }
  
  private drawGrid(): void {
    const offset = this.labelOffset;
    
    // Рисуем сетку с учётом offset
    this.ctx.strokeStyle = '#2a3f5f';
    this.ctx.lineWidth = 1;
    
    for (let i = 0; i <= this.boardSize; i++) {
      this.ctx.beginPath();
      this.ctx.moveTo(offset + i * this.cellSize, offset);
      this.ctx.lineTo(offset + i * this.cellSize, offset + this.boardSize * this.cellSize);
      this.ctx.stroke();
      
      this.ctx.beginPath();
      this.ctx.moveTo(offset, offset + i * this.cellSize);
      this.ctx.lineTo(offset + this.boardSize * this.cellSize, offset + i * this.cellSize);
      this.ctx.stroke();
    }
    
    // Рисуем разметку (буквы сверху, цифры слева)
    this.ctx.fillStyle = '#8899aa';
    this.ctx.font = 'bold 12px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    
    for (let i = 0; i < this.boardSize; i++) {
      // Буквы сверху (A-J)
      this.ctx.fillText(
        String.fromCharCode(65 + i),
        offset + i * this.cellSize + this.cellSize / 2,
        offset / 2
      );
      
      // Цифры слева (1-10)
      this.ctx.fillText(
        String(i + 1),
        offset / 2,
        offset + i * this.cellSize + this.cellSize / 2
      );
    }
  }
  
  private drawShips(): void {
    const offset = this.labelOffset;
    
    for (const ship of this.ships) {
      const cells = this.getShipCells(ship.position, ship.size, ship.rotation);
      const armorSegment = this.armor.get(ship.id);
      const hasArmor = armorSegment !== undefined;
      
      // Рисуем каждую клетку корабля
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        const isArmoredCell = armorSegment === i;
        
        // Цвет клетки: золотой для брони, синий для обычной
        this.ctx.fillStyle = isArmoredCell ? '#ffd700' : '#3282b8';
        
        this.ctx.fillRect(
          offset + cell.x * this.cellSize + 2,
          offset + cell.y * this.cellSize + 2,
          this.cellSize - 4,
          this.cellSize - 4
        );
      }
      
      // Рамка корабля
      this.ctx.strokeStyle = hasArmor ? '#ffaa00' : '#00d9ff';
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(
        offset + cells[0].x * this.cellSize + 2,
        offset + cells[0].y * this.cellSize + 2,
        (ship.rotation === 'horizontal' ? ship.size * this.cellSize : this.cellSize) - 4,
        (ship.rotation === 'vertical' ? ship.size * this.cellSize : this.cellSize) - 4
      );
    }
  }
  
  private drawMines(): void {
    const offset = this.labelOffset;
    this.ctx.fillStyle = '#ff4757';
    
    for (const mine of this.mines) {
      this.ctx.beginPath();
      this.ctx.arc(
        offset + mine.x * this.cellSize + this.cellSize / 2,
        offset + mine.y * this.cellSize + this.cellSize / 2,
        this.cellSize / 3,
        0,
        Math.PI * 2
      );
      this.ctx.fill();
      
      // Шипы мины
      this.ctx.strokeStyle = '#ff4757';
      this.ctx.lineWidth = 2;
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const cx = offset + mine.x * this.cellSize + this.cellSize / 2;
        const cy = offset + mine.y * this.cellSize + this.cellSize / 2;
        this.ctx.beginPath();
        this.ctx.moveTo(
          cx + Math.cos(angle) * (this.cellSize / 3),
          cy + Math.sin(angle) * (this.cellSize / 3)
        );
        this.ctx.lineTo(
          cx + Math.cos(angle) * (this.cellSize / 2.2),
          cy + Math.sin(angle) * (this.cellSize / 2.2)
        );
        this.ctx.stroke();
      }
    }
  }
  
  private drawPreview(): void {
    if (!this.hoverPosition) return;
    const offset = this.labelOffset;
    
    if (this.placementMode === 'ship' && this.selectedShipSize > 0) {
      const canPlace = this.canPlaceShip(this.hoverPosition, this.selectedShipSize, this.currentRotation);
      const cells = this.getShipCells(this.hoverPosition, this.selectedShipSize, this.currentRotation);
      
      this.ctx.fillStyle = canPlace ? 'rgba(0, 255, 136, 0.3)' : 'rgba(255, 71, 87, 0.3)';
      this.ctx.strokeStyle = canPlace ? '#00ff88' : '#ff4757';
      this.ctx.lineWidth = 2;
      
      for (const cell of cells) {
        if (cell.x >= 0 && cell.x < this.boardSize && cell.y >= 0 && cell.y < this.boardSize) {
          this.ctx.fillRect(
            offset + cell.x * this.cellSize + 2,
            offset + cell.y * this.cellSize + 2,
            this.cellSize - 4,
            this.cellSize - 4
          );
        }
      }
    } else if (this.placementMode === 'mine') {
      const canPlace = !this.isOccupied(this.hoverPosition) && 
                       this.mines.length < GAME_CONSTANTS.MINES_COUNT;
      
      this.ctx.fillStyle = canPlace ? 'rgba(255, 71, 87, 0.3)' : 'rgba(255, 71, 87, 0.1)';
      this.ctx.beginPath();
      this.ctx.arc(
        offset + this.hoverPosition.x * this.cellSize + this.cellSize / 2,
        offset + this.hoverPosition.y * this.cellSize + this.cellSize / 2,
        this.cellSize / 3,
        0,
        Math.PI * 2
      );
      this.ctx.fill();
    } else if (this.placementMode === 'armor') {
      const ship = this.getShipAt(this.hoverPosition);
      const canPlace = ship && !this.armor.has(ship.id) && this.armor.size < GAME_CONSTANTS.MAX_ARMOR;
      
      if (ship) {
        // Подсвечиваем только одну клетку, на которую наведён курсор
        this.ctx.fillStyle = canPlace ? 'rgba(255, 215, 0, 0.5)' : 'rgba(255, 215, 0, 0.1)';
        
        this.ctx.fillRect(
          offset + this.hoverPosition.x * this.cellSize + 2,
          offset + this.hoverPosition.y * this.cellSize + 2,
          this.cellSize - 4,
          this.cellSize - 4
        );
        
        // Обводка для наглядности
        if (canPlace) {
          this.ctx.strokeStyle = '#ffd700';
          this.ctx.lineWidth = 3;
          this.ctx.strokeRect(
            offset + this.hoverPosition.x * this.cellSize + 2,
            offset + this.hoverPosition.y * this.cellSize + 2,
            this.cellSize - 4,
            this.cellSize - 4
          );
        }
      }
    }
  }
}
