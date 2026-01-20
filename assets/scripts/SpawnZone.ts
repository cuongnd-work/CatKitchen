import { _decorator, Component, Node, Prefab, Collider, ITriggerEvent, Vec3, Quat, macro, tween, Tween, TweenEasing } from 'cc';
import { object_pool_manager } from 'db://assets/plugins/playable-foundation/game-foundation/object_pool';
import { SpawnZoneElement } from './SpawnZoneElement';
const { ccclass, property } = _decorator;

const EVENT_TRIGGER_ENTER = 'onTriggerEnter';
const EVENT_TRIGGER_EXIT = 'onTriggerExit';

type SpawnedSlotEntry = {
    node: Node;
    slotIndex: number;
};

@ccclass('SpawnZone')
export class SpawnZone extends Component {
    @property({ type: Node, tooltip: 'Character node to watch for trigger overlap.' })
    public character: Node | null = null;

    @property({ type: Prefab, tooltip: 'Prefab to spawn every interval while the character stays inside.' })
    public prefabToSpawn: Prefab | null = null;

    @property({ type: Node, tooltip: 'Parent that receives spawned instances (defaults to this node).' })
    public spawnParent: Node | null = null;

    @property({ type: Node, tooltip: 'Collider node that detects when the character should collect the stack (defaults to spawnParent).' })
    public collectTriggerNode: Node | null = null;

    @property({ type: Node, tooltip: 'Anchor on the character where collected prefabs are attached.' })
    public characterCarryAnchor: Node | null = null;

    @property({ type: Vec3, tooltip: 'Euler rotation applied to prefabs once they attach to the character.' })
    public carryRotation: Vec3 = new Vec3(90, 0, 0);

    @property({ type: Vec3, tooltip: 'Local offset applied after aligning to the carry anchor.' })
    public carryOffset: Vec3 = new Vec3();

    @property({ type: Vec3, tooltip: 'Scale applied to prefabs once they attach to the character.' })
    public carryScale: Vec3 = new Vec3(1, 1, 1);

    @property({ tooltip: 'Spacing distance applied between prefabs stacked on the character.' })
    public carryVerticalSpacing = 0.08;

    @property({ type: Vec3, tooltip: 'Local direction (character space) used to stack prefabs (set 0,0,-1 to line them behind the character).' })
    public carryStackDirection: Vec3 = new Vec3(0, 1, 0);

    @property({ tooltip: 'Seconds between moving each prefab while the character stays inside the collect trigger.' })
    public collectInterval = 0.25;

    @property({ tooltip: 'Seconds the prefab takes to travel to the carry anchor.' })
    public carryMoveDuration = 0.25;

    @property({ tooltip: 'Easing for the tween that moves prefabs to the character.' })
    public carryMoveEasing: TweenEasing = 'quadOut';

    @property({ tooltip: 'Seconds between each spawn.' })
    public spawnInterval = 1;

    @property({ tooltip: 'Delay before the first spawn after the character enters.' })
    public spawnDelayOnEnter = 0;

    @property({ tooltip: 'Number of columns in the ground grid.', min: 1, step: 1 })
    public columns = 4;

    @property({ tooltip: 'Number of rows in the ground grid.', min: 1, step: 1 })
    public rows = 4;

    @property({ tooltip: 'Distance between columns on the X axis.' })
    public horizontalSpacing = 0.5;

    @property({ tooltip: 'Distance between rows on the Z axis.' })
    public depthSpacing = 0.5;

    @property({ tooltip: 'Distance between each stacked layer on the Y axis.' })
    public verticalSpacing = 0.5;

    @property({ tooltip: 'Reset the stacking layout when the character leaves the zone.' })
    public resetStackOnExit = false;

    @property({ type: Node, tooltip: 'Node where prefabs first appear before tweening to the stacked slot.' })
    public startPoint: Node | null = null;

    @property({ type: Vec3, tooltip: 'Initial scale applied at startPoint before tweening to the prefab scale.' })
    public startScale: Vec3 = new Vec3(0.2, 0.2, 0.2);

    @property({ tooltip: 'Seconds the prefab takes to travel from the startPoint to the stacked slot.' })
    public moveDuration = 0.35;

    @property({ tooltip: 'Easing for the travel tween.' })
    public moveEasing: TweenEasing = 'quadOut';

    @property({ tooltip: 'Seconds the prefab takes to grow back to its original scale.' })
    public scaleDuration = 0.35;

    @property({ tooltip: 'Easing for the scale tween.' })
    public scaleEasing: TweenEasing = 'quadOut';

