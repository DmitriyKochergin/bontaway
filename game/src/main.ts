import Phaser from 'phaser';
import { gameConfig } from './config';

window.addEventListener('load', () => {
    let container = document.getElementById('game-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'game-container';
        document.body.appendChild(container);
    }
    document.body.style.margin = '0';
    document.body.style.overflow = 'hidden';
    new Phaser.Game(gameConfig);
});

