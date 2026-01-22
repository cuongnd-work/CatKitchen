import { _decorator, Component, Node, Vec3, RigidBody, SkeletalAnimation, AnimationClip } from 'cc';
import { ItemSellTrigger } from './ItemSellTrigger';
import { SpawnZone } from './SpawnZone';

const { ccclass, property } = _decorator;

const _tempPos = new Vec3();
const _targetPos = new Vec3();
const _moveDir = new Vec3();
const _velocity = new Vec3();
const _currentVel = new Vec3();

@ccclass('WorkerWaypointPatrol')
export class WorkerWaypointPatrol extends Component {
    @property({ type: Node, tooltip: 'First patrol point.' })
    public waypointA: Node | null = null;

    @property({ type: Node, tooltip: 'Second patrol point.' })
    public waypointB: Node | null = null;

    @property({ tooltip: 'Units per second while walking.' })
    public moveSpeed = 1.5;

    @property({ tooltip: 'Seconds spent waiting at each waypoint.' })
    public pauseDuration = 3;

    @property({ tooltip: 'Distance threshold (world units) to consider the waypoint reached.' })
    public arrivalThreshold = 0.1;

    @property({ type: [SpawnZone], tooltip: 'Spawn zones this worker interacts with.' })
    public linkedSpawnZones: SpawnZone[] = [];

    @property({ tooltip: 'Carry direction (local space) applied to linked spawn zones.' })
    public spawnZoneCarryDirection: Vec3 = new Vec3(0, 1, 0);

    @property({ tooltip: 'Type Z offset spacing applied to linked spawn zones.' })
    public spawnZoneTypeSpacing = 0;

    @property({ type: AnimationClip, tooltip: 'Idle animation clip (optional).' })
    public idleAnimClip: AnimationClip | null = null;

    @property({ type: AnimationClip, tooltip: 'Move animation clip (optional).' })
    public moveAnimClip: AnimationClip | null = null;

    @property({ type: ItemSellTrigger, tooltip: 'Sell trigger used when the worker reaches the sell point.' })
    public sellTrigger: ItemSellTrigger | null = null;

    @property({ type: Node, tooltip: 'Carry anchor assigned to spawn/sell systems (defaults to this node).' })
    public carryAnchor: Node | null = null;

    private _waypoints: Node[] = [];
    private _currentIndex = 0;
    private _isWaiting = false;
    private _waitTimer = 0;
    private _rigidBody: RigidBody | null = null;
    private _anim: SkeletalAnimation | null = null;
    private _isMoving = false;

    protected start (): void {
        this._rigidBody = this.getComponent(RigidBody);
        this._anim = this.getComponent(SkeletalAnimation);
        if (this._anim) {
            const clips = [this.idleAnimClip, this.moveAnimClip];
            clips.forEach((clip) => {
                if (clip && !this._anim?.getState(clip.name)) {
                    this._anim?.addClip(clip);
                }
            });
            if (this.idleAnimClip) {
                this._anim.play(this.idleAnimClip.name);
            }
        }

        if (this.waypointA) {
            this._waypoints.push(this.waypointA);
        }
        if (this.waypointB) {
            this._waypoints.push(this.waypointB);
        }

        if (this._waypoints.length < 2) {
            console.warn('[WorkerWaypointPatrol] At least two waypoints are required.', this.node.name);
            this.enabled = false;
        }

        this.configureLinkedSystems();
    }

    protected update (deltaTime: number): void {
        if (this._waypoints.length < 2) {
            return;
        }

        if (this._isWaiting) {
            this._waitTimer -= deltaTime;
            if (this._waitTimer <= 0) {
                this._isWaiting = false;
            } else {
                this.applyIdleState();
                return;
            }
        }

        const target = this._waypoints[this._currentIndex];
        if (!target) {
            return;
        }

        target.getWorldPosition(_targetPos);
        this.node.getWorldPosition(_tempPos);
        Vec3.subtract(_moveDir, _targetPos, _tempPos);

        const distance = _moveDir.length();
        if (distance <= Math.max(0.01, this.arrivalThreshold)) {
            this.beginWait();
            return;
        }

        _moveDir.normalize();
        this.alignForward(_moveDir);
        this.applyMovement(_moveDir, deltaTime);
    }

    private beginWait (): void {
        this.stopMovement();
        this._isWaiting = true;
        this._waitTimer = Math.max(0, this.pauseDuration);
        this._currentIndex = (this._currentIndex + 1) % this._waypoints.length;
    }

    private applyMovement (direction: Vec3, deltaTime: number): void {
        if (this._rigidBody) {
            this._rigidBody.getLinearVelocity(_currentVel);
            _velocity.set(direction);
            _velocity.multiplyScalar(this.moveSpeed);
            _velocity.y = _currentVel.y;
            this._rigidBody.setLinearVelocity(_velocity);
        } else {
            _tempPos.add(direction.multiplyScalar(this.moveSpeed * deltaTime));
            this.node.setWorldPosition(_tempPos);
        }
        this.applyMoveState();
    }

    private stopMovement (): void {
        if (this._rigidBody) {
            this._rigidBody.setLinearVelocity(Vec3.ZERO);
        }
        this.applyIdleState();
    }

    private alignForward (direction: Vec3): void {
        const angle = Math.atan2(direction.x, direction.z) * 180 / Math.PI;
        this.node.setRotationFromEuler(0, angle, 0);
    }

    private applyMoveState (): void {
        if (this._isMoving) {
            return;
        }
        this._isMoving = true;
        if (this._anim && this.moveAnimClip) {
            this._anim.crossFade(this.moveAnimClip.name, 0.2);
        }
    }

    private applyIdleState (): void {
        if (!this._isMoving) {
            return;
        }
        this._isMoving = false;
        if (this._anim && this.idleAnimClip) {
            this._anim.crossFade(this.idleAnimClip.name, 0.2);
        }
    }

    protected onDestroy (): void {
        this.unregisterLinkedSystems();
    }

    private configureLinkedSystems (): void {
        const anchor = this.carryAnchor ?? this.node;
        if (this.linkedSpawnZones && this.linkedSpawnZones.length > 0) {
            this.linkedSpawnZones.forEach((zone) => {
                if (!zone) {
                    return;
                }
                zone.registerCollector(this.node, anchor);
                zone.carryStackDirection.set(0, 1, 0);
                zone.typeZOffsetSpacing = this.spawnZoneTypeSpacing;
            });
        }

        if (this.sellTrigger) {
            this.sellTrigger.registerSeller(this.node, anchor);
        }
    }

    private unregisterLinkedSystems (): void {
        if (this.linkedSpawnZones && this.linkedSpawnZones.length > 0) {
            this.linkedSpawnZones.forEach((zone) => zone?.unregisterCollector(this.node));
        }
        if (this.sellTrigger) {
            this.sellTrigger.unregisterSeller(this.node);
        }
    }
}
