import {_decorator, Color, Component, Sprite, Tween} from 'cc';

const {ccclass, property} = _decorator;

@ccclass('time_manager')
export class time_manager extends Component {
    @property(Sprite)
    private sprite!: Sprite;
    private originalColor!: Color;

    start() {
        if(this.sprite) this.originalColor = this.sprite.color.clone();
        this.playFadeLoop();
    }

    private tween: Tween;

    playFadeLoop() {
        const startColor = this.originalColor.clone();
        const midColor = this.originalColor.clone();
        const endColor = this.originalColor.clone();

        startColor.a = 0;
        midColor.a = 150;

        this.sprite.color = startColor;

        this.tween = new Tween(this.sprite)
            .to(0.5, {color: midColor})
            .to(0.5, {color: startColor})
            .union()
            .repeatForever()
            .start();
    }
}
