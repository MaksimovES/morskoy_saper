import { socketManager } from './network/SocketManager';
import { GameRenderer } from './ui/GameRenderer';
import { PlacementManager } from './game/PlacementManager';
import { GameManager, AbilityMode } from './game/GameManager';
import { SoundManager } from './audio/SoundManager';
import {
  RoomJoinedPayload,
  OpponentJoinedPayload,
  GameStartPayload,
  TurnResultPayload,
  ScanResultPayload,
  ScoutResultPayload,
  ScoutSentPayload,
  FlagResultPayload,
  OpponentActionPayload,
  OpponentDisconnectedPayload,
  OpponentReconnectedPayload,
  TurnChangedPayload,
  TimerUpdatePayload,
  GameOverPayload,
  SyncStatePayload,
  RoomClosedPayload,
  GameState,
  PlayerState,
  PlaceShipsPayload,
  ErrorPayload,
  GAME_CONSTANTS,
} from '../../../shared/protocol';

// ==================== ЭЛЕМЕНТЫ DOM ====================

const screens = {
  menu: document.getElementById('menu-screen')!,
  waiting: document.getElementById('waiting-screen')!,
  placement: document.getElementById('placement-screen')!,
  game: document.getElementById('game-screen')!,
  gameover: document.getElementById('gameover-screen')!,
};

const elements = {
  // Меню
  playerName: document.getElementById('player-name') as HTMLInputElement,
  serverUrl: document.getElementById('server-url') as HTMLInputElement,
  roomId: document.getElementById('room-id') as HTMLInputElement,
  btnCreateRoom: document.getElementById('btn-create-room') as HTMLButtonElement,
  btnJoinRoom: document.getElementById('btn-join-room') as HTMLButtonElement,
  connectionStatus: document.getElementById('connection-status')!,
  
  // Ожидание
  roomCode: document.getElementById('room-code')!,
  waitingStatus: document.getElementById('waiting-status')!,
  btnCopyRoom: document.getElementById('btn-copy-room') as HTMLButtonElement,
  btnCancelWaiting: document.getElementById('btn-cancel-waiting') as HTMLButtonElement,
  
  // Расстановка
  placementBoard: document.getElementById('placement-board') as HTMLCanvasElement,
  shipsToPlace: document.getElementById('ships-to-place')!,
  minesCounter: document.querySelector('#mines-counter span')!,
  armorCounter: document.querySelector('#armor-counter span')!,
  btnRotate: document.getElementById('btn-rotate') as HTMLButtonElement,
  btnClear: document.getElementById('btn-clear') as HTMLButtonElement,
  btnRandom: document.getElementById('btn-random') as HTMLButtonElement,
  btnReady: document.getElementById('btn-ready') as HTMLButtonElement,
  
  // Игра
  selfName: document.getElementById('self-name')!,
  opponentName: document.getElementById('opponent-name')!,
  selfLives: document.getElementById('self-lives')!,
  opponentLives: document.getElementById('opponent-lives')!,
  turnIndicator: document.getElementById('turn-indicator')!,
  turnTimer: document.getElementById('turn-timer')!,
  gameTimer: document.getElementById('game-timer')!,
  selfBoard: document.getElementById('self-board') as HTMLCanvasElement,
  opponentBoard: document.getElementById('opponent-board') as HTMLCanvasElement,
  btnScan: document.getElementById('btn-scan') as HTMLButtonElement,
  btnScout: document.getElementById('btn-scout') as HTMLButtonElement,
  btnFlag: document.getElementById('btn-flag') as HTMLButtonElement,
  gameLog: document.getElementById('game-log')!,
  btnMute: document.getElementById('btn-mute') as HTMLButtonElement,
  volumeSlider: document.getElementById('volume-slider') as HTMLInputElement,
  audioControls: document.querySelector('.audio-controls') as HTMLElement,
  audioDrag: document.getElementById('btn-audio-drag') as HTMLButtonElement,
  audioCollapse: document.getElementById('btn-audio-collapse') as HTMLButtonElement,
  abilitiesPanel: document.querySelector('.abilities-panel') as HTMLElement,
  
  // Конец игры
  gameoverTitle: document.getElementById('gameover-title')!,
  gameoverMessage: document.getElementById('gameover-message')!,
  gameoverStats: document.getElementById('gameover-stats')!,
  btnPlayAgain: document.getElementById('btn-play-again') as HTMLButtonElement,
};

