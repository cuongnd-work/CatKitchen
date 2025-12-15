import {_decorator, Animation, AnimationClip, Component, Node} from 'cc';

const {ccclass, property} = _decorator;

@ccclass('ClickPlayAnimation')
export class ClickPlayAnimation extends Component {

    @property(Animation)
    public anim: Animation | null = null;

    @property(AnimationClip)
    public clip: AnimationClip | null = null;

    @property(Node)
    private nodeUpdate : Node = null!;

    onEnable() {
        this.node.on(Node.EventType.TOUCH_END, this.onClick, this);
    }

    onDisable() {
        this.node.off(Node.EventType.TOUCH_END, this.onClick, this);
    }

    private isClick: boolean = false;

    private onClick() {
        if (this.isClick) return;
        this.isClick = true;

        if (!this.anim || !this.clip) {
            console.warn('Animation or Clip not assigned');
            return;
        }

        if(this.nodeUpdate){
            this.nodeUpdate.active = true;

            setTimeout(() => {
                this.anim.play(this.clip.name);
            }, 500);

            return;
        }

        this.anim.play(this.clip.name);
    }
}
