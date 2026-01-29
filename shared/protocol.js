"use strict";
// Общие типы для клиента и сервера
Object.defineProperty(exports, "__esModule", { value: true });
exports.GAME_CONSTANTS = void 0;
// ==================== КОНСТАНТЫ ИГРЫ ====================
exports.GAME_CONSTANTS = {
    BOARD_SIZE: 10,
    // Корабли: 1х4, 2х3, 3х2, 4х1
    SHIPS: [
        { size: 4, count: 1 },
        { size: 3, count: 2 },
        { size: 2, count: 3 },
        { size: 1, count: 4 },
    ],
    TOTAL_SHIP_CELLS: 20, // 4 + 6 + 6 + 4
    MINES_COUNT: 9,
    MAX_ARMOR: 5,
    MAX_LIVES: 3,
    MAX_SCOUTS: 10,
    SCAN_COOLDOWN: 5, // Ходов между сканами
    SCOUT_COOLDOWN: 5, // Ходов между разведчиками
    SCOUT_DELAY: 1, // Ход задержки результата разведчика
    TURN_TIME: 60, // Секунд на ход
    RECONNECT_TIMEOUT: 60, // Секунд на переподключение
};
//# sourceMappingURL=protocol.js.map