// ==================== СОСТОЯНИЕ ПРИЛОЖЕНИЯ ====================

let currentPlayerId: string = '';
let currentRoomId: string = '';
let playerName: string = '';
let placementManager: PlacementManager | null = null;
let gameManager: GameManager | null = null;
let activeScreen: keyof typeof screens = 'menu';
let waitingReturnScreen: keyof typeof screens | null = null;
const audioState = {
  muted: false,
  volume: 0.5,
  collapsed: false,
  hasCustomPosition: false,
  dragOffsetX: 0,
  dragOffsetY: 0,
};

// ==================== ПЕРЕКЛЮЧЕНИЕ ЭКРАНОВ ====================

function showScreen(screenName: keyof typeof screens): void {
  Object.values(screens).forEach(screen => screen.classList.remove('active'));
  screens[screenName].classList.add('active');
  activeScreen = screenName;
}

function setWaitingStatus(message: string): void {
  elements.waitingStatus.textContent = message;
}

function clearSessionState(): void {
  currentPlayerId = '';
  currentRoomId = '';
  waitingReturnScreen = null;
  localStorage.removeItem('ms_player_id');
  localStorage.removeItem('ms_room_id');
  localStorage.removeItem('ms_player_name');
}

function setMuted(muted: boolean): void {
  audioState.muted = muted;
  SoundManager.setEnabled(!muted);
  updateAudioUI();
}

function setVolume(volume: number): void {
  const clamped = Math.max(0, Math.min(1, volume));
  audioState.volume = clamped;
  SoundManager.setVolume(clamped);

  if (clamped === 0) {
    audioState.muted = true;
    SoundManager.setEnabled(false);
  } else if (audioState.muted) {
    audioState.muted = false;
    SoundManager.setEnabled(true);
  }

  updateAudioUI();
}

function updateAudioUI(): void {
  elements.btnMute.classList.toggle('is-muted', audioState.muted);
  elements.btnMute.setAttribute('aria-pressed', String(audioState.muted));
  elements.audioControls.classList.toggle('is-collapsed', audioState.collapsed);

  const icon = elements.btnMute.querySelector('.mute-icon');
  const text = elements.btnMute.querySelector('.mute-text');
  const collapseIcon = elements.audioCollapse.querySelector('span');

  if (icon) {
    icon.textContent = audioState.muted ? '🔇' : '🔊';
  }

  if (text) {
    text.textContent = audioState.muted ? 'Со звуком' : 'Без звука';
  }

  if (collapseIcon) {
    collapseIcon.textContent = audioState.collapsed ? '▸' : '▾';
  }
}

function setAudioPosition(x: number, y: number, fromDrag = false): void {
  const container = elements.audioControls.closest('.game-container') as HTMLElement | null;
  if (!container) return;

  const containerRect = container.getBoundingClientRect();
  const controlRect = elements.audioControls.getBoundingClientRect();

  const maxX = containerRect.left + containerRect.width - controlRect.width - 10;
  const maxY = containerRect.top + containerRect.height - controlRect.height - 10;
  const minX = containerRect.left + 10;
  const minY = containerRect.top + 10;

  const clampedX = Math.min(Math.max(x, minX), maxX);
  const clampedY = Math.min(Math.max(y, minY), maxY);

  elements.audioControls.style.left = `${clampedX - containerRect.left}px`;
  elements.audioControls.style.top = `${clampedY - containerRect.top}px`;
  elements.audioControls.style.right = 'auto';
  elements.audioControls.style.bottom = 'auto';
  elements.audioControls.style.transform = 'none';

  if (fromDrag) {
    audioState.hasCustomPosition = true;
  }
}