    private _isCharacterInside = false;
    private _isSpawning = false;
    private _spawnPosition: Vec3 = new Vec3();
    private _finalLocalPos: Vec3 = new Vec3();
    private _startLocalPos: Vec3 = new Vec3();
    private _startWorldPos: Vec3 = new Vec3();
    private _baseWorldPos: Vec3 = new Vec3();
    private _tempStartScale: Vec3 = new Vec3();
    private _targetScale: Vec3 = new Vec3();
    private _availableItems: SpawnedSlotEntry[] = [];
    private _collectedItems: Node[] = [];
    private _isCharacterInCollectTrigger = false;
    private _isCollectingScheduled = false;
    private _collectTriggerCollider: Collider | null = null;
    private _carryTargetWorld: Vec3 = new Vec3();
    private _carryOffsetWorld: Vec3 = new Vec3();
    private _anchorWorldRotation: Quat = new Quat();
    private _carryStackWorld: Vec3 = new Vec3();
    private _nodeSlotIndex: Map<Node, number> = new Map();
    private _freeSlots: number[] = [];
    private _nextSlotIndex = 0;

    protected onEnable(): void {
        const collider = this.getComponent(Collider);
        if (!collider) {
            console.warn(`[SpawnZone] ${this.node.name} needs a Collider set as a trigger.`);
        } else {
            collider.on(EVENT_TRIGGER_ENTER, this.onTriggerEnter, this);
            collider.on(EVENT_TRIGGER_EXIT, this.onTriggerExit, this);
        }
        this.registerCollectTriggerCollider();
    }

    protected onDisable(): void {
        const collider = this.getComponent(Collider);
        if (collider) {
            collider.off(EVENT_TRIGGER_ENTER, this.onTriggerEnter, this);
            collider.off(EVENT_TRIGGER_EXIT, this.onTriggerExit, this);
        }
        this.stopSpawning();
        this.unregisterCollectTriggerCollider();
        this.stopCollecting();
    }

    private onTriggerEnter(event: ITriggerEvent): void {
        if (!this.character || !event.otherCollider) {
            return;
        }
        if (event.otherCollider.node === this.character) {
            this._isCharacterInside = true;
            this.startSpawning();
        }
    }

    private onTriggerExit(event: ITriggerEvent): void {
        if (!this.character || !event.otherCollider) {
            return;
        }
        if (event.otherCollider.node === this.character) {
            this._isCharacterInside = false;
            this.stopSpawning();
            if (this.resetStackOnExit) {
                this.resetStackLayout();
            }
        }
    }

    private registerCollectTriggerCollider(): void {
        this.unregisterCollectTriggerCollider();
        const triggerNode = this.collectTriggerNode ?? this.spawnParent;
        if (!triggerNode) {
            return;
        }
        const collider = triggerNode.getComponent(Collider);
        if (!collider) {
            console.warn(`[SpawnZone] ${triggerNode.name} needs a Collider set as a trigger to collect prefabs.`);
            return;
        }
        this._collectTriggerCollider = collider;
        collider.on(EVENT_TRIGGER_ENTER, this.onCollectTriggerEnter, this);
        collider.on(EVENT_TRIGGER_EXIT, this.onCollectTriggerExit, this);
    }

    private unregisterCollectTriggerCollider(): void {
        if (!this._collectTriggerCollider) {
            return;
        }
        this._collectTriggerCollider.off(EVENT_TRIGGER_ENTER, this.onCollectTriggerEnter, this);
        this._collectTriggerCollider.off(EVENT_TRIGGER_EXIT, this.onCollectTriggerExit, this);
        this._collectTriggerCollider = null;
    }

    private onCollectTriggerEnter(event: ITriggerEvent): void {
        if (!this.character || !event.otherCollider) {
            return;
        }
        if (event.otherCollider.node === this.character) {
            this._isCharacterInCollectTrigger = true;
            this.startCollecting();
        }
    }

    private onCollectTriggerExit(event: ITriggerEvent): void {
        if (!this.character || !event.otherCollider) {
            return;
        }
        if (event.otherCollider.node === this.character) {
            this._isCharacterInCollectTrigger = false;
            this.stopCollecting();
        }
    }

    private startSpawning(): void {
        if (this._isSpawning || !this.prefabToSpawn || this.spawnInterval <= 0) {
            return;
        }
        this._isSpawning = true;
        this.schedule(this.spawnPrefab, this.spawnInterval, macro.REPEAT_FOREVER, Math.max(0, this.spawnDelayOnEnter));
    }

