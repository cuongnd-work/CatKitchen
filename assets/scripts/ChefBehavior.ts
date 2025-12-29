import { _decorator, Component, Node, Vec3, Quat, Mat4 } from 'cc';
import { CatAnimationController } from './CatAnimationController';
import { CustomersQueueManager } from 'db://assets/scripts/customers/CustomersQueueManager';
import { CustomersQueueEvent, CustomersQueueEvents } from 'db://assets/scripts/customers/CustomersQueueEvents';
import {MoveTargetProvider} from "db://assets/scripts/MoveTargetProvider";

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
    pointA: Node = null!;

    @property(Node)
    pointB: Node = null!;

    /* ================= MOVE ================= */

    @property
    public speed = 5;

    @property
    public currentSpeed = 5;

    @property
    stopDistance = 0.2;

    /* ================= ROTATION ================= */

    @property
    rotationOffsetY = 180;

    @property(Node)
    hamburger: Node = null!;

    @property(Node)
    coin: Node = null!;

    /* ================= ANIM ================= */

    @property(CatAnimationController)
    animCtrl: CatAnimationController = null!;

    @property(CustomersQueueManager)
    queueManager: CustomersQueueManager = null;

    @property({ tooltip: 'Chỉ số hàng mèo mà đầu bếp phục vụ. Đặt -1 để tự động lấy theo mèo đầu tiên.' })
    columnIndex = -1;

    /* ================= INTERNAL ================= */

    private _state: ChefState = ChefState.Doing;
    private _currentTarget: Node = null!;
    private _groundY = 0;

    private _dir = new Vec3();
    private _move = new Vec3();
    private _targetPos = new Vec3();

    private _invParentMat = new Mat4();
    private _localPos = new Vec3();

    private _invParentRot = new Quat();
    private _localDir = new Vec3();
    private _rotQuat = new Quat();
    private _lastSpeedForQueue = -1;

    /* ================= LIFE ================= */

    protected onLoad (): void {
        CustomersQueueEvents.on(CustomersQueueEvent.ORDER_COMPLETED, this.onCustomerOrderCompleted, this);
    }

    protected onDestroy (): void {
        CustomersQueueEvents.off(CustomersQueueEvent.ORDER_COMPLETED, this.onCustomerOrderCompleted, this);
    }

    start (): void {
        this._groundY = this.node.worldPosition.y;

        this._currentTarget = this.pointA;
        this.enterDoing();
        this.hamburger.active = false;
        this.resolveQueueManagerReference();
        this.resolveColumnFromCurrentCustomer();
        this.assignFrontCustomer();
        this._lastSpeedForQueue = this.currentSpeed;
        this.updateQueueAdvanceSpeed();
    }

    update (dt: number): void {
        if (this.currentSpeed !== this._lastSpeedForQueue) {
            this._lastSpeedForQueue = this.currentSpeed;
            this.updateQueueAdvanceSpeed();
        }

        if (
            this._state === ChefState.MoveWithBedo ||
            this._state === ChefState.MoveWithWalk
        ) {
            this.move3D(dt);
        }
    }

    /* ================= STATE ================= */

    private enterDoing (): void {
        const provider = MoveTargetProvider.instance;
        if (provider) {
            const pair = provider.getRandomTargetPair();
            if (pair.left) {
                this.pointB = pair.left;
            }

            const targetAnim = this.animCtrl;
            if (targetAnim && pair.right) {
                targetAnim.sellTargetPopup = pair.right;
            }
        }

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

    private enterMoveWithBedo (): void {
        this.assignFrontCustomer();
        this._state = ChefState.MoveWithBedo;
        this.animCtrl.doBedo();
    }

    private enterMoveWithWalk (): void {
        this._state = ChefState.MoveWithWalk;
        this.animCtrl.doWalk();
        this.hamburger.active = false;

        this.coin.active = true;

        if (this.currentSpeed >= 10) {
            return;
        }
        setTimeout(() => {
            this.coin.active = false;
        }, 1000);
    }

    /* ================= CUSTOMER ================= */

    private resolveColumnFromCurrentCustomer (): void {
        const manager = this.resolveQueueManagerReference();
        if (this.columnIndex >= 0 || !manager || !this.animCtrl) {
            if (this.columnIndex < 0 && !manager) {
            }
            return;
        }

        const detectedIndex = manager.getColumnIndexForNode(this.animCtrl.node);
        if (detectedIndex >= 0) {
            this.columnIndex = detectedIndex;
        } else {
        }
    }

    private assignFrontCustomer (): void {
        this.resolveColumnFromCurrentCustomer();

        const manager = this.resolveQueueManagerReference();
        if (!manager || this.columnIndex < 0) {
            return;
        }

        const frontNode = manager.getFrontCustomerNode(this.columnIndex);
        if (!frontNode) {
            return;
        }

        const nextCtrl = frontNode.getComponent(CatAnimationController);
        if (!nextCtrl || nextCtrl === this.animCtrl) {
            if (!nextCtrl) {
            } else {
            }
            return;
        }

        this.animCtrl = nextCtrl;
        this.updateQueueAdvanceSpeed();
    }

    private onCustomerOrderCompleted (customerNode: Node): void {
        const manager = this.resolveQueueManagerReference();
        if (!manager || !this.animCtrl) {
            return;
        }

        const resolved = manager.resolveCustomerNode(customerNode);
        if (!resolved || resolved !== this.animCtrl.node) {
            return;
        }

        this.scheduleOnce(() => {
            this.assignFrontCustomer();
        }, 0);
    }

    private resolveQueueManagerReference (): CustomersQueueManager | null {
        if (this.queueManager) {
            return this.queueManager;
        }

        let current: Node | null = this.node;
        while (current) {
            const manager = current.getComponent(CustomersQueueManager);
            if (manager) {
                this.queueManager = manager;
                return manager;
            }
            current = current.parent;
        }

        const scene = this.node.scene;
        if (scene) {
            const manager = scene.getComponentInChildren(CustomersQueueManager);
            if (manager) {
                this.queueManager = manager;
                return manager;
            }
        }

        return null;
    }

    private updateQueueAdvanceSpeed (): void {
        const manager = this.resolveQueueManagerReference();
        if (!manager || this.columnIndex < 0) {
            return;
        }

        const base = Math.max(0.1, this.speed);
        const ratio = Math.max(0.1, this.currentSpeed) / base;
        manager.setColumnAdvanceMultiplier(this.columnIndex, ratio);
    }

    /* ================= MOVE ================= */

    private move3D (dt: number): void {
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

    private setWorldPosKeepLocalY0 (worldPos: Vec3): void {
        const parent = this.node.parent;
        if (!parent) {
            this.node.setPosition(worldPos.x, 0, worldPos.z);
            return;
        }

        Mat4.invert(this._invParentMat, parent.worldMatrix);
        Vec3.transformMat4(this._localPos, worldPos, this._invParentMat);
        this._localPos.y = 0;
        this.node.setPosition(this._localPos);
    }

    /* ================= ROTATE ================= */

    private rotateLocalToWorldDir (worldDir: Vec3): void {
        const parent = this.node.parent;

        if (parent) {
            Quat.invert(this._invParentRot, parent.worldRotation);
            Vec3.transformQuat(this._localDir, worldDir, this._invParentRot);
        } else {
            this._localDir.set(worldDir);
        }

        const angleY = Math.atan2(this._localDir.x, this._localDir.z) * 180 / Math.PI;

        Quat.fromEuler(
            this._rotQuat,
            0,
            angleY + this.rotationOffsetY,
            0
        );

        this.node.setRotation(this._rotQuat);
    }

    /* ================= TARGET ================= */

    private onReachTarget (): void {
        if (this._state === ChefState.MoveWithBedo) {
            this._currentTarget = this.pointA;
            this.enterMoveWithWalk();
        }
        else if (this._state === ChefState.MoveWithWalk) {
            this.enterDoing();
        }
    }
}
