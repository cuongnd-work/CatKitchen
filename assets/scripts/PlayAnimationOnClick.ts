import { _decorator, Component, Button, Animation, AnimationClip } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('PlaySingleClip')
export class PlaySingleClip extends Component {

    @property(Button)
    button: Button = null!;

    @property(Animation)
    animationComp: Animation = null!;

    @property(AnimationClip)
    clip: AnimationClip = null!;

    start() {
        this.button.node.on(Button.EventType.CLICK, this.onClick, this);
    }

    onClick() {
        if (!this.animationComp || !this.clip) return;

        this.animationComp.play(this.clip.name);
    }
}
