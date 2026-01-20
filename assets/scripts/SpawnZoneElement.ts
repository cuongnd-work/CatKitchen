import { _decorator, Component, Node, tween, Tween, TweenEasing, Vec3 } from 'cc';

const { ccclass } = _decorator;

@ccclass('SpawnZoneElement')
export class SpawnZoneElement extends Component {
    private _worldStart: Vec3 = new Vec3();
    private _localStart: Vec3 = new Vec3();
    private _localTarget: Vec3 = new Vec3();

    public moveTo(
        targetParent: Node,
        worldTarget: Vec3,
        duration: number,
        easing: TweenEasing,
        rotation?: Vec3,
        scale?: Vec3,
        onComplete?: () => void
    ): void {
        if (!targetParent) {
            return;
        }

        Tween.stopAllByTarget(this.node);

        this.node.getWorldPosition(this._worldStart);
        targetParent.inverseTransformPoint(this._localStart, this._worldStart);

        this.node.setParent(targetParent);
        this.node.setPosition(this._localStart);
        if (rotation) {
            this.node.setRotationFromEuler(rotation.x, rotation.y, rotation.z);
        }
        if (scale) {
            this.node.setScale(scale.x, scale.y, scale.z);
        }

        targetParent.inverseTransformPoint(this._localTarget, worldTarget);
        const localTarget = new Vec3(this._localTarget.x, this._localTarget.y, this._localTarget.z);

        tween(this.node)
            .to(Math.max(0, duration), { position: localTarget }, { easing })
            .call(() => {
                onComplete?.();
            })
            .start();
    }
}
