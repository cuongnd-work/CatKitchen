import { _decorator, Component, Node, AudioSource, tween, Vec3 } from 'cc';
import { UI_Joystick } from 'db://assets/kylins_easy_controller/UI_Joystick';

const { ccclass, property } = _decorator;

declare global {
    interface Window {
        mraid?: {
            open?: (url?: string) => void;
        };
        openStore?: () => void;
    }
}

@ccclass('CutsceneManager')
export class CutsceneManager extends Component {
    private static _pendingStoreOpen = false;

    @property({ type: Node, tooltip: 'Machine node that appears when the cutscene starts.' })
    public machineNode: Node | null = null;

    @property({ type: Node, tooltip: 'Optional particle node toggled during the appearance beat.' })
    public particleNode: Node | null = null;

    @property({ type: Node, tooltip: 'Optional product node animated after the short freeze.' })
    public productNode: Node | null = null;

    @property({ tooltip: 'Seconds to hold the scene before the product reveal begins.', min: 0 })
    public freezeDuration = 1;

    @property({ tooltip: 'Seconds used by the machine appear tween.', min: 0 })
    public machineAppearDuration = 0.25;

    @property({ tooltip: 'Seconds used by the product reveal tween.', min: 0 })
    public productRevealDuration = 0.3;

    @property({ type: AudioSource, tooltip: 'Optional SFX played when the product appears.' })
    public productRevealAudio: AudioSource | null = null;

    private _isPlaying = false;
    private _controlLocked = false;
    private _machineOriginalScale: Vec3 = new Vec3(1, 1, 1);
    private _productOriginalScale: Vec3 = new Vec3(1, 1, 1);

    public playDrinkMachineUnlockCutscene (): void {
        if (this._isPlaying) {
            return;
        }

        this._isPlaying = true;
        this.disableUserControl();
        this.showMachine();

        this.unschedule(this.revealProduct);
        this.scheduleOnce(this.revealProduct, Math.max(0, this.freezeDuration));
    }

    public disableUserControl (): void {
        if (this._controlLocked) {
            return;
        }
        this._controlLocked = true;
        UI_Joystick.beginExternalInteraction();
    }

    public enableUserControl (): void {
        if (!this._controlLocked) {
            return;
        }
        this._controlLocked = false;
        UI_Joystick.endExternalInteraction();
    }

    public static consumePendingStoreOpen (): boolean {
        if (!this._pendingStoreOpen) {
            return false;
        }

        this._pendingStoreOpen = false;
        const globalWindow = window as Window | undefined;
        if (!globalWindow) {
            return false;
        }

        if (typeof globalWindow.openStore === 'function') {
            globalWindow.openStore();
            return true;
        }

        if (typeof globalWindow.mraid?.open === 'function') {
            globalWindow.mraid.open();
            return true;
        }

        return false;
    }

    protected onDisable (): void {
        this.unschedule(this.revealProduct);
        this.enableUserControl();
        this._isPlaying = false;
    }

    protected onDestroy (): void {
        this.unschedule(this.revealProduct);
        this.enableUserControl();
        this._isPlaying = false;
    }

    private showMachine (): void {
        const machine = this.machineNode;
        if (!machine) {
            return;
        }

        machine.active = true;
        machine.getScale(this._machineOriginalScale);
        machine.setScale(0, 0, 0);
        tween(machine)
            .to(Math.max(0.01, this.machineAppearDuration), { scale: this._machineOriginalScale })
            .start();

        if (this.particleNode) {
            this.particleNode.active = true;
        }
    }

    private revealProduct = (): void => {
        const product = this.productNode;
        if (!product) {
            this.finishCutscene();
            return;
        }

        product.active = true;
        product.getScale(this._productOriginalScale);
        product.setScale(0, 0, 0);
        this.playProductRevealAudio();
        tween(product)
            .to(Math.max(0.01, this.productRevealDuration), { scale: this._productOriginalScale })
            .call(() => {
                this.finishCutscene();
            })
            .start();
    };

    private finishCutscene (): void {
        this._isPlaying = false;
        this.enableUserControl();
        CutsceneManager._pendingStoreOpen = true;
    }

    private playProductRevealAudio (): void {
        if (!this.productRevealAudio) {
            return;
        }
        this.productRevealAudio.stop();
        this.productRevealAudio.play();
    }
}
