import { _decorator, Node } from 'cc';
import { MoneyPaymentZone } from './MoneyPaymentZone';
import { CameraFollow } from './CameraFollow';

const { ccclass, property } = _decorator;

@ccclass('HireExpansionZone')
export class HireExpansionZone extends MoneyPaymentZone {
    @property({ type: Node, tooltip: 'Area or building enabled when the expansion is purchased.' })
    public expansionRoot: Node | null = null;

    @property({ tooltip: 'Message logged when the expansion is purchased.' })
    public expansionMessage = 'Expansion unlocked!';

    @property({ type: CameraFollow, tooltip: 'Camera follow component to retarget when the expansion unlocks.' })
    public cameraFollow: CameraFollow | null = null;

    @property({ type: Node, tooltip: 'Point the camera should focus on to highlight this expansion.' })
    public cameraFocusTarget: Node | null = null;

    @property({ tooltip: 'Seconds to keep the camera focused on the expansion before returning to the character.' })
    public cameraFocusDuration = 1;

    private _originalCameraTarget: Node | null = null;
    private _cameraFocusActive = false;
    private _pendingDisableAfterFocus = false;

    protected onPaymentSatisfied (_amount: number): void {
        if (this.expansionRoot) {
            this.expansionRoot.active = true;
        }

        console.log(`[HireExpansionZone] ${this.node.name}: ${this.expansionMessage}`);
        this.focusCameraOnExpansion();
    }

    protected onDisable(): void {
        super.onDisable();
        if (this._cameraFocusActive && !this._pendingDisableAfterFocus) {
            this.unschedule(this.restoreCameraFollow);
            this.restoreCameraFollow();
        }
    }

    protected onDestroy(): void {
        this.unschedule(this.restoreCameraFollow);
        this.restoreCameraFollow();
    }

    protected disablePaymentZone (): void {
        if (this._cameraFocusActive) {
            this._pendingDisableAfterFocus = true;
            return;
        }
        super.disablePaymentZone();
    }

    private focusCameraOnExpansion(): void {
        const follow = this.cameraFollow;
        const focusTarget = this.cameraFocusTarget;
        if (!follow || !focusTarget) {
            return;
        }

        if (!this._originalCameraTarget) {
            this._originalCameraTarget = follow.target;
        }

        follow.target = focusTarget;

        this.unschedule(this.restoreCameraFollow);
        const waitDuration = Math.max(0, this.cameraFocusDuration);
        this.scheduleOnce(this.restoreCameraFollow, waitDuration);
        this._cameraFocusActive = true;
    }

    private restoreCameraFollow(): void {
        const follow = this.cameraFollow;
        if (!follow || !this._originalCameraTarget) {
            return;
        }

        const original = this._originalCameraTarget;
        follow.target = original;
        this._originalCameraTarget = null;
        this._cameraFocusActive = false;
        if (this._pendingDisableAfterFocus) {
            this._pendingDisableAfterFocus = false;
            super.disablePaymentZone();
        }
    }
}
