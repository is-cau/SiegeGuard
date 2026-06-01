// ╔══════════════════════════════════════════════════╗
// ║  UIManager — HUD & DOM Overlay Management      ║
// ╚══════════════════════════════════════════════════╝

import { GameManager } from './GameManager';
import { TowerType, TOWER_CONFIGS, GamePhase } from './constants';

export class UIManager {
  private gameManager: GameManager;

  // DOM elements
  private livesDisplay: HTMLElement;
  private goldDisplay: HTMLElement;
  private waveDisplay: HTMLElement;
  private scoreDisplay: HTMLElement;
  private waveBtn: HTMLButtonElement;
  private messageEl: HTMLElement;
  private towerButtons: NodeListOf<HTMLButtonElement>;

  private messageTimeout: number = 0;

  constructor(gameManager: GameManager) {
    this.gameManager = gameManager;

    this.livesDisplay = document.getElementById('lives-display')!;
    this.goldDisplay = document.getElementById('gold-display')!;
    this.waveDisplay = document.getElementById('wave-display')!;
    this.scoreDisplay = document.getElementById('score-display')!;
    this.waveBtn = document.getElementById('wave-btn') as HTMLButtonElement;
    this.messageEl = document.getElementById('message')!;
    this.towerButtons = document.querySelectorAll('#tower-panel button[data-tower]');

    this.setupEvents();
    this.updateAll();
  }

  private setupEvents(): void {
    // Tower selection buttons
    this.towerButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const towerType = btn.dataset.tower as TowerType;
        if (this.gameManager.state.phase !== GamePhase.Building) return;

        if (this.gameManager.selectedTowerType === towerType) {
          // Deselect
          this.gameManager.selectTower(null);
          this.updateTowerButtons();
          this.gameManager.mapManager.hideRangePreview();
          this.gameManager.mapManager.resetHighlights();
        } else {
          if (!this.gameManager.canAfford(towerType)) {
            this.showMessage('💰 金币不足！');
            return;
          }
          this.gameManager.selectTower(towerType);
          this.updateTowerButtons();
        }
      });
    });

    // Wave button
    this.waveBtn.addEventListener('click', () => {
      if (this.gameManager.state.phase === GamePhase.GameOver ||
          this.gameManager.state.phase === GamePhase.Victory) {
        this.gameManager.reset();
        this.updateAll();
        return;
      }
      if (this.gameManager.state.phase === GamePhase.Building) {
        this.gameManager.startWave();
        this.updateTowerButtons();
        this.updateWaveButton();
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (this.gameManager.state.phase !== GamePhase.Building) return;

      switch (e.key) {
        case '1': this.selectTowerByKey(TowerType.Arrow); break;
        case '2': this.selectTowerByKey(TowerType.Cannon); break;
        case '3': this.selectTowerByKey(TowerType.Ice); break;
        case '4': this.selectTowerByKey(TowerType.Lightning); break;
        case 'Escape':
          this.gameManager.selectTower(null);
          this.updateTowerButtons();
          this.gameManager.mapManager.hideRangePreview();
          this.gameManager.mapManager.resetHighlights();
          break;
        case ' ':
          e.preventDefault();
          if (this.gameManager.state.phase === GamePhase.Building) {
            this.gameManager.startWave();
            this.updateTowerButtons();
            this.updateWaveButton();
          }
          break;
      }
    });

    // Wire game manager callbacks
    this.gameManager.onStateChanged = (state) => {
      this.updateAll();
    };
    this.gameManager.onGoldChanged = (gold) => {
      this.goldDisplay.textContent = gold.toString();
      this.updateTowerButtons();
    };
    this.gameManager.onLivesChanged = (lives) => {
      this.livesDisplay.textContent = lives.toString();
    };
    this.gameManager.onMessage = (msg) => {
      this.showMessage(msg);
    };
  }

  private selectTowerByKey(type: TowerType): void {
    if (!this.gameManager.canAfford(type)) {
      this.showMessage('💰 金币不足！');
      return;
    }
    if (this.gameManager.selectedTowerType === type) {
      this.gameManager.selectTower(null);
    } else {
      this.gameManager.selectTower(type);
    }
    this.updateTowerButtons();
  }

  public updateAll(): void {
    this.livesDisplay.textContent = this.gameManager.state.lives.toString();
    this.goldDisplay.textContent = this.gameManager.state.gold.toString();
    this.waveDisplay.textContent = this.gameManager.state.wave.toString();
    this.scoreDisplay.textContent = this.gameManager.state.score.toString();
    this.updateTowerButtons();
    this.updateWaveButton();
  }

  public updateTowerButtons(): void {
    this.towerButtons.forEach(btn => {
      const towerType = btn.dataset.tower as TowerType;
      const isSelected = this.gameManager.selectedTowerType === towerType;
      const canAfford = this.gameManager.canAfford(towerType);
      const isBuilding = this.gameManager.state.phase === GamePhase.Building;

      btn.classList.toggle('selected', isSelected);
      btn.disabled = !isBuilding || (!isSelected && !canAfford);
    });
  }

  public updateWaveButton(): void {
    const phase = this.gameManager.state.phase;
    this.waveBtn.disabled = phase === GamePhase.Combat;

    switch (phase) {
      case GamePhase.Building:
        this.waveBtn.textContent = `⚔️ 开始第 ${this.gameManager.state.wave + 1} 波`;
        this.waveBtn.classList.remove('wave-active');
        break;
      case GamePhase.Combat:
        this.waveBtn.textContent = '⚔️ 战斗中...';
        this.waveBtn.classList.add('wave-active');
        break;
      case GamePhase.GameOver:
        this.waveBtn.textContent = '🔄 重新开始';
        this.waveBtn.classList.remove('wave-active');
        this.waveBtn.disabled = false;
        break;
      case GamePhase.Victory:
        this.waveBtn.textContent = '🎉 再来一局';
        this.waveBtn.classList.remove('wave-active');
        this.waveBtn.disabled = false;
        break;
    }
  }

  public showMessage(msg: string): void {
    if (this.messageTimeout) {
      clearTimeout(this.messageTimeout);
    }
    this.messageEl.textContent = msg;
    this.messageEl.classList.add('show');
    this.messageTimeout = window.setTimeout(() => {
      this.messageEl.classList.remove('show');
      this.messageTimeout = 0;
    }, 2500);
  }
}
