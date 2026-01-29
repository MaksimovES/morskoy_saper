export interface Position {
    x: number;
    y: number;
}
export type Rotation = 'horizontal' | 'vertical';
export interface Ship {
    id: string;
    size: number;
    position: Position;
    rotation: Rotation;
    hits: number[];
    armorSegment: number | null;
    armorBroken: boolean;
}
export interface Cell {
    x: number;
    y: number;
    revealed: boolean;
    hasMine: boolean;
    shipId: string | null;
    shipSegment: number;
    adjacentCount: number;
}
export interface Board {
    cells: Cell[][];
    ships: Ship[];
    mines: Position[];
}
export interface PlayerState {
    id: string;
    name: string;
    lives: number;
    board: Board;
    scansRemaining: number;
    scoutsRemaining: number;
    armorsPlaced: number;
    lastScanTurn: number;
    lastScoutTurn: number;
    ready: boolean;
}
export interface GameState {
    roomId: string;
    players: [PlayerState | null, PlayerState | null];
    currentTurn: number;
    turnNumber: number;
    phase: GamePhase;
    turnTimeLeft: number;
    gameTimeElapsed: number;
    winner: string | null;
    pendingScoutResults: PendingScout[];
}
export type GamePhase = 'waiting' | 'placement' | 'battle' | 'finished';
export interface PendingScout {
    playerId: string;
    position: Position;
    revealTurn: number;
}
export interface JoinGamePayload {
    roomId: string;
    playerName: string;
    playerId?: string;
}
export interface PlaceShipsPayload {
    ships: Ship[];
    mines: Position[];
    armor: Array<{
        shipId: string;
        segment: number;
    }>;
}
export interface ShootPayload {
    x: number;
    y: number;
}
export interface UseScanPayload {
    x: number;
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
export interface GameStartPayload {
    opponentName: string;
    yourTurn: boolean;
    yourPlayerId: string;
}
export interface TurnResultPayload {
    x: number;
    y: number;
    hit: boolean;
    armorHit: boolean;
    sunk: boolean;
    sunkShip?: Ship;
    mineHit: boolean;
    adjacentCount: number;
    gameOver: boolean;
    winner?: string;
}
export interface ScanResultPayload {
    x: number;
    y: number;
    hasShips: boolean;
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
    revealTurn: number;
}
export interface FlagResultPayload {
    x: number;
    y: number;
    success: boolean;
    wasShip: boolean;
    lifeGained: boolean;
    lives: number;
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
    yourBoard: Board;
    opponentBoard: Board;
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
export const GAME_CONSTANTS: {
    BOARD_SIZE: number;
    SHIPS: {
        size: number;
        count: number;
    }[];
    TOTAL_SHIP_CELLS: number;
    MINES_COUNT: number;
    MAX_ARMOR: number;
    MAX_LIVES: number;
    MAX_SCOUTS: number;
    SCAN_COOLDOWN: number;
    SCOUT_COOLDOWN: number;
    SCOUT_DELAY: number;
    TURN_TIME: number;
    RECONNECT_TIMEOUT: number;
};