    private stopSpawning(): void {
        if (!this._isSpawning) {
            return;
        }
        this._isSpawning = false;
        this.unschedule(this.spawnPrefab);
    }

    private startCollecting(): void {
        if (this._isCollectingScheduled) {
            return;
        }
        this._isCollectingScheduled = true;
        const interval = Math.max(0.01, this.collectInterval);
        this.schedule(this.collectNextPrefab, interval, macro.REPEAT_FOREVER, 0);
        this.collectNextPrefab();
    }

    private stopCollecting(): void {
        if (!this._isCollectingScheduled) {
            return;
        }
        this._isCollectingScheduled = false;
        this.unschedule(this.collectNextPrefab);
    }

    private collectNextPrefab(): void {
        if (!this._isCharacterInCollectTrigger) {
            return;
        }
        const nextItem = this.getNextQueuedItem();
        if (!nextItem) {
            return;
        }
        this.transferItemToCharacter(nextItem);
    }

    private spawnPrefab(): void {
        if (!this._isCharacterInside || !this.prefabToSpawn) {
            return;
        }
        const targetParent = this.spawnParent ?? this.node;
        const spawned = object_pool_manager.instance.Spawn(this.prefabToSpawn, undefined, undefined, targetParent);
        if (!spawned) {
            return;
        }
        const slotIndex = this.acquireSlotIndex();
        this.ensureElementComponent(spawned);
        this._availableItems.push({ node: spawned, slotIndex });
        this._nodeSlotIndex.set(spawned, slotIndex);
        spawned.getScale(this._targetScale);
        this._tempStartScale.set(this.startScale);
        spawned.setScale(this._tempStartScale);

        this.computeStackedPosition(this._spawnPosition, targetParent, slotIndex);
        targetParent.inverseTransformPoint(this._finalLocalPos, this._spawnPosition);

        this.getStartWorldPosition(this._startWorldPos);
        targetParent.inverseTransformPoint(this._startLocalPos, this._startWorldPos);
        spawned.setPosition(this._startLocalPos);

        const finalLocal = new Vec3(this._finalLocalPos.x, this._finalLocalPos.y, this._finalLocalPos.z);
        tween(spawned)
            .to(this.moveDuration, { position: finalLocal }, { easing: this.moveEasing })
            .start();

        const finalScale = new Vec3(this._targetScale.x, this._targetScale.y, this._targetScale.z);
        tween(spawned)
            .to(this.scaleDuration, { scale: finalScale }, { easing: this.scaleEasing })
            .start();
    }

    private getNextQueuedItem(): Node | null {
        let selectedIndex = -1;
        let selectedEntry = -1;
        for (let i = 0; i < this._availableItems.length; i++) {
            const entry = this._availableItems[i];
            const node = entry.node;
            if (!node || !node.isValid) {
                this._availableItems.splice(i, 1);
                this.releaseSlotIndex(entry.slotIndex);
                if (node) {
                    this._nodeSlotIndex.delete(node);
                }
                i--;
                continue;
            }
            if (entry.slotIndex > selectedIndex) {
                selectedIndex = entry.slotIndex;
                selectedEntry = i;
            }
        }
        if (selectedEntry === -1) {
            return null;
        }
        const [entry] = this._availableItems.splice(selectedEntry, 1);
        this._nodeSlotIndex.delete(entry.node);
        this.releaseSlotIndex(entry.slotIndex);
        return entry.node;
    }