function alignAudioControlsToAbilities(): void {
  const container = elements.audioControls.closest('.game-container') as HTMLElement | null;
  if (!container || audioState.hasCustomPosition) return;

  const containerRect = container.getBoundingClientRect();
  const abilitiesRect = elements.abilitiesPanel.getBoundingClientRect();
  const controlsRect = elements.audioControls.getBoundingClientRect();

  const y = abilitiesRect.top + abilitiesRect.height / 2 - controlsRect.height / 2;
  const x = containerRect.left + containerRect.width - controlsRect.width - 20;

  setAudioPosition(x, y);
}

function showStatus(message: string, type: 'error' | 'success' = 'error'): void {
  elements.connectionStatus.textContent = message;
  elements.connectionStatus.className = `status ${type}`;
}

// ==================== МЕНЮ ====================

function generateRoomId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = 'SHIP-';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function connectAndJoin(roomId: string): Promise<void> {
  const name = elements.playerName.value.trim();
  const serverUrl = elements.serverUrl.value.trim();
  const storedPlayerId = localStorage.getItem('ms_player_id');
  const storedRoomId = localStorage.getItem('ms_room_id');
  const storedName = localStorage.getItem('ms_player_name');
  
  if (!name) {
    showStatus('Введите ваше имя');
    return;
  }
  
  if (!serverUrl) {
    showStatus('Введите адрес сервера');
    return;
  }
  
  playerName = name;
  
  try {
    showStatus('Подключение...', 'success');
    elements.btnCreateRoom.disabled = true;
    elements.btnJoinRoom.disabled = true;
    
    await socketManager.connect(serverUrl);
    const reusePlayerId = storedPlayerId && storedRoomId === roomId && storedName === name
      ? storedPlayerId
      : undefined;
    socketManager.joinGame(roomId, name, reusePlayerId);
    
  } catch (error) {
    showStatus(`Ошибка: ${(error as Error).message}`);
    elements.btnCreateRoom.disabled = false;
    elements.btnJoinRoom.disabled = false;
  }
}

elements.btnCreateRoom.addEventListener('click', () => {
  const roomId = generateRoomId();
  elements.roomId.value = roomId;
  connectAndJoin(roomId);
});

elements.btnJoinRoom.addEventListener('click', () => {
  const roomId = elements.roomId.value.trim().toUpperCase();
  if (!roomId) {
    showStatus('Введите код комнаты');
    return;
  }
  connectAndJoin(roomId);
});

elements.btnCancelWaiting.addEventListener('click', () => {
  socketManager.leaveRoom();
  socketManager.disconnect();
  clearSessionState();
  showScreen('menu');
  elements.btnCreateRoom.disabled = false;
  elements.btnJoinRoom.disabled = false;
});

elements.btnCopyRoom.addEventListener('click', async () => {
  const roomCode = elements.roomCode.textContent?.trim();
  if (!roomCode) return;

  const originalText = elements.btnCopyRoom.textContent;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(roomCode);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = roomCode;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    elements.btnCopyRoom.textContent = 'Скопировано';
  } catch {
    elements.btnCopyRoom.textContent = 'Ошибка';
  }

  setTimeout(() => {
    elements.btnCopyRoom.textContent = originalText;
  }, 1500);
});

// ==================== РАССТАНОВКА ====================

elements.btnRotate.addEventListener('click', () => {
  placementManager?.rotateSelectedShip();
});

elements.btnClear.addEventListener('click', () => {
  placementManager?.clearBoard();
});

elements.btnRandom.addEventListener('click', () => {
  placementManager?.randomPlacement();
});

