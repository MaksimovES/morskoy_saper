// GameRenderer - утилитарный класс для отрисовки игровых элементов
// Основная логика рендеринга находится в GameManager и PlacementManager

import { GAME_CONSTANTS } from '../../../../shared/protocol';

export class GameRenderer {
  private ctx: CanvasRenderingContext2D;
  private cellSize: number;
  private boardSize: number = GAME_CONSTANTS.BOARD_SIZE;
  
  constructor(canvas: HTMLCanvasElement, cellSize: number = 40) {
    this.ctx = canvas.getContext('2d')!;
    this.cellSize = cellSize;
  }
  
  clear(): void {
    this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
  }
  
  drawGrid(color: string = '#2a3f5f'): void {
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 1;
    
    for (let i = 0; i <= this.boardSize; i++) {
      this.ctx.beginPath();
      this.ctx.moveTo(i * this.cellSize, 0);
      this.ctx.lineTo(i * this.cellSize, this.boardSize * this.cellSize);
      this.ctx.stroke();
      
      this.ctx.beginPath();
      this.ctx.moveTo(0, i * this.cellSize);
      this.ctx.lineTo(this.boardSize * this.cellSize, i * this.cellSize);
      this.ctx.stroke();
    }
  }
  
  drawCell(x: number, y: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(
      x * this.cellSize + 2,
      y * this.cellSize + 2,
      this.cellSize - 4,
      this.cellSize - 4
    );
  }
  
  drawCircle(x: number, y: number, radius: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.arc(
      x * this.cellSize + this.cellSize / 2,
      y * this.cellSize + this.cellSize / 2,
      radius,
      0,
      Math.PI * 2
    );
    this.ctx.fill();
  }
  
  drawCross(x: number, y: number, color: string, lineWidth: number = 3): void {
    const cx = x * this.cellSize;
    const cy = y * this.cellSize;
    const padding = 10;
    
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = lineWidth;
    this.ctx.beginPath();
    this.ctx.moveTo(cx + padding, cy + padding);
    this.ctx.lineTo(cx + this.cellSize - padding, cy + this.cellSize - padding);
    this.ctx.moveTo(cx + this.cellSize - padding, cy + padding);
    this.ctx.lineTo(cx + padding, cy + this.cellSize - padding);
    this.ctx.stroke();
  }
  
  drawText(x: number, y: number, text: string, color: string, font: string = 'bold 16px Arial'): void {
    this.ctx.font = font;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillStyle = color;
    this.ctx.fillText(
      text,
      x * this.cellSize + this.cellSize / 2,
      y * this.cellSize + this.cellSize / 2
    );
  }
  
  drawBorder(x: number, y: number, width: number, height: number, color: string, lineWidth: number = 2): void {
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = lineWidth;
    this.ctx.strokeRect(
      x * this.cellSize + 2,
      y * this.cellSize + 2,
      width * this.cellSize - 4,
      height * this.cellSize - 4
    );
  }
  
  // Рисуем подсветку при наведении
  drawHover(x: number, y: number, color: string = 'rgba(255, 255, 255, 0.2)'): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(
      x * this.cellSize,
      y * this.cellSize,
      this.cellSize,
      this.cellSize
    );
  }
  
  // Рисуем прицел
  drawCrosshair(x: number, y: number, color: string = '#fff'): void {
    const cx = x * this.cellSize + this.cellSize / 2;
    const cy = y * this.cellSize + this.cellSize / 2;
    
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 2;
    
    // Круг
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, this.cellSize / 3, 0, Math.PI * 2);
    this.ctx.stroke();
    
    // Линии
    this.ctx.beginPath();
    this.ctx.moveTo(cx, y * this.cellSize + 5);
    this.ctx.lineTo(cx, y * this.cellSize + this.cellSize - 5);
    this.ctx.moveTo(x * this.cellSize + 5, cy);
    this.ctx.lineTo(x * this.cellSize + this.cellSize - 5, cy);
    this.ctx.stroke();
  }
  
  // Анимация взрыва
  drawExplosion(x: number, y: number, progress: number): void {
    const cx = x * this.cellSize + this.cellSize / 2;
    const cy = y * this.cellSize + this.cellSize / 2;
    const radius = this.cellSize * progress;
    
    const gradient = this.ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    gradient.addColorStop(0, `rgba(255, 200, 0, ${1 - progress})`);
    gradient.addColorStop(0.5, `rgba(255, 100, 0, ${0.8 - progress * 0.8})`);
    gradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
    
    this.ctx.fillStyle = gradient;
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    this.ctx.fill();
  }
  
  // Анимация волны (для скана)
  drawWave(x: number, y: number, radius: number, color: string, alpha: number): void {
    const cx = x * this.cellSize + this.cellSize / 2;
    const cy = y * this.cellSize + this.cellSize / 2;
    
    this.ctx.strokeStyle = color.replace(')', `, ${alpha})`).replace('rgb', 'rgba');
    this.ctx.lineWidth = 3;
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    this.ctx.stroke();
  }
}
