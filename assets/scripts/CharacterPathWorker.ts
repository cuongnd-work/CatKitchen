import { _decorator, Component, Node, Vec3, warn } from 'cc';
import { CatAnimationController } from 'db://assets/scripts/CatAnimationController';

const { ccclass, property } = _decorator;

enum WorkerPhase {
    Walking,
    Working,
}

@ccclass('CharacterPathWorker')
export class CharacterPathWorker extends Component {
    @property({ type: [Node], tooltip: 'Ordered waypoints in world space.' })
    public pathNodes: Node[] = [];

    @property({ tooltip: 'Units per second when moving to the next node.' })
    public moveSpeed = 80;

    @property({ tooltip: 'Consider the waypoint reached when within this many units.' })
    public arriveThreshold = 2;

    @property({ tooltip: 'Minimum wait time at a waypoint before moving on.' })
    public minWorkDuration = 1.5;

    @property({ tooltip: 'Maximum wait time at a waypoint before moving on.' })
    public maxWorkDuration = 3.5;

    @property({ tooltip: 'Comma separated CatAnimationController method names for work states.' })
    public workAnimationPool = 'doDoing,doBedo';

    @property({ tooltip: 'CatAnimationController method used while the cat walks.' })
    public walkAnimationMethod = 'doWalk';

    @property({ tooltip: 'Optional override. Defaults to CatAnimationController on the same node.' })
    public animationController: CatAnimationController | null = null;

    private _phase: WorkerPhase = WorkerPhase.Walking;
    private _currentNodeIndex = 0;
    private _waitTimer = 0;
    private _waitTarget = 0;
    private _currentWorldPos = new Vec3();
    private _targetWorldPos = new Vec3();
    private _direction = new Vec3();

    protected onLoad(): void {
        if (!this.animationController) {
            this.animationController = this.getComponent(CatAnimationController);
        }
    }

    protected onEnable(): void {
        if (!this.pathNodes.length) {
            warn('[CharacterPathWorker] Assign at least one waypoint node.');
            return;
        }

        this._currentNodeIndex = 0;
        this._phase = WorkerPhase.Walking;
        this.playWalkAnimation();
    }

    protected update(dt: number): void {
        if (!this.pathNodes.length) {
            return;
        }

        if (this._phase === WorkerPhase.Walking) {
            this.updateWalking(dt);
        } else {
            this.updateWorking(dt);
        }
    }

    private updateWalking(dt: number): void {
        const waypoint = this.pathNodes[this._currentNodeIndex];
        if (!waypoint || !waypoint.isValid) {
            warn(`[CharacterPathWorker] Missing waypoint at index ${this._currentNodeIndex}, skipping.`);
            this.advanceToNextWaypoint();
            return;
        }

        waypoint.getWorldPosition(this._targetWorldPos);
        this.node.getWorldPosition(this._currentWorldPos);
        Vec3.subtract(this._direction, this._targetWorldPos, this._currentWorldPos);
        const distance = this._direction.length();

        if (distance <= this.arriveThreshold) {
            this.node.setWorldPosition(this._targetWorldPos);
            this.startWorkingPause();
            return;
        }

        if (distance <= 0.0001) {
            return;
        }

        this._direction.normalize();
        const maxStep = Math.min(distance, this.moveSpeed * dt);
        Vec3.scaleAndAdd(this._currentWorldPos, this._currentWorldPos, this._direction, maxStep);
        this.node.setWorldPosition(this._currentWorldPos);
    }

    private updateWorking(dt: number): void {
        this._waitTimer += dt;
        if (this._waitTimer >= this._waitTarget) {
            this.advanceToNextWaypoint();
            this._phase = WorkerPhase.Walking;
            this.playWalkAnimation();
        }
    }

    private startWorkingPause(): void {
        this._phase = WorkerPhase.Working;
        this._waitTimer = 0;
        this._waitTarget = this.randomRange(this.minWorkDuration, this.maxWorkDuration);
        this.playRandomAnimation(this.workAnimationPool);
    }

    private advanceToNextWaypoint(): void {
        this._currentNodeIndex = (this._currentNodeIndex + 1) % this.pathNodes.length;
    }

    private playWalkAnimation(): void {
        this.callAnimationMethod(this.walkAnimationMethod);
    }

    private playRandomAnimation(pool: string): void {
        const methods = pool.split(',')
            .map((method) => method.trim())
            .filter((method) => method.length > 0);

        if (!methods.length) {
            return;
        }

        const index = Math.floor(Math.random() * methods.length);
        this.callAnimationMethod(methods[index]);
    }

    private callAnimationMethod(methodName: string): void {
        if (!this.animationController || !methodName) {
            return;
        }

        const action = (this.animationController as Record<string, unknown>)[methodName];
        if (typeof action === 'function') {
            (action as () => void).call(this.animationController);
        } else {
            warn(`[CharacterPathWorker] Animation method "${methodName}" was not found.`);
        }
    }

    private randomRange(min: number, max: number): number {
        const low = Math.min(min, max);
        const high = Math.max(min, max);
        const span = Math.max(high - low, 0.0001);
        return low + Math.random() * span;
    }
}
