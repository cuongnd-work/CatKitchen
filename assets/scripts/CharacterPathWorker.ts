import { _decorator, CCFloat, Component, Node, Quat, Vec3, warn } from 'cc';
import { CatAnimationController } from 'db://assets/scripts/CatAnimationController';

const { ccclass, property } = _decorator;

enum WorkerPhase {
    Walking,
    Working,
}

type MovementResult = {
    arrived: boolean;
    moved: boolean;
};

@ccclass('CharacterPathWorker')
export class CharacterPathWorker extends Component {
    @property({ type: [Node], tooltip: 'Ordered waypoints in world space.' })
    public pathNodes: Node[] = [];

    @property({ tooltip: 'Units per second when moving to the next node.' })
    public moveSpeed = 40;

    @property({ tooltip: 'Seconds to pause at each waypoint when no per-node duration is provided.' })
    public defaultWorkDuration = 1.5;

    @property({ type: [CCFloat], tooltip: 'Override pause duration (seconds) for each waypoint index.' })
    public workDurations: number[] = [];

    @property({ tooltip: 'Comma separated CatAnimationController method names for work states.' })
    public workAnimationPool = 'doDoing,doBedo';

    @property({ tooltip: 'CatAnimationController method used while the cat walks.' })
    public walkAnimationMethod = 'doWalk';

    @property({ tooltip: 'Optional override. Defaults to CatAnimationController on the same node.' })
    public animationController: CatAnimationController | null = null;

    @property({ tooltip: 'Rotate the character to face its current movement direction.' })
    public faceMovement = true;

    @property({ tooltip: 'Up axis used while rotating to face the path (ignored when faceMovement is false).' })
    public faceUp: Vec3 = new Vec3(0, 1, 0);

    private _phase: WorkerPhase = WorkerPhase.Walking;
    private _currentNodeIndex = 0;
    private _waitTimer = 0;
    private _waitTarget = 0;
    private _currentWorldPos = new Vec3();
    private _targetWorldPos = new Vec3();
    private _direction = new Vec3();
    private _faceRotation = new Quat();
    private _normalizedFaceUp = new Vec3(0, 1, 0);
    private readonly _arrivalThreshold = 0.01;
    private _walkAnimationPlaying = false;

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
        this.enterWalkingState(true);
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

        const result = this.moveTowardsWaypoint(waypoint, dt);

        if (result.arrived) {
            this.handleArrival();
            return;
        }

        if (result.moved) {
            this.ensureWalkAnimation();
        }
    }

    private updateWorking(dt: number): void {
        this._waitTimer += dt;
        if (this._waitTimer >= this._waitTarget) {
            this.advanceToNextWaypoint();
            this.enterWalkingState();
        }
    }

    private advanceToNextWaypoint(): void {
        this._currentNodeIndex = (this._currentNodeIndex + 1) % this.pathNodes.length;
    }

    private playWalkAnimation(): void {
        this.callAnimationMethod(this.walkAnimationMethod);
    }

    private callAnimationMethod(methodName: string): void {
        if (!this.animationController || !methodName) {
            return;
        }

        const controller = this.animationController as unknown as Record<string, unknown>;
        const action = controller[methodName];
        if (typeof action === 'function') {
            (action as () => void).call(this.animationController);
        } else {
            warn(`[CharacterPathWorker] Animation method "${methodName}" was not found.`);
        }
    }

    private moveTowardsWaypoint(waypoint: Node, dt: number): MovementResult {
        const result: MovementResult = { arrived: false, moved: false };

        waypoint.getWorldPosition(this._targetWorldPos);
        this.node.getWorldPosition(this._currentWorldPos);
        Vec3.subtract(this._direction, this._targetWorldPos, this._currentWorldPos);
        const distance = this._direction.length();
        if (distance <= this._arrivalThreshold) {
            this.node.setWorldPosition(this._targetWorldPos);
            result.arrived = true;
            return result;
        }

        const step = Math.max(0, this.moveSpeed * dt);
        if (step <= 0) {
            return result;
        }

        this._direction.normalize();
        this.applyFacing(this._direction);

        if (step >= distance) {
            this.node.setWorldPosition(this._targetWorldPos);
            result.arrived = true;
            result.moved = true;
            return result;
        }

        Vec3.scaleAndAdd(this._currentWorldPos, this._currentWorldPos, this._direction, step);
        this.node.setWorldPosition(this._currentWorldPos);
        result.moved = true;
        return result;
    }

    private getWorkDurationForIndex(index: number): number {
        if (index >= 0 && index < this.workDurations.length) {
            const value = this.workDurations[index];
            if (!Number.isNaN(value) && Number.isFinite(value) && value >= 0) {
                return value;
            }
        }

        return Math.max(0, this.defaultWorkDuration);
    }

    private handleArrival(): void {
        const waitDuration = this.getWorkDurationForIndex(this._currentNodeIndex);
        if (waitDuration <= 0) {
            this.advanceToNextWaypoint();
            this.enterWalkingState(true);
            return;
        }

        this.enterWorkingState(waitDuration);
    }

    private enterWorkingState(forcedDuration?: number): void {
        if (this._phase === WorkerPhase.Working && forcedDuration === undefined) {
            return;
        }

        const waitDuration = forcedDuration ?? this.getWorkDurationForIndex(this._currentNodeIndex);
        if (waitDuration <= 0) {
            this.advanceToNextWaypoint();
            this.enterWalkingState(true);
            return;
        }

        this._phase = WorkerPhase.Working;
        this._waitTimer = 0;
        this._waitTarget = waitDuration;
        this._walkAnimationPlaying = false;
        this.playWorkAnimation();
    }

    private enterWalkingState(force = false): void {
        if (!force && this._phase === WorkerPhase.Walking) {
            return;
        }

        this._phase = WorkerPhase.Walking;
        this._walkAnimationPlaying = false;
    }

    private playWorkAnimation(): void {
        if (!this.animationController) {
            return;
        }

        const controller = this.animationController as unknown as Record<string, unknown>;
        const candidates = this.workAnimationPool.split(',')
            .map((method) => method.trim())
            .filter((method) => method.length > 0);

        const valid = candidates.filter((method) => typeof controller[method] === 'function');
        if (!valid.length) {
            warn('[CharacterPathWorker] workAnimationPool has no valid animation methods.');
            return;
        }

        const pick = valid[Math.floor(Math.random() * valid.length)];
        (controller[pick] as () => void).call(this.animationController);
    }

    private ensureWalkAnimation(): void {
        if (this._walkAnimationPlaying) {
            return;
        }

        this._walkAnimationPlaying = true;
        this.playWalkAnimation();
    }

    private applyFacing(direction: Vec3): void {
        if (!this.faceMovement) {
            return;
        }

        if (Math.abs(direction.x) < 0.0001 && Math.abs(direction.y) < 0.0001 && Math.abs(direction.z) < 0.0001) {
            return;
        }

        this._normalizedFaceUp.set(this.faceUp);
        if (this._normalizedFaceUp.lengthSqr() < 0.0001) {
            this._normalizedFaceUp.set(0, 1, 0);
        } else {
            this._normalizedFaceUp.normalize();
        }

        Quat.fromViewUp(this._faceRotation, direction, this._normalizedFaceUp);
        this.node.setWorldRotation(this._faceRotation);
    }
}
