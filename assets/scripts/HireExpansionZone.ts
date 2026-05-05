import { _decorator, Camera, Node, tween } from 'cc';
import { MoneyPaymentZone } from './MoneyPaymentZone';
import { CameraFollow } from './CameraFollow';
import { OrientationCameraOrthoAdjuster } from './OrientationCameraOrthoAdjuster';

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

    @property({ type: Camera, tooltip: 'Orthographic camera zoomed during the focus cutscene. Used only if orthoAdjuster is not assigned.' })
    public focusCamera: Camera | null = null;

    @property({ type: OrientationCameraOrthoAdjuster, tooltip: 'Optional ortho adjuster used to resolve the orthographic camera for the cutscene zoom.' })
    public orthoAdjuster: OrientationCameraOrthoAdjuster | null = null;

    @property({ tooltip: 'Zoom in by this ratio during the focus cutscene. 0.2 = reduce ortho height by 20%.', min: 0, max: 0.95 })
    public focusZoomRatio = 0.2;

    @property({ tooltip: 'Seconds used to tween orthographic zoom in/out.', min: 0 })
    public focusZoomDuration = 0.2;

    @property({ type: Node, tooltip: 'Node activated when this payment succeeds (optional).' })
    public nodeToActivateOnComplete2: Node | null = null;

    @property({ type: Node, tooltip: 'Node activated when this payment succeeds (optional).' })
    public nodeToActivateOn1: Node | null = null;

    @property({ type: Node, tooltip: 'Node activated when this payment succeeds (optional).' })
    public nodeToActivateOn2: Node | null = null;

    @property({ type: Node, tooltip: 'Node activated when this payment succeeds (optional).' })
    public nodeToActivateOn3: Node | null = null;

    private _originalCameraTarget: Node | null = null;
    private _cameraFocusActive = false;
    private _pendingDisableAfterFocus = false;
    private _originalOrthoHeight = 0;
    private _zoomActive = false;

    protected onPaymentSatisfied (_amount: number): void {
        if (this.expansionRoot) {
            this.expansionRoot.active = true;
        }

        console.log(`[HireExpansionZone] ${this.node.name}: ${this.expansionMessage}`);
        this.nodeToActivateOnComplete2.active = true;
        this.nodeToActivateOn1.active = false;
        this.nodeToActivateOn2.active = false;
        this.nodeToActivateOn3.active = false;
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
        this.zoomInFocusCamera();

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
        this.restoreFocusCameraZoom();
        this._originalCameraTarget = null;
        this._cameraFocusActive = false;
        if (this._pendingDisableAfterFocus) {
            this._pendingDisableAfterFocus = false;
            super.disablePaymentZone();
        }
    }

    private zoomInFocusCamera (): void {
        const camera = this.resolveFocusCamera();
        if (!camera) {
            return;
        }

        this._originalOrthoHeight = camera.orthoHeight;
        const ratio = Math.max(0, Math.min(0.95, this.focusZoomRatio));
        const targetHeight = this._originalOrthoHeight * (1 - ratio);
        this._zoomActive = true;

        tween(camera)
            .stop()
            .to(Math.max(0.01, this.focusZoomDuration), { orthoHeight: targetHeight })
            .start();
    }

    private restoreFocusCameraZoom (): void {
        const camera = this.resolveFocusCamera();
        if (!camera || !this._zoomActive) {
            return;
        }

        tween(camera)
            .stop()
            .to(Math.max(0.01, this.focusZoomDuration), { orthoHeight: this._originalOrthoHeight })
            .call(() => {
                this._zoomActive = false;
            })
            .start();
    }

    private resolveFocusCamera (): Camera | null {
        const orthoCamera = this.orthoAdjuster?.targetCamera ?? null;
        if (orthoCamera && orthoCamera.isValid) {
            return orthoCamera;
        }

        if (this.focusCamera && this.focusCamera.isValid) {
            return this.focusCamera;
        }

        this.focusCamera = null;
        return this.focusCamera;
    }
}
