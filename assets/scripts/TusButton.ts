import {
    _decorator,
    Button,
    Component,
    Sprite,
    Node,
    Vec3,
    AudioSource,
    AudioClip,
    Prefab,
    Animation
} from 'cc';
import { zoom_button } from "db://assets/scripts/zoom_button";
import { ChefBehavior } from "./ChefBehavior";
import super_html_script from "db://assets/plugins/playable-foundation/super-html/super_html_script";
import {CurrencyView} from "db://assets/scripts/CurrencyView";
import {object_pool_manager} from "db://assets/plugins/playable-foundation/game-foundation/object_pool";
import {super_html_playable} from "db://assets/plugins/playable-foundation/super-html/super_html_playable";

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

    @property(ChefBehavior)
    public chefWorkerBehavior: ChefBehavior = null!;

    @property(Node)
    public handTarget: Node = null!;

    @property(Node)
    public handTarget2: Node = null!;

    @property(Node)
    public end: Node = null!;

    @property(Animation)
    public endAnim: Animation = null!;

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

    @property({ tooltip: 'Số lần click cần thiết worker' })
    public countWorkerMax: number = 3;

    private readonly speedCostAmount: number = 100;
    private readonly workerCostAmount: number = 250;

    private isB1Interact: boolean = true;
    private isB2Interact: boolean = false;

    private readonly currencyChangeHandler = () => {
        this.refreshButtonAvailability();
    };

    /* ================= LIFE ================= */

    start () {
        this.buttonSpeed.node.on(Button.EventType.CLICK, this.ButtonSpeedClicker, this);
        this.buttonWorker.node.on(Button.EventType.CLICK, this.ButtonWorkerClicker, this);

        this.zoom_button1.startZoom();
        this.zoom_button2.stopZoomAndReset();

        this.setButtonInteractable(this.buttonSpeed, true);
        this.setButtonInteractable(this.buttonWorker, false);

        CurrencyView.onCurrencyChanged(this.currencyChangeHandler, this);
        this.refreshButtonAvailability();
    }

    public isCompleted: boolean = false;

    /* ================= CLICK ================= */

    public ButtonSpeedClicker (): void {
        if(this.isCompleted) return;

        if(!CurrencyView.instance.trySubtractCurrency(this.speedCostAmount)) return;

        this.playClickSound();
        object_pool_manager.instance.Spawn(this.flash, new Vec3(0,0,0), null, this.flashParent);

        this._count++;

        if(this.isWorkerActive)
        {
            this.chefWorkerBehavior.currentSpeed += 3;

            if (this._count >= this.countMax + this.countWorkerMax)
            {
                this.endAnim?.play();
                this.isCompleted = true;
                // this.end.active = true;
            }

            return;
        }

        this.chefBehavior.currentSpeed += 3;

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

    private isWorkerActive: boolean = false;

    @property(Node)
    public worker: Node = null;

    public ButtonWorkerClicker (): void {
        if(!CurrencyView.instance.trySubtractCurrency(this.workerCostAmount)) return;

        this.playClickSound();

        this.setButtonInteractable(this.buttonSpeed, false);

        this.worker.active = true;

        this.zoom_button2.stopZoomAndReset();
        this.zoom_button1.startZoom();

        this.setSpriteAlpha(this.zoom_button2.node, 100);
        this.setSpriteAlpha(this.zoom_button1.node, 255);

        this.setButtonInteractable(this.buttonSpeed, true);
        this.setButtonInteractable(this.buttonWorker, false);

        this.hand.position = this.handTarget2.position;

        this.isWorkerActive = true;
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

    private refreshButtonAvailability () {
        const currencyView = CurrencyView.instance;
        const canAffordSpeed = currencyView ? currencyView.canAfford(this.speedCostAmount) : true;
        const canAffordWorker = currencyView ? currencyView.canAfford(this.workerCostAmount) : true;

        this.applyButtonState(this.buttonSpeed, this.isB1Interact && canAffordSpeed, canAffordSpeed);
        this.applyButtonState(this.buttonWorker, this.isB2Interact && canAffordWorker, canAffordWorker);
    }

    private applyButtonState (btn: Button, enable: boolean, canAfford: boolean) {
        if (!btn) return;
        btn.interactable = enable;
        if(!enable) {
            this.setSpriteAlpha(btn.node.parent, 100);
            return;
        }
        this.setSpriteAlpha(btn.node.parent, canAfford ? 255 : 100);
    }

    private setButtonInteractable (btn: Button, enable: boolean) {
        if (!btn) return;

        if (btn === this.buttonSpeed) {
            this.isB1Interact = enable;
        } else if (btn === this.buttonWorker) {
            this.isB2Interact = enable;
        } else {
            btn.interactable = enable;
        }

        this.refreshButtonAvailability();
    }

    onDestroy () {
        CurrencyView.offCurrencyChanged(this.currencyChangeHandler, this);
    }
}
