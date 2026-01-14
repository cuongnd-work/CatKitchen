import { _decorator, Component, Node, Vec3 } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('CameraFollow')
export class CameraFollow extends Component {

    @property(Node)
    target: Node | null = null;

    @property
    followSpeed: number = 5;

    @property(Vec3)
    offset: Vec3 = new Vec3(0, 5, 10);

    private _currentPos: Vec3 = new Vec3();
    private _desiredPos: Vec3 = new Vec3();

    update(deltaTime: number) {
        if (!this.target) {
            return;
        }

        Vec3.add(this._desiredPos, this.target.worldPosition, this.offset);
        this.node.getWorldPosition(this._currentPos);
        Vec3.lerp(this._currentPos, this._currentPos, this._desiredPos, Math.min(1, deltaTime * this.followSpeed));
        this.node.setWorldPosition(this._currentPos);
    }
}
