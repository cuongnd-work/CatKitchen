import { _decorator, Camera, Component, find, Node, Vec3 } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('BillboardToCamera')
export class BillboardToCamera extends Component {
    @property(Camera)
    public targetCamera: Camera | null = null;

    @property
    public yawOnly = false;

    private _worldPosition = new Vec3();
    private _cameraPosition = new Vec3();

    lateUpdate (): void {
        let camera = this.resolveCamera();
        if (!camera || !this.node?.isValid) {
            return;
        }

        this.node.getWorldPosition(this._worldPosition);
        camera.node.getWorldPosition(this._cameraPosition);

        if (this.yawOnly) {
            this._cameraPosition.y = this._worldPosition.y;
        }

        this.node.lookAt(this._cameraPosition);
    }

    private resolveCamera (): Camera | null {
        if (this.targetCamera?.isValid) {
            return this.targetCamera;
        }

        let mainCameraNode = find('Main Camera');
        this.targetCamera = mainCameraNode?.getComponent(Camera) ?? null;
        return this.targetCamera;
    }
}
