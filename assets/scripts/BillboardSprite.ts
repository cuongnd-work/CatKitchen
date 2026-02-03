import { _decorator, Camera, Component, Node, Quat, Vec3, director, warn } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('BillboardSprite')
export class BillboardSprite extends Component {
    @property({ type: Node, tooltip: 'Camera node this sprite should face. Defaults to the first scene camera.' })
    public cameraNode: Node | null = null;

    @property({ tooltip: 'Keep the sprite upright by constraining rotation to Y axis.' })
    public lockYAxis = true;

    private _cameraPos = new Vec3();
    private _nodePos = new Vec3();
    private _direction = new Vec3(0, 0, 1);
    private _rotation = new Quat();

    protected onEnable(): void {
        if (!this.cameraNode) {
            this.cameraNode = this.findSceneCamera();
        }

        if (!this.cameraNode) {
            warn('[BillboardSprite] Assign cameraNode so the sprite can face the camera.');
        }
    }

    protected update(): void {
        if (!this.cameraNode || !this.cameraNode.isValid) {
            return;
        }

        this.node.getWorldPosition(this._nodePos);
        this.cameraNode.getWorldPosition(this._cameraPos);
        Vec3.subtract(this._direction, this._cameraPos, this._nodePos);

        if (this.lockYAxis) {
            this._direction.y = 0;
            if (this._direction.lengthSqr() < 0.0001) {
                return;
            }
        } else if (this._direction.lengthSqr() < 0.000001) {
            return;
        }

        this._direction.normalize();
        Quat.fromViewUp(this._rotation, this._direction, Vec3.UP);
        this.node.setWorldRotation(this._rotation);
    }

    private findSceneCamera(): Node | null {
        const scene = director.getScene();
        if (!scene) {
            return null;
        }

        const cameras = scene.getComponentsInChildren(Camera);
        return cameras.length > 0 ? cameras[0].node : null;
    }
}
