import { _decorator, Component, Node, Vec3, Quat, Mat4 } from 'cc';
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
    public speed: number = 5;

    @property
    public currentSpeed: number = 5;

    @property
    stopDistance: number = 0.2;

    /* ================= ROTATION ================= */

    @property
    rotationOffsetY: number = 180;

    @property(Node)
    hamburger: Node = null;

    @property(Node)
    coin: Node = null;

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
        this.hamburger.active = false;
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

        const doingTime = this.getDoingTime();

        this.scheduleOnce(() => {
            this._currentTarget = this.pointB;
            this.hamburger.active = true;
            this.enterMoveWithBedo();
        }, doingTime);
    }

    private getDoingTime (): number {
        return 1 * this.speed / this.currentSpeed;
    }

    private enterMoveWithBedo () {
        this._state = ChefState.MoveWithBedo;
        this.animCtrl.doBedo();
    }

    private enterMoveWithWalk () {
        this._state = ChefState.MoveWithWalk;
        this.animCtrl.doWalk();
        this.hamburger.active = false;

        this.coin.active = true;

        setTimeout(() => {
            this.coin.active = false;
        }, 1000);
    }

    /* ================= MOVE ================= */

    private move3D (dt: number) {
        const pos = this.node.worldPosition;
        this._currentTarget.getWorldPosition(this._targetPos);
        this._targetPos.y = pos.y;

        Vec3.subtract(this._dir, this._targetPos, pos);
        const distance = this._dir.length();

        const maxStep = this.currentSpeed * dt;

        if (distance <= maxStep || distance <= this.stopDistance) {
            this.setWorldPosKeepLocalY0(this._targetPos);
            this.onReachTarget();
            return;
        }

        this._dir.normalize();
        this.rotateLocalToWorldDir(this._dir);

        Vec3.multiplyScalar(this._move, this._dir, maxStep);
        Vec3.add(this._move, pos, this._move);

        this.setWorldPosKeepLocalY0(this._move);
    }


    private _invParentMat = new Mat4();
    private _localPos = new Vec3();

    private setWorldPosKeepLocalY0 (worldPos: Vec3) {
        const parent = this.node.parent;
        if (!parent) {
            // không có parent → local = world
            this.node.setPosition(worldPos.x, 0, worldPos.z);
            return;
        }

        // inverse parent world matrix
        Mat4.invert(this._invParentMat, parent.worldMatrix);

        // world → local
        Vec3.transformMat4(this._localPos, worldPos, this._invParentMat);

        // ÉP LOCAL Y = 0
        this._localPos.y = 0;

        // set LOCAL position
        this.node.setPosition(this._localPos);
    }

    /* ================= ROTATE ================= */

    private _invParentRot = new Quat();
    private _localDir = new Vec3();
    private _rotQuat = new Quat();

    private rotateLocalToWorldDir (worldDir: Vec3) {
        const parent = this.node.parent;

        if (parent) {
            // inverse parent WORLD rotation
            Quat.invert(this._invParentRot, parent.worldRotation);

            // world dir -> local dir
            Vec3.transformQuat(this._localDir, worldDir, this._invParentRot);
        } else {
            this._localDir.set(worldDir);
        }

        // chỉ xoay quanh trục Y local
        const angleY = Math.atan2(this._localDir.x, this._localDir.z) * 180 / Math.PI;

        Quat.fromEuler(
            this._rotQuat,
            0,
            angleY + this.rotationOffsetY,
            0
        );

        // SET LOCAL ROTATION
        this.node.setRotation(this._rotQuat);
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
