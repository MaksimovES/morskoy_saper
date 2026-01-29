/**
 * Менеджер звуков с реалистичными эффектами через Web Audio API
 */

type SoundType = 'hit' | 'miss' | 'mine' | 'sunk' | 'scan' | 'scout' | 'turn' | 'gameStart' | 'gameOver' | 'click';

class SoundManagerClass {
  private audioContext: AudioContext | null = null;
  private enabled: boolean = true;
  private volume: number = 0.5;
  private masterGain: GainNode | null = null;
  
  /**
   * Инициализация AudioContext (нужно вызвать после взаимодействия пользователя)
   */
  init(): void {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.value = this.volume;
      this.masterGain.connect(this.audioContext.destination);
    }
  }
  
  /**
   * Включить/выключить звуки
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
  
  /**
   * Установить громкость (0-1)
   */
  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.masterGain) {
      this.masterGain.gain.value = this.volume;
    }
  }
  
  private getDestination(): AudioNode {
    return this.masterGain || this.audioContext!.destination;
  }
  
  /**
   * Воспроизвести звук
   */
  play(type: SoundType): void {
    if (!this.enabled) return;
    
    if (!this.audioContext) {
      this.init();
    }
    
    if (!this.audioContext) return;
    
    // Возобновляем контекст если он был приостановлен
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    
    switch (type) {
      case 'hit':
        this.playHit();
        break;
      case 'miss':
        this.playMiss();
        break;
      case 'mine':
        this.playMineExplosion();
        break;
      case 'sunk':
        this.playSunk();
        break;
      case 'scan':
        this.playScan();
        break;
      case 'scout':
        this.playScout();
        break;
      case 'turn':
        this.playTurn();
        break;
      case 'gameStart':
        this.playGameStart();
        break;
      case 'gameOver':
        this.playGameOver();
        break;
      case 'click':
        this.playClick();
        break;
    }
  }
  
  /**
   * Создание шума
   */
  private createNoise(duration: number): AudioBufferSourceNode {
    const ctx = this.audioContext!;
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    return noise;
  }
  
  /**
   * Попадание - металлический удар по кораблю
   */
  private playHit(): void {
    const ctx = this.audioContext!;
    const now = ctx.currentTime;
    
    // Металлический удар
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    
    filter.type = 'bandpass';
    filter.frequency.value = 800;
    filter.Q.value = 2;
    
    osc1.type = 'square';
    osc1.frequency.setValueAtTime(300, now);
    osc1.frequency.exponentialRampToValueAtTime(150, now + 0.1);
    
    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(600, now);
    osc2.frequency.exponentialRampToValueAtTime(200, now + 0.08);
    
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    
    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.getDestination());
    
    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.2);
    osc2.stop(now + 0.2);
    
    // Добавляем шум удара
    const noise = this.createNoise(0.1);
    const noiseGain = ctx.createGain();
    const noiseFilter = ctx.createBiquadFilter();
    
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.value = 1000;
    
    noiseGain.gain.setValueAtTime(0.3, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.getDestination());
    
    noise.start(now);
    noise.stop(now + 0.1);
  }
  
  /**
   * Промах - всплеск воды
   */
  private playMiss(): void {
    const ctx = this.audioContext!;
    const now = ctx.currentTime;
    
    // Основной всплеск
    const noise = this.createNoise(0.4);
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1200, now);
    filter.frequency.exponentialRampToValueAtTime(400, now + 0.15);
    filter.Q.value = 1;
    
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.15, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.getDestination());
    
    noise.start(now);
    noise.stop(now + 0.4);
    
    // Низкочастотный "бульк"
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, now + 0.02);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.15);
    
    oscGain.gain.setValueAtTime(0.3, now + 0.02);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    
    osc.connect(oscGain);
    oscGain.connect(this.getDestination());
    
    osc.start(now + 0.02);
    osc.stop(now + 0.2);
  }
  
  /**
   * Взрыв мины - мощный взрыв
   */
  private playMineExplosion(): void {
    const ctx = this.audioContext!;
    const now = ctx.currentTime;
    
    // Начальный удар
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(100, now);
    osc1.frequency.exponentialRampToValueAtTime(20, now + 0.5);
    
    gain1.gain.setValueAtTime(0.8, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    
    osc1.connect(gain1);
    gain1.connect(this.getDestination());
    
    osc1.start(now);
    osc1.stop(now + 0.6);
    
    // Шум взрыва
    const noise = this.createNoise(0.8);
    const noiseFilter = ctx.createBiquadFilter();
    const noiseGain = ctx.createGain();
    
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.setValueAtTime(3000, now);
    noiseFilter.frequency.exponentialRampToValueAtTime(200, now + 0.5);
    
    noiseGain.gain.setValueAtTime(0.7, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.getDestination());
    
    noise.start(now);
    noise.stop(now + 0.8);
    
    // Вторичные взрывы (обломки)
    for (let i = 0; i < 3; i++) {
      const delay = 0.1 + i * 0.1;
      const subNoise = this.createNoise(0.3);
      const subFilter = ctx.createBiquadFilter();
      const subGain = ctx.createGain();
      
      subFilter.type = 'bandpass';
      subFilter.frequency.value = 500 + i * 200;
      subFilter.Q.value = 1;
      
      subGain.gain.setValueAtTime(0, now + delay);
      subGain.gain.linearRampToValueAtTime(0.2 - i * 0.05, now + delay + 0.02);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.3);
      
      subNoise.connect(subFilter);
      subFilter.connect(subGain);
      subGain.connect(this.getDestination());
      
      subNoise.start(now + delay);
      subNoise.stop(now + delay + 0.3);
    }
  }
  
  /**
   * Потопление корабля - скрежет и пузыри
   */
  private playSunk(): void {
    const ctx = this.audioContext!;
    const now = ctx.currentTime;
    
    // Скрежет металла
    const noise = this.createNoise(1.0);
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(400, now);
    filter.frequency.exponentialRampToValueAtTime(150, now + 0.8);
    filter.Q.value = 5;
    
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.5);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
    
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.getDestination());
    
    noise.start(now);
    noise.stop(now + 1.0);
    
    // Низкий гул погружения
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(50, now + 1.2);
    
    oscGain.gain.setValueAtTime(0.4, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
    
    osc.connect(oscGain);
    oscGain.connect(this.getDestination());
    
    osc.start(now);
    osc.stop(now + 1.2);
    
    // Пузыри
    for (let i = 0; i < 8; i++) {
      const delay = 0.2 + Math.random() * 0.8;
      setTimeout(() => this.playBubble(), delay * 1000);
    }
  }
  
  private playBubble(): void {
    if (!this.audioContext) return;
    const ctx = this.audioContext;
    const now = ctx.currentTime;
    
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    const freq = 600 + Math.random() * 600;
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.8, now + 0.08);
    
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    
    osc.connect(gain);
    gain.connect(this.getDestination());
    
    osc.start(now);
    osc.stop(now + 0.1);
  }
  
  /**
   * Сканирование - радарный свип
   */
  private playScan(): void {
    const ctx = this.audioContext!;
    const now = ctx.currentTime;
    
    // Радарный пинг
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    
    filter.type = 'bandpass';
    filter.frequency.value = 1500;
    filter.Q.value = 10;
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(2000, now + 0.3);
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.6);
    
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.linearRampToValueAtTime(0.3, now + 0.3);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.getDestination());
    
    osc.start(now);
    osc.stop(now + 0.7);
    
    // Электронный шум
    const noise = this.createNoise(0.5);
    const noiseFilter = ctx.createBiquadFilter();
    const noiseGain = ctx.createGain();
    
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.value = 2000;
    
    noiseGain.gain.setValueAtTime(0.05, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.getDestination());
    
    noise.start(now);
    noise.stop(now + 0.5);
  }
  
  /**
   * Разведчик - сонар пинг
   */
  private playScout(): void {
    const ctx = this.audioContext!;
    const now = ctx.currentTime;
    
    // Сонарный пинг
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, now);
    
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    
    osc.connect(gain);
    gain.connect(this.getDestination());
    
    osc.start(now);
    osc.stop(now + 0.5);
    
    // Эхо
    const echo = ctx.createOscillator();
    const echoGain = ctx.createGain();
    
    echo.type = 'sine';
    echo.frequency.setValueAtTime(1200, now + 0.15);
    
    echoGain.gain.setValueAtTime(0.1, now + 0.15);
    echoGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    
    echo.connect(echoGain);
    echoGain.connect(this.getDestination());
    
    echo.start(now + 0.15);
    echo.stop(now + 0.5);
  }
  
  /**
   * Смена хода - сигнал готовности
   */
  private playTurn(): void {
    const ctx = this.audioContext!;
    const now = ctx.currentTime;
    
    // Два тона
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc1.type = 'sine';
    osc1.frequency.value = 523; // C5
    
    osc2.type = 'sine';
    osc2.frequency.value = 659; // E5
    
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.setValueAtTime(0.2, now + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.getDestination());
    
    osc1.start(now);
    osc1.stop(now + 0.15);
    
    osc2.start(now + 0.1);
    osc2.stop(now + 0.3);
  }
  
  /**
   * Начало игры - бодрая мелодия
   */
  private playGameStart(): void {
    const ctx = this.audioContext!;
    const now = ctx.currentTime;
    
    const notes = [
      { freq: 392, time: 0 },      // G4
      { freq: 523, time: 0.1 },    // C5
      { freq: 659, time: 0.2 },    // E5
      { freq: 784, time: 0.3 },    // G5
    ];
    
    notes.forEach(note => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.value = note.freq;
      
      gain.gain.setValueAtTime(0, now + note.time);
      gain.gain.linearRampToValueAtTime(0.25, now + note.time + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + note.time + 0.2);
      
      osc.connect(gain);
      gain.connect(this.getDestination());
      
      osc.start(now + note.time);
      osc.stop(now + note.time + 0.25);
    });
  }
  
  /**
   * Конец игры - финальный аккорд
   */
  private playGameOver(): void {
    const ctx = this.audioContext!;
    const now = ctx.currentTime;
    
    // Нисходящая последовательность
    const notes = [
      { freq: 523, time: 0 },      // C5
      { freq: 440, time: 0.2 },    // A4
      { freq: 349, time: 0.4 },    // F4
      { freq: 262, time: 0.6 },    // C4
    ];
    
    notes.forEach(note => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'triangle';
      osc.frequency.value = note.freq;
      
      gain.gain.setValueAtTime(0, now + note.time);
      gain.gain.linearRampToValueAtTime(0.3, now + note.time + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + note.time + 0.4);
      
      osc.connect(gain);
      gain.connect(this.getDestination());
      
      osc.start(now + note.time);
      osc.stop(now + note.time + 0.5);
    });
  }
  
  /**
   * Клик - короткий UI звук
   */
  private playClick(): void {
    const ctx = this.audioContext!;
    const now = ctx.currentTime;
    
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.value = 1000;
    
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    
    osc.connect(gain);
    gain.connect(this.getDestination());
    
    osc.start(now);
    osc.stop(now + 0.05);
  }
}

// Синглтон
export const SoundManager = new SoundManagerClass();