elements.btnReady.addEventListener('click', () => {
  if (placementManager?.isPlacementComplete()) {
    const data = placementManager.getPlacementData();
    socketManager.placeShips(data);
    socketManager.ready();
    elements.btnReady.disabled = true;
    elements.btnReady.textContent = 'Ожидание противника...';
  }
});

// Обработка клавиш
document.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'r' && placementManager) {
    placementManager.rotateSelectedShip();
  }
});

// ==================== ИГРА ====================

elements.btnScan.addEventListener('click', () => {
  gameManager?.setAbilityMode('scan');
});

elements.btnScout.addEventListener('click', () => {
  gameManager?.setAbilityMode('scout');
});

elements.btnFlag.addEventListener('click', () => {
  gameManager?.setAbilityMode('flag');
});

elements.btnMute.addEventListener('click', () => {
  setMuted(!audioState.muted);
});

elements.volumeSlider.addEventListener('input', () => {
  const volume = Number(elements.volumeSlider.value) / 100;
  setVolume(volume);
});

elements.audioCollapse.addEventListener('click', () => {
  audioState.collapsed = !audioState.collapsed;
  updateAudioUI();
});

elements.audioDrag.addEventListener('pointerdown', (event) => {
  const rect = elements.audioControls.getBoundingClientRect();
  audioState.dragOffsetX = event.clientX - rect.left;
  audioState.dragOffsetY = event.clientY - rect.top;
  elements.audioDrag.setPointerCapture(event.pointerId);
  elements.audioControls.classList.add('is-dragging');

  const onMove = (moveEvent: PointerEvent) => {
    setAudioPosition(moveEvent.clientX - audioState.dragOffsetX, moveEvent.clientY - audioState.dragOffsetY, true);
  };

  const onUp = (upEvent: PointerEvent) => {
    elements.audioDrag.releasePointerCapture(upEvent.pointerId);
    elements.audioControls.classList.remove('is-dragging');
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  };

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
});

elements.btnPlayAgain.addEventListener('click', () => {
  gameManager?.destroy();
  gameManager = null;
  placementManager = null;
  socketManager.disconnect();
  showScreen('menu');
  elements.btnCreateRoom.disabled = false;
  elements.btnJoinRoom.disabled = false;
  elements.connectionStatus.textContent = '';
  elements.connectionStatus.className = 'status';
});

// ==================== СЕТЕВЫЕ СОБЫТИЯ ====================

socketManager.on<RoomJoinedPayload>('room_joined', (data) => {
  currentPlayerId = data.playerId;
  currentRoomId = data.roomId;
  localStorage.setItem('ms_player_id', data.playerId);
  localStorage.setItem('ms_room_id', data.roomId);
  localStorage.setItem('ms_player_name', playerName);
  elements.roomCode.textContent = data.roomId;
  
  if (data.waitingForOpponent) {
    setWaitingStatus('Ожидаем игрока');
    showScreen('waiting');
  } else {
    // Оба игрока уже есть, переходим к расстановке
    startPlacement();
  }
});

socketManager.on<OpponentJoinedPayload>('opponent_joined', (data) => {
  console.log('Противник присоединился:', data.opponentName);
  startPlacement();
});

socketManager.on<OpponentDisconnectedPayload>('opponent_disconnected', (data) => {
  console.log('Противник отключился:', data.opponentName);
  if (activeScreen === 'game' || activeScreen === 'placement') {
    waitingReturnScreen = activeScreen;
  }
  setWaitingStatus('Ожидаем пользователя');
  showScreen('waiting');
});

socketManager.on<OpponentReconnectedPayload>('opponent_reconnected', (data) => {
  console.log('Противник переподключился:', data.opponentName);
  if (waitingReturnScreen) {
    showScreen(waitingReturnScreen);
    waitingReturnScreen = null;
  }
});

socketManager.on<GameStartPayload>('game_start', (data) => {
  console.log('Игра началась!', data);
  startGame(data);
});

