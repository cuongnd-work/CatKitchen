import { _decorator, Animation, Button, Component } from 'cc';
import super_html_script from "db://assets/plugins/playable-foundation/super-html/super_html_script";
const { ccclass, property } = _decorator;

@ccclass('buttonci')
export class buttonci extends Component {

    @property(Button)
    myButton: Button = null!;  // kéo Button vào Inspector

    @property(Animation)
    tusAnimation: Animation | null = null;

    start() {
        if (this.myButton) {
            this.myButton.node.on('click', this.onButtonClick, this);
        }

        let animation = this.resolveTusAnimation();
        if (animation) {
            animation.on(Animation.EventType.FINISHED, this.onTusAnimationFinished, this);
        }
    }

    onDestroy() {
        if (this.myButton) {
            this.myButton.node.off('click', this.onButtonClick, this);
        }

        let animation = this.resolveTusAnimation();
        if (animation) {
            animation.off(Animation.EventType.FINISHED, this.onTusAnimationFinished, this);
        }
    }

    onButtonClick() {
        super_html_script.on_click_game_end();
        super_html_script.on_click_download();
    }

    private onTusAnimationFinished() {
        console.log('Tus button complete');
    }

    private resolveTusAnimation(): Animation | null {
        return this.tusAnimation
            ?? this.myButton?.node.getComponent(Animation)
            ?? this.getComponent(Animation);
    }
}
