import {
    _decorator,
    Button,
    Component,
    Sprite,
    Node,
    Vec3,
    AudioSource,
    AudioClip,
    Prefab
} from 'cc';
import { zoom_button } from "db://assets/scripts/zoom_button";
import { ChefBehavior } from "./ChefBehavior";
import super_html_script from "db://assets/plugins/playable-foundation/super-html/super_html_script";
import {CurrencyView} from "db://assets/scripts/CurrencyView";
import {object_pool_manager} from "db://assets/plugins/playable-foundation/game-foundation/object_pool";

const { ccclass, property } = _decorator;

@ccclass('TusButton')
export class TusButton extends Component {

    @property(Button)
    public buttonSpeed: Button = null!;

    @property(Button)
    public buttonWorker: Button = null!;

    @property(Node)
    public hand: Node = null!;

    @property(ChefBehavior)
    public chefBehavior: ChefBehavior = null!;

    @property(Node)
    public handTarget: Node = null!;

    @property(Node)
    public end: Node = null!;

    @property(Prefab)
    flash: Prefab = null!;

    @property(Node)
    public flashParent: Node = null!;

    @property(zoom_button)
    public zoom_button1: zoom_button = null!;

    @property(zoom_button)
    public zoom_button2: zoom_button = null!;

    /* ================= SOUND ================= */

    @property(AudioSource)
    public audioSource: AudioSource = null!;

    @property(AudioClip)
    public clickSound: AudioClip = null!;

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
        if(!CurrencyView.instance.trySubtractCurrency(100)) return;

        this.playClickSound();
        object_pool_manager.instance.Spawn(this.flash, new Vec3(0,0,0), null, this.flashParent);

        this._count++;

        this.chefBehavior.currentSpeed += 2.5;

        if (this._count >= this.countMax) {

            this.hand.position = this.handTarget.position;

            this.zoom_button1.stopZoomAndReset();
            this.zoom_button2.startZoom();

            this.setSpriteAlpha(this.zoom_button1.node, 100);
            this.setSpriteAlpha(this.zoom_button2.node, 255);

            this.setButtonInteractable(this.buttonSpeed, false);
            this.setButtonInteractable(this.buttonWorker, true);
        }
    }

    public ButtonWorkerClicker (): void {
        this.playClickSound();

        this.setButtonInteractable(this.buttonSpeed, false);

        super_html_script.on_click_game_end();
        super_html_script.on_click_download();

        this.end.active = true;
    }

    /* ================= SOUND ================= */

    private playClickSound () {
        if (!this.audioSource || !this.clickSound) return;

        this.audioSource.playOneShot(this.clickSound, 1);
    }

    /* ================= UTILS ================= */

    private setSpriteAlpha (node: Node, alpha: number) {
        const sprite = node.getComponentInChildren(Sprite);
        if (!sprite) return;

        const c = sprite.color.clone();
        c.a = alpha;
        sprite.color = c;
    }

    private setButtonInteractable (btn: Button, enable: boolean) {
        if (!btn) return;
        btn.interactable = enable;
    }
}