socketManager.on<TurnResultPayload>('turn_result', (data) => {
  gameManager?.handleTurnResult(data);
});

socketManager.on<ScanResultPayload>('scan_result', (data) => {
  gameManager?.handleScanResult(data);
});

socketManager.on<ScoutResultPayload>('scout_result', (data) => {
  gameManager?.handleScoutResult(data);
});

socketManager.on<ScoutSentPayload>('scout_sent', (data) => {
  gameManager?.handleScoutSent(data);
});

socketManager.on<FlagResultPayload>('flag_result', (data) => {
  gameManager?.handleFlagResult(data);
});

socketManager.on<OpponentActionPayload>('opponent_action', (data) => {
  gameManager?.handleOpponentAction(data);
});

socketManager.on<TurnChangedPayload>('turn_changed', (data) => {
  gameManager?.handleTurnChanged(data);
});

socketManager.on<TimerUpdatePayload>('timer_update', (data) => {
  gameManager?.handleTimerUpdate(data);
});

socketManager.on<GameOverPayload>('game_over', (data) => {
  showGameOver(data);
});

socketManager.on<SyncStatePayload>('sync_state', (data) => {
  restoreFromSyncState(data);
});

socketManager.on<RoomClosedPayload>('room_closed', (data) => {
  showStatus(data.message || 'Комната закрыта');
  socketManager.disconnect();
  clearSessionState();
  showScreen('menu');
  elements.btnCreateRoom.disabled = false;
  elements.btnJoinRoom.disabled = false;
});

socketManager.on<ErrorPayload>('error', (data) => {
  console.error('Ошибка сервера:', data);
  showStatus(`Ошибка: ${data.message}`);
});

socketManager.on<{ reason: string }>('disconnect', (data) => {
  showStatus('Соединение потеряно');
  console.log('Отключение:', data?.reason);
});

socketManager.on('socket_connected', () => {
  if (currentRoomId && currentPlayerId && playerName) {
    socketManager.joinGame(currentRoomId, playerName, currentPlayerId);
  }
});

// ==================== ИГРОВЫЕ ФУНКЦИИ ====================

function startPlacement(): void {
  showScreen('placement');
  
  placementManager = new PlacementManager(
    elements.placementBoard,
    elements.shipsToPlace,
    {
      onShipsChanged: updatePlacementUI,
      onMinesChanged: (count) => {
        elements.minesCounter.textContent = String(GAME_CONSTANTS.MINES_COUNT - count);
      },
      onArmorChanged: (count) => {
        elements.armorCounter.textContent = String(GAME_CONSTANTS.MAX_ARMOR - count);
      },
    }
  );
  
  placementManager.initialize();
  updatePlacementUI();
}