    private transferItemToCharacter(item: Node): void {
        const anchor = this.characterCarryAnchor ?? this.character;
        if (!anchor) {
            console.warn(`[SpawnZone] ${this.node.name} needs characterCarryAnchor or character assigned to move prefabs to the player.`);
            return;
        }

        const index = this._collectedItems.length;
        this._collectedItems.push(item);

        anchor.getWorldPosition(this._carryTargetWorld);
        anchor.getWorldRotation(this._anchorWorldRotation);

        if (this.carryOffset.x !== 0 || this.carryOffset.y !== 0 || this.carryOffset.z !== 0) {
            this._carryOffsetWorld.set(this.carryOffset.x, this.carryOffset.y, this.carryOffset.z);
            Vec3.transformQuat(this._carryOffsetWorld, this._carryOffsetWorld, this._anchorWorldRotation);
            Vec3.add(this._carryTargetWorld, this._carryTargetWorld, this._carryOffsetWorld);
        }

        if (index > 0 && this.carryVerticalSpacing !== 0) {
            if (this.carryStackDirection.x !== 0 || this.carryStackDirection.y !== 0 || this.carryStackDirection.z !== 0) {
                this._carryStackWorld.set(this.carryStackDirection.x, this.carryStackDirection.y, this.carryStackDirection.z);
                Vec3.transformQuat(this._carryStackWorld, this._carryStackWorld, this._anchorWorldRotation);
                if (this._carryStackWorld.lengthSqr() > 0.0001) {
                    this._carryStackWorld.normalize();
                    this._carryStackWorld.multiplyScalar(index * this.carryVerticalSpacing);
                    Vec3.add(this._carryTargetWorld, this._carryTargetWorld, this._carryStackWorld);
                }
            } else {
                this._carryTargetWorld.y += index * this.carryVerticalSpacing;
            }
        }

        const element = this.ensureElementComponent(item);
        if (element) {
            element.moveTo(
                anchor,
                this._carryTargetWorld,
                this.carryMoveDuration,
                this.carryMoveEasing,
                this.carryRotation,
                this.carryScale
            );
            return;
        }
        this.defaultMoveToParent(item, anchor, this._carryTargetWorld, this.carryRotation, this.carryScale);
    }

    private ensureElementComponent(node: Node): SpawnZoneElement | null {
        if (!node.isValid) {
            return null;
        }
        let element = node.getComponent(SpawnZoneElement);
        if (!element) {
            element = node.addComponent(SpawnZoneElement);
        }
        return element ?? null;
    }

    private defaultMoveToParent(node: Node, parent: Node, worldTarget: Vec3, rotation?: Vec3, scale?: Vec3): void {
        Tween.stopAllByTarget(node);
        node.getWorldPosition(this._startWorldPos);
        parent.inverseTransformPoint(this._startLocalPos, this._startWorldPos);
        node.setParent(parent);
        node.setPosition(this._startLocalPos);
        if (rotation) {
            node.setRotationFromEuler(rotation.x, rotation.y, rotation.z);
        }
        if (scale) {
            node.setScale(scale.x, scale.y, scale.z);
        }

        parent.inverseTransformPoint(this._finalLocalPos, worldTarget);
        const localTarget = new Vec3(this._finalLocalPos.x, this._finalLocalPos.y, this._finalLocalPos.z);
        tween(node)
            .to(this.carryMoveDuration, { position: localTarget }, { easing: this.carryMoveEasing })
            .start();
    }

    private computeStackedPosition(out: Vec3, referenceNode: Node, slotIndex: number): void {
        const columns = Math.max(1, Math.floor(this.columns));
        const rows = Math.max(1, Math.floor(this.rows));
        const perLayer = columns * rows;
        const layerIndex = Math.floor(slotIndex / perLayer);
        const cellIndex = slotIndex % perLayer;
        const rowIndex = Math.floor(cellIndex / columns);
        const columnIndex = cellIndex % columns;

        referenceNode.getWorldPosition(this._baseWorldPos);
        const halfWidth = (columns - 1) * this.horizontalSpacing * 0.5;
        const halfDepth = (rows - 1) * this.depthSpacing * 0.5;

        out.set(
            this._baseWorldPos.x + columnIndex * this.horizontalSpacing - halfWidth,
            this._baseWorldPos.y + layerIndex * this.verticalSpacing,
            this._baseWorldPos.z + rowIndex * this.depthSpacing - halfDepth
        );
    }

    private acquireSlotIndex(): number {
        if (this._freeSlots.length > 0) {
            return this._freeSlots.shift() as number;
        }
        const slotIndex = this._nextSlotIndex;
        this._nextSlotIndex++;
        return slotIndex;
    }

    private releaseSlotIndex(slotIndex: number): void {
        let inserted = false;
        for (let i = 0; i < this._freeSlots.length; i++) {
            if (slotIndex < this._freeSlots[i]) {
                this._freeSlots.splice(i, 0, slotIndex);
                inserted = true;
                break;
            }
        }
        if (!inserted) {
            this._freeSlots.push(slotIndex);
        }
    }

    private getStartWorldPosition(out: Vec3): void {
        if (this.startPoint) {
            this.startPoint.getWorldPosition(out);
        } else {
            this.node.getWorldPosition(out);
        }
    }

    private resetStackLayout(): void {
        this._availableItems.length = 0;
        this._nodeSlotIndex.clear();
        this._freeSlots.length = 0;
        this._nextSlotIndex = 0;
    }
}
