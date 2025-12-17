import { _decorator, Component, Node, Vec3, Quat } from 'cc';
import { CatAnimationController } from './CatAnimationController';

const { ccclass, property } = _decorator;

enum ChefState {
    Doing,
    MoveWithBedo,
    MoveWithWalk,
}

@ccclass('ChefBehavior')
export class ChefBehavior extends Component {

    /* ================= TARGET ================= */

    @property(Node)
    pointA: Node = null!; // Node1

    @property(Node)
    pointB: Node = null!; // Node2

    /* ================= MOVE ================= */

    @property
    moveSpeed: number = 1.5;

    @property
    stopDistance: number = 0.2;

    /* ================= ROTATION ================= */

    @property
    rotationOffsetY: number = 180;

    /* ================= ANIM ================= */

    @property(CatAnimationController)
    animCtrl: CatAnimationController = null!;

    /* ================= INTERNAL ================= */

    private _state: ChefState = ChefState.Doing;
    private _currentTarget: Node = null!;
    private _groundY: number = 0;

    private _dir = new Vec3();
    private _move = new Vec3();
    private _targetPos = new Vec3();

    /* ================= LIFE ================= */

    start () {
        this._groundY = this.node.worldPosition.y;

        // BẮT ĐẦU TẠI NODE1
        this._currentTarget = this.pointA;
        this.enterDoing();
    }

    update (dt: number) {
        if (
            this._state === ChefState.MoveWithBedo ||
            this._state === ChefState.MoveWithWalk
        ) {
            this.move3D(dt);
        }
    }

    /* ================= STATE ================= */

    private enterDoing () {
        this._state = ChefState.Doing;
        this.animCtrl.doDoing();

        // sau khi Doing xong → đi sang Node2 bằng Bedo
        this.scheduleOnce(() => {
            this._currentTarget = this.pointB;
            this.enterMoveWithBedo();
        }, 1.0);
    }

    private enterMoveWithBedo () {
        this._state = ChefState.MoveWithBedo;
        this.animCtrl.doBedo();
    }

    private enterMoveWithWalk () {
        this._state = ChefState.MoveWithWalk;
        this.animCtrl.doWalk();
    }

    /* ================= MOVE ================= */

    private move3D (dt: number) {
        const pos = this.node.worldPosition;
        this._currentTarget.getWorldPosition(this._targetPos);

        this._targetPos.y = this._groundY;

        Vec3.subtract(this._dir, this._targetPos, pos);
        const dist = this._dir.length();

        if (dist <= this.stopDistance) {
            this.onReachTarget();
            return;
        }

        this._dir.normalize();
        this.rotateToDirection(this._dir);

        Vec3.multiplyScalar(this._move, this._dir, this.moveSpeed * dt);
        Vec3.add(this._move, pos, this._move);

        this._move.y = this._groundY;
        this.node.setWorldPosition(this._move);
        // this.node.setPosition(this.node.x, 0, this.node.z);
    }

    /* ================= ROTATE ================= */

    private rotateToDirection (dir: Vec3) {
        const lookPos = new Vec3(
            this.node.worldPosition.x + dir.x,
            this._groundY,
            this.node.worldPosition.z + dir.z
        );

        this.node.lookAt(lookPos);

        if (this.rotationOffsetY !== 0) {
            this.node.rotate(
                Quat.fromEuler(new Quat(), 0, this.rotationOffsetY, 0)
            );
        }
    }

    /* ================= TARGET ================= */

    private onReachTarget () {
        if (this._state === ChefState.MoveWithBedo) {
            // tới Node2 → quay về Node1 bằng Walk
            this._currentTarget = this.pointA;
            this.enterMoveWithWalk();
        }
        else if (this._state === ChefState.MoveWithWalk) {
            // về Node1 → Doing
            this.enterDoing();
        }
    }
}