function restoreFromSyncState(data: SyncStatePayload): void {
  const { gameState, yourBoard, opponentBoard } = data;
  const playerState = getPlayerState(gameState, currentPlayerId);
  const opponentState = getOpponentState(gameState, currentPlayerId);

  if (gameState.phase === 'waiting') {
    setWaitingStatus('Ожидаем пользователя');
    showScreen('waiting');
    return;
  }

  if (gameState.phase === 'placement') {
    startPlacement();
    if (placementManager) {
      placementManager.setPlacementData(boardToPlacementData(yourBoard));
    }
    if (playerState?.ready) {
      elements.btnReady.disabled = true;
      elements.btnReady.textContent = 'Ожидание противника...';
    } else {
      updatePlacementUI();
    }
    return;
  }

  showScreen('game');
  if (gameManager) {
    gameManager.destroy();
  }

  elements.selfName.textContent = playerState?.name || playerName;
  elements.opponentName.textContent = opponentState?.name || 'Противник';
  updateLives(elements.selfLives, playerState?.lives ?? GAME_CONSTANTS.MAX_LIVES);
  updateLives(elements.opponentLives, opponentState?.lives ?? GAME_CONSTANTS.MAX_LIVES);

  gameManager = new GameManager(
    elements.selfBoard,
    elements.opponentBoard,
    {
      playerId: currentPlayerId,
      isMyTurn: gameState.currentTurn === gameState.players.findIndex(p => p?.id === currentPlayerId),
      onShoot: (x, y) => socketManager.shoot(x, y),
      onScan: (x, y) => socketManager.useScan(x, y),
      onScout: (x, y) => socketManager.useScout(x, y),
      onFlag: (x, y) => socketManager.useFlag(x, y),
      onLog: addGameLog,
      onTurnChange: updateTurnIndicator,
      onLivesChange: (selfLives, oppLives) => {
        updateLives(elements.selfLives, selfLives);
        updateLives(elements.opponentLives, oppLives);
      },
      onAbilityUpdate: updateAbilities,
      onAbilityModeChange: updateAbilitySelection,
    }
  );

  gameManager.setMyBoard(boardToPlacementData(yourBoard));
  gameManager.initialize();
  gameManager.applySyncState(gameState, yourBoard, opponentBoard, currentPlayerId);
  updateTurnIndicator(gameManager.getIsMyTurn());
  elements.turnTimer.textContent = String(gameState.turnTimeLeft);
}

function getPlayerState(gameState: GameState, playerId: string): PlayerState | null {
  return gameState.players.find(p => p?.id === playerId) || null;
}

function getOpponentState(gameState: GameState, playerId: string): PlayerState | null {
  return gameState.players.find(p => p?.id !== playerId) || null;
}

function boardToPlacementData(board: { ships: PlaceShipsPayload['ships']; mines: PlaceShipsPayload['mines']; }): PlaceShipsPayload {
  const armor = board.ships
    .filter(ship => ship.armorSegment !== null)
    .map(ship => ({ shipId: ship.id, segment: ship.armorSegment as number }));

  return {
    ships: board.ships,
    mines: board.mines,
    armor,
  };
}

function updatePlacementUI(): void {
  const isComplete = placementManager?.isPlacementComplete() ?? false;
  elements.btnReady.disabled = !isComplete;
}

function startGame(data: GameStartPayload): void {
  showScreen('game');
  
  elements.selfName.textContent = playerName;
  elements.opponentName.textContent = data.opponentName;
  
  // Инициализация жизней
  updateLives(elements.selfLives, GAME_CONSTANTS.MAX_LIVES);
  updateLives(elements.opponentLives, GAME_CONSTANTS.MAX_LIVES);
  
  // Создание менеджера игры
  gameManager = new GameManager(
    elements.selfBoard,
    elements.opponentBoard,
    {
      playerId: data.yourPlayerId,
      isMyTurn: data.yourTurn,
      onShoot: (x, y) => socketManager.shoot(x, y),
      onScan: (x, y) => socketManager.useScan(x, y),
      onScout: (x, y) => socketManager.useScout(x, y),
      onFlag: (x, y) => socketManager.useFlag(x, y),
      onLog: addGameLog,
      onTurnChange: updateTurnIndicator,
      onLivesChange: (selfLives, oppLives) => {
        updateLives(elements.selfLives, selfLives);
        updateLives(elements.opponentLives, oppLives);
      },
      onAbilityUpdate: updateAbilities,
      onAbilityModeChange: updateAbilitySelection,
    }
  );
  
  // Передаём данные расстановки
  if (placementManager) {
    gameManager.setMyBoard(placementManager.getPlacementData());
  }
  
  gameManager.initialize();
  updateTurnIndicator(data.yourTurn);
}

function updateLives(container: HTMLElement, count: number): void {
  container.innerHTML = '';
  for (let i = 0; i < GAME_CONSTANTS.MAX_LIVES; i++) {
    const life = document.createElement('div');
    life.className = `life${i >= count ? ' lost' : ''}`;
    container.appendChild(life);
  }
}

