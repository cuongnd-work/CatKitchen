import { _decorator, Component, Node, Vec3, warn } from 'cc';
import { CameraFollow } from 'db://assets/scripts/CameraFollow';

const { ccclass, property } = _decorator;

@ccclass('CameraFollowOverride')
export class CameraFollowOverride extends Component {
    @property({ type: CameraFollow, tooltip: 'CameraFollow component that should be overridden when this node enables.' })
    public cameraFollow: CameraFollow | null = null;

    @property({ type: Node, tooltip: 'Target node CameraFollow should follow while this component is enabled.' })
    public overrideTarget: Node | null = null;

    @property({ type: Vec3, tooltip: 'Offset applied while this component is enabled.' })
    public overrideOffset: Vec3 = new Vec3();

    @property({ tooltip: 'Also override followSpeed while this component is enabled.' })
    public overrideFollowSpeedEnabled = false;

    @property({ tooltip: 'Follow speed applied if overrideFollowSpeedEnabled is true.', min: 0, step: 0.1, slide: true })
    public overrideFollowSpeedValue = 5;

    private _previousTarget: Node | null = null;
    private _previousOffset: Vec3 | null = null;
    private _previousFollowSpeed: number | null = null;
    private _applied = false;

    protected onLoad(): void {
        if (!this.cameraFollow) {
            this.cameraFollow = this.getComponent(CameraFollow);
        }
    }

    protected onEnable(): void {
        if (!this.cameraFollow) {
            warn('[CameraFollowOverride] Assign a CameraFollow component.');
            return;
        }

        this._previousTarget = this.cameraFollow.target;
        this._previousOffset = this.cameraFollow.offset.clone();
        this._previousFollowSpeed = this.cameraFollow.followSpeed;

        if (this.overrideTarget) {
            this.cameraFollow.target = this.overrideTarget;
        }

        this.cameraFollow.offset.set(this.overrideOffset);
        if (this.overrideFollowSpeedEnabled) {
            this.cameraFollow.followSpeed = this.overrideFollowSpeedValue;
        }
        this._applied = true;
    }

    protected onDisable(): void {
        if (!this.cameraFollow || !this._applied) {
            return;
        }

        this.cameraFollow.target = this._previousTarget;
        if (this._previousOffset) {
            this.cameraFollow.offset.set(this._previousOffset);
        }
        if (this.overrideFollowSpeedEnabled && this._previousFollowSpeed !== null) {
            this.cameraFollow.followSpeed = this._previousFollowSpeed;
        }

        this._applied = false;
    }
}
