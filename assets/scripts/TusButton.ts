import { _decorator, Button, Component, Sprite, Node, Animation } from 'cc';
import {zoom_button} from "db://assets/scripts/zoom_button";
const { ccclass, property } = _decorator;

@ccclass('TusButton')
export class TusButton extends Component {

    @property(Button)
    public buttonSpeed: Button = null!;

    @property(Button)
    public buttonWorker: Button = null!;

    @property(Node)
    public hand: Node = null!;

    @property(Node)
    public handTarget: Node = null!;

    @property(zoom_button)
    public zoom_button1: zoom_button = null!;

    @property(zoom_button)
    public zoom_button2: zoom_button = null!;

    @property(Animation)
    public animation: Animation = null!;

    @property({ tooltip: 'Số lần click cần thiết' })
    public countMax: number = 8;

    private _count: number = 0;

    /* ================= LIFE ================= */

    start () {
        this.buttonSpeed.node.on(Button.EventType.CLICK, this.ButtonSpeedClicker, this);
        this.buttonWorker.node.on(Button.EventType.CLICK, this.ButtonWorkerClicker, this);

        this.zoom_button1.startZoom();
        this.zoom_button2.stopZoomAndReset();

        this.setButtonInteractable(this.buttonSpeed, true);
        this.setButtonInteractable(this.buttonWorker, false);
    }

    /* ================= CLICK ================= */

    public ButtonSpeedClicker (): void {
        this._count++;

        if (this._count >= this.countMax) {

            this.hand.position = this.handTarget.position;

            // zoom
            this.zoom_button1.stopZoomAndReset();
            this.zoom_button2.startZoom();

            // sprite alpha
            this.setSpriteAlpha(this.zoom_button1.node, 100);
            this.setSpriteAlpha(this.zoom_button2.node, 255);

            // button state
            this.setButtonInteractable(this.buttonSpeed, false);
            this.setButtonInteractable(this.buttonWorker, true);
        }
    }

    /* ================= UTILS ================= */

    private setSpriteAlpha (node: Node, alpha: number) {
        const sprite = node.getComponentInChildren(Sprite);
        if (!sprite) return;

        const c = sprite.color.clone(); // ⭐ BẮT BUỘC
        c.a = alpha;
        sprite.color = c;
    }

    public ButtonWorkerClicker (): void {
        this.setButtonInteractable(this.buttonSpeed, false);

        this.animation.play();
    }

    /* ================= UTILS ================= */

    private setButtonInteractable (btn: Button, enable: boolean) {
        if (!btn) return;
        btn.interactable = enable;
    }

}