function updateTurnIndicator(isMyTurn: boolean): void {
  elements.turnIndicator.textContent = isMyTurn ? 'Ваш ход' : 'Ход противника';
  elements.turnIndicator.className = `turn-indicator ${isMyTurn ? 'your-turn' : 'opponent-turn'}`;
}

function updateAbilities(scanCooldown: number, scoutCount: number, scoutCooldown: number): void {
  const scanCdEl = elements.btnScan.querySelector('.ability-cooldown')!;
  const scoutCountEl = elements.btnScout.querySelector('.ability-count')!;
  const scoutCdEl = elements.btnScout.querySelector('.ability-cooldown')!;
  
  elements.btnScan.disabled = scanCooldown > 0;
  scanCdEl.textContent = scanCooldown > 0 ? `(${scanCooldown} ходов)` : '';
  
  elements.btnScout.disabled = scoutCount <= 0 || scoutCooldown > 0;
  scoutCountEl.textContent = String(scoutCount);
  scoutCdEl.textContent = scoutCooldown > 0 ? `(${scoutCooldown} ходов)` : '';
}

function updateAbilitySelection(mode: AbilityMode): void {
  elements.btnScan.classList.toggle('active', mode === 'scan');
  elements.btnScout.classList.toggle('active', mode === 'scout');
  elements.btnFlag.classList.toggle('active', mode === 'flag');
}

function addGameLog(message: string, type: 'hit' | 'miss' | 'mine' | 'sunk' | 'info' = 'info'): void {
  const entry = document.createElement('div');
  entry.className = `log-entry log-${type}`;
  entry.textContent = message;
  elements.gameLog.insertBefore(entry, elements.gameLog.firstChild);
  
  // Ограничиваем количество записей
  while (elements.gameLog.children.length > 50) {
    elements.gameLog.removeChild(elements.gameLog.lastChild!);
  }
}

function showGameOver(data: GameOverPayload): void {
  showScreen('gameover');
  
  const isWinner = data.winner === currentPlayerId;
  
  elements.gameoverTitle.textContent = isWinner ? 'ПОБЕДА!' : 'ПОРАЖЕНИЕ';
  elements.gameoverTitle.className = isWinner ? 'victory' : 'defeat';
  
  const reasons: Record<string, string> = {
    ships_destroyed: 'Все корабли уничтожены',
    lives_depleted: 'Закончились жизни',
    disconnect: 'Противник отключился',
    timeout: 'Время вышло',
  };
  
  elements.gameoverMessage.textContent = reasons[data.reason] || '';
  
  elements.gameoverStats.innerHTML = `
    <div class="stat-item">
      <span class="stat-label">Всего ходов:</span>
      <span class="stat-value">${data.stats.totalTurns}</span>
    </div>
    <div class="stat-item">
      <span class="stat-label">Потоплено кораблей (вы):</span>
      <span class="stat-value">${data.stats.shipsDestroyed[0]}</span>
    </div>
    <div class="stat-item">
      <span class="stat-label">Потоплено кораблей (противник):</span>
      <span class="stat-value">${data.stats.shipsDestroyed[1]}</span>
    </div>
    <div class="stat-item">
      <span class="stat-label">Мин активировано:</span>
      <span class="stat-value">${data.stats.minesTriggered[0]} / ${data.stats.minesTriggered[1]}</span>
    </div>
  `;
}

// Инициализация таймера
setInterval(() => {
  if (gameManager) {
    const time = gameManager.getGameTime();
    const minutes = Math.floor(time / 60);
    const seconds = time % 60;
    elements.gameTimer.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
}, 1000);

const initialVolume = Number(elements.volumeSlider.value) / 100;
setVolume(initialVolume);
updateAudioUI();
alignAudioControlsToAbilities();

window.addEventListener('resize', () => {
  alignAudioControlsToAbilities();
});

console.log('Морской Сапёр загружен!');
