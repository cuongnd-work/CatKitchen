import { _decorator, Component, Node, Vec3, Quat } from 'cc';
import { CatAnimationController } from './CatAnimationController';

const { ccclass, property } = _decorator;

enum ChefState {
    Doing,
    Bedo,
    Walking,
}

@ccclass('ChefBehavior')
class ChefBehavior extends Component {

    /* ================== TARGET ================== */

    @property(Node)
    pointA: Node = null!;

    @property(Node)
    pointB: Node = null!;

    /* ================== MOVE ================== */

    @property({ tooltip: 'Tốc độ di chuyển (m/s)' })
    moveSpeed: number = 1.5;

    @property({ tooltip: 'Khoảng cách coi như tới nơi' })
    stopDistance: number = 0.2;

    /* ================== ROTATION ================== */

    @property({ tooltip: 'Bù hướng model (0 / 90 / -90 / 180)' })
    rotationOffsetY: number = 180;

    /* ================== TIMING ================== */

    @property
    doingTime: number = 1.0;

    @property
    bedoTime: number = 0.6;

    /* ================== ANIM ================== */

    @property(CatAnimationController)
    animCtrl: CatAnimationController = null!;

    /* ================== INTERNAL ================== */

    private _state: ChefState = ChefState.Doing;
    private _currentTarget: Node = null!;

    private _dir = new Vec3();
    private _move = new Vec3();
    private _targetPos = new Vec3();

    /* ================== LIFE ================== */

    start () {
        this._currentTarget = this.pointB;
        this.enterDoing();
    }

    update (dt: number) {
        if (this._state === ChefState.Walking) {
            this.move3D(dt);
        }
    }

    /* ================== FSM ================== */

    private enterDoing () {
        this._state = ChefState.Doing;
        this.animCtrl.doDoing();
        // this.animCtrl.setSpeed(1);

        this.scheduleOnce(() => {
            this.enterBedo();
        }, this.doingTime);
    }

    private enterBedo () {
        this._state = ChefState.Bedo;
        this.animCtrl.doBedo();
        // this.animCtrl.setSpeed(1);

        this.scheduleOnce(() => {
            this.enterWalk();
        }, this.bedoTime);
    }

    private enterWalk () {
        this._state = ChefState.Walking;
        this.animCtrl.doWalk();

        // sync animation speed theo move speed
        // this.animCtrl.setSpeed(this.moveSpeed);
    }

    /* ================== MOVE 3D ================== */

    private move3D (dt: number) {
        const pos = this.node.worldPosition;
        this._currentTarget.getWorldPosition(this._targetPos);

        // khóa Y
        this._targetPos.y = pos.y;

        Vec3.subtract(this._dir, this._targetPos, pos);
        const distance = this._dir.length();

        if (distance <= this.stopDistance) {
            this.onReachTarget();
            return;
        }

        this._dir.normalize();

        this.rotateToDirection(this._dir);

        Vec3.multiplyScalar(this._move, this._dir, this.moveSpeed * dt);
        Vec3.add(this._move, pos, this._move);

        this.node.setWorldPosition(this._move);

        this.node.setPosition(this.node.position.x, 0, this.node.position.z);
    }

    /* ================== ROTATE ================== */

    private rotateToDirection (dir: Vec3) {
        const lookPos = new Vec3(
            this.node.worldPosition.x + dir.x,
            this.node.worldPosition.y,
            this.node.worldPosition.z + dir.z
        );

        this.node.lookAt(lookPos);

        if (this.rotationOffsetY !== 0) {
            this.node.rotate(
                Quat.fromEuler(new Quat(), 0, this.rotationOffsetY, 0)
            );
        }
    }

    /* ================== TARGET ================== */

    private onReachTarget () {
        this._currentTarget =
            this._currentTarget === this.pointA ? this.pointB : this.pointA;

        this.enterDoing();
    }
}

export default ChefBehavior
