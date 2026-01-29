import { io, Socket } from 'socket.io-client';
import {
  JoinGamePayload,
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
  RoomClosedPayload,
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
  SyncStatePayload,
  ErrorPayload,
} from '../../../../shared/protocol';

type EventCallback<T> = (data: T) => void;

export class SocketManager {
  private socket: Socket | null = null;
  private serverUrl: string = '';
  private callbacks: Map<string, EventCallback<any>[]> = new Map();

  // Подключение к серверу
  connect(serverUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.serverUrl = serverUrl;
      
      this.socket = io(serverUrl, {
        transports: ['websocket', 'polling'],
        timeout: 10000,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      this.socket.on('connect', () => {
        console.log('Подключено к серверу:', serverUrl);
        this.setupListeners();
        this.emit('socket_connected', undefined);
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        console.error('Ошибка подключения:', error);
        reject(error);
      });

      // Таймаут подключения
      setTimeout(() => {
        if (!this.socket?.connected) {
          reject(new Error('Превышено время ожидания подключения'));
        }
      }, 10000);
    });
  }

  // Отключение
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  // Проверка подключения
  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  // ==================== ОТПРАВКА СОБЫТИЙ ====================

  joinGame(roomId: string, playerName: string, playerId?: string): void {
    const payload: JoinGamePayload = { roomId, playerName, playerId };
    this.socket?.emit('join_game', payload);
  }

  leaveRoom(): void {
    this.socket?.emit('leave_room');
  }

  placeShips(data: PlaceShipsPayload): void {
    this.socket?.emit('place_ships', data);
  }

  ready(): void {
    this.socket?.emit('ready');
  }

  shoot(x: number, y: number): void {
    const payload: ShootPayload = { x, y };
    this.socket?.emit('shoot', payload);
  }

  useScan(x: number, y: number): void {
    const payload: UseScanPayload = { x, y };
    this.socket?.emit('use_scan', payload);
  }

  useScout(x: number, y: number): void {
    const payload: UseScoutPayload = { x, y };
    this.socket?.emit('use_scout', payload);
  }

  useFlag(x: number, y: number): void {
    const payload: UseFlagPayload = { x, y };
    this.socket?.emit('use_flag', payload);
  }

  moveShip(shipId: string, newX: number, newY: number, newRotation: 'horizontal' | 'vertical'): void {
    const payload: MoveShipPayload = {
      shipId,
      newPosition: { x: newX, y: newY },
      newRotation,
    };
    this.socket?.emit('move_ship', payload);
  }

  // ==================== ПОДПИСКА НА СОБЫТИЯ ====================

  on<T>(event: string, callback: EventCallback<T>): void {
    if (!this.callbacks.has(event)) {
      this.callbacks.set(event, []);
    }
    this.callbacks.get(event)!.push(callback);
  }

  off(event: string, callback?: EventCallback<any>): void {
    if (!callback) {
      this.callbacks.delete(event);
    } else {
      const callbacks = this.callbacks.get(event);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index > -1) {
          callbacks.splice(index, 1);
        }
      }
    }
  }

  private emit(event: string, data: any): void {
    const callbacks = this.callbacks.get(event);
    if (callbacks) {
      callbacks.forEach(cb => cb(data));
    }
  }

  // ==================== НАСТРОЙКА СЛУШАТЕЛЕЙ ====================

  private setupListeners(): void {
    if (!this.socket) return;

    // Комната
    this.socket.on('room_joined', (data: RoomJoinedPayload) => {
      this.emit('room_joined', data);
    });

    this.socket.on('opponent_joined', (data: OpponentJoinedPayload) => {
      this.emit('opponent_joined', data);
    });

    this.socket.on('opponent_disconnected', (data: OpponentDisconnectedPayload) => {
      this.emit('opponent_disconnected', data);
    });

    this.socket.on('opponent_reconnected', (data: OpponentReconnectedPayload) => {
      this.emit('opponent_reconnected', data);
    });

    // Игра
    this.socket.on('game_start', (data: GameStartPayload) => {
      this.emit('game_start', data);
    });

    this.socket.on('turn_result', (data: TurnResultPayload) => {
      this.emit('turn_result', data);
    });

    this.socket.on('scan_result', (data: ScanResultPayload) => {
      this.emit('scan_result', data);
    });

    this.socket.on('scout_result', (data: ScoutResultPayload) => {
      this.emit('scout_result', data);
    });

    this.socket.on('scout_sent', (data: ScoutSentPayload) => {
      this.emit('scout_sent', data);
    });

    this.socket.on('flag_result', (data: FlagResultPayload) => {
      this.emit('flag_result', data);
    });

    this.socket.on('opponent_action', (data: OpponentActionPayload) => {
      this.emit('opponent_action', data);
    });

    this.socket.on('turn_changed', (data: TurnChangedPayload) => {
      this.emit('turn_changed', data);
    });

    this.socket.on('timer_update', (data: TimerUpdatePayload) => {
      this.emit('timer_update', data);
    });

    this.socket.on('game_over', (data: GameOverPayload) => {
      this.emit('game_over', data);
    });

    this.socket.on('sync_state', (data: SyncStatePayload) => {
      this.emit('sync_state', data);
    });

    this.socket.on('room_closed', (data: RoomClosedPayload) => {
      this.emit('room_closed', data);
    });

    this.socket.on('error', (data: ErrorPayload) => {
      this.emit('error', data);
    });

    // Системные события
    this.socket.on('disconnect', (reason) => {
      console.log('Отключено от сервера:', reason);
      this.emit('disconnect', { reason });
    });

    this.socket.on('reconnect', (attemptNumber) => {
      console.log('Переподключение, попытка:', attemptNumber);
      this.emit('reconnect', { attemptNumber });
    });
  }
}

// Синглтон
export const socketManager = new SocketManager();
