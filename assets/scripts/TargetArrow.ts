import { _decorator, Component, Node, Vec3 } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('TargetArrow')
export class TargetArrow extends Component {
    @property({ type: Node, tooltip: 'Character (or origin) node the arrow should follow.' })
    public character: Node | null = null;

    @property({ type: Node, tooltip: 'World node the arrow should point toward.' })
    public target: Node | null = null;

    @property({ type: Vec3, tooltip: 'World offset applied relative to the character position.' })
    public characterOffset: Vec3 = new Vec3();

    @property({ tooltip: 'Distance from the character while orbiting around them (0 = stay on the offset).' })
    public orbitRadius = 0.5;

    @property({ tooltip: 'Hide the arrow when closer than this distance (0 = always visible).' })
    public hideDistance = 0;

    private _originPos: Vec3 = new Vec3();
    private _arrowWorldPos: Vec3 = new Vec3();
    private _targetWorldPos: Vec3 = new Vec3();

    update (): void {
        const arrowNode = this.node;
        const target = this.target;
        if (!target || !target.isValid) {
            arrowNode.active = false;
            return;
        }

        const origin = this.character ?? arrowNode.parent ?? null;
        if (origin && origin.isValid) {
            origin.getWorldPosition(this._originPos);
        } else {
            arrowNode.getWorldPosition(this._originPos);
        }

        Vec3.add(this._arrowWorldPos, this._originPos, this.characterOffset);
        target.getWorldPosition(this._targetWorldPos);

        const dir = new Vec3(
            this._targetWorldPos.x - this._arrowWorldPos.x,
            0,
            this._targetWorldPos.z - this._arrowWorldPos.z,
        );
        const dirLength = dir.length();
        if (dirLength < 0.001) {
            arrowNode.active = false;
            return;
        }

        if (this.hideDistance > 0 && dirLength <= this.hideDistance) {
            arrowNode.active = false;
            return;
        }

        dir.normalize();
        if (this.orbitRadius > 0) {
            this._arrowWorldPos.x = this._originPos.x + dir.x * this.orbitRadius + this.characterOffset.x;
            this._arrowWorldPos.y = this._originPos.y + this.characterOffset.y;
            this._arrowWorldPos.z = this._originPos.z + dir.z * this.orbitRadius + this.characterOffset.z;
        } else {
            this._arrowWorldPos.x = this._originPos.x + this.characterOffset.x;
            this._arrowWorldPos.y = this._originPos.y + this.characterOffset.y;
            this._arrowWorldPos.z = this._originPos.z + this.characterOffset.z;
        }

        arrowNode.setWorldPosition(this._arrowWorldPos);
        arrowNode.active = true;
        this._targetWorldPos.y = this._arrowWorldPos.y;
        arrowNode.lookAt(this._targetWorldPos);
    }
}
