import { _decorator, Component, Node, Prefab, Collider, ITriggerEvent, Vec3, Quat, macro, tween, Tween, TweenEasing, AudioSource } from 'cc';
import { object_pool_manager } from 'db://assets/plugins/playable-foundation/game-foundation/object_pool';
import { CollectibleItem } from './CollectibleItem';
import { getMoneyCarryShift } from './MoneyCarryRegistry';
import { UI_Joystick } from 'db://assets/kylins_easy_controller/UI_Joystick';
const { ccclass, property } = _decorator;

const EVENT_TRIGGER_ENTER = 'onTriggerEnter';
const EVENT_TRIGGER_EXIT = 'onTriggerExit';

type SpawnedSlotEntry = {
    node: Node;
    slotIndex: number;
};

type AnchorCarryState = {
    items: Node[];
    typeOrder: string[];
    typeCounts: Map<string, number>;
    typeKeys: Map<Node, string>;
    destroyHandlers: Map<Node, () => void>;
};

@ccclass('SpawnZone')
export class SpawnZone extends Component {
    private static _anchorCarryStates: Map<Node, AnchorCarryState> = new Map();

    public static releaseCarriedItemInternal (node: Node | null): void {
        if (!node) {
            return;
        }
        for (const [, state] of SpawnZone._anchorCarryStates) {
            const handler = state.destroyHandlers.get(node);
            if (handler) {
                handler();
                break;
            }
        }
    }

    public static getAnchorTypeCount (anchor: Node | null): number {
        if (!anchor) {
            return 0;
        }
        const state = SpawnZone._anchorCarryStates.get(anchor);
        if (!state) {
            return 0;
        }
        return state.typeOrder.length;
    }

    @property({ type: Node, tooltip: 'Character node to watch for trigger overlap.' })
    public character: Node | null = null;

    @property({ type: [Node], tooltip: 'Additional characters allowed to spawn and collect from this zone.' })
    public additionalCollectors: Node[] = [];

    @property({ type: [Node], tooltip: 'Carry anchors paired with additional collectors (matching indices).' })
    public additionalCarryAnchors: Node[] = [];

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

    @property({ tooltip: 'Maximum distinct collectible types the character can carry at the same time.' })
    public maxCarryTypes = 2;

    @property({ tooltip: 'Z-axis offset (character space) applied per item type after the first (e.g. 0.4 keeps the second type 0.4 units behind).' })
    public typeZOffsetSpacing = 0.4;

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

    @property({ type: AudioSource, tooltip: 'Sound played each time an item spawns.' })
    public spawnAudio: AudioSource | null = null;

    @property({ type: AudioSource, tooltip: 'Sound played when an item begins moving toward the character.' })
    public collectAudio: AudioSource | null = null;

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
    private _collectibleLookup: Map<Node, CollectibleItem> = new Map();
    private _isCharacterInCollectTrigger = false;
    private _isCollectingScheduled = false;
    private _collectTriggerCollider: Collider | null = null;
    private _carryTargetWorld: Vec3 = new Vec3();
    private _carryOffsetWorld: Vec3 = new Vec3();
    private _anchorWorldRotation: Quat = new Quat();
    private _carryStackWorld: Vec3 = new Vec3();
    private _typeOffsetWorld: Vec3 = new Vec3();
    private _moneyCarryLocal: Vec3 = new Vec3();
    private _moneyCarryWorld: Vec3 = new Vec3();

    @property
    public isActiveAutoSpawn : boolean = false;

    @property({ tooltip: 'Maximum number of items that can exist in the spawn zone at once (0 disables the cap).', min: 0, step: 1 })
    public maxSpawnedItems = 500;

    private _nodeSlotIndex: Map<Node, number> = new Map();
    private _freeSlots: number[] = [];
    private _nextSlotIndex = 0;
    private _autoCollectEnabled = false;
    private _collectorAnchors: Map<Node, Node | null> = new Map();
    private _runtimeCollectors: Map<Node, Node | null> = new Map();
    private _spawnActiveCollectors: Set<Node> = new Set();
    private _collectActiveCollectors: Set<Node> = new Set();
    private _activeCollectorNode: Node | null = null;
    private _activeCollectorAnchor: Node | null = null;
    private _joystickInteractionRefs = 0;

    private getCarryState(anchor: Node | null, autoCreate = false): AnchorCarryState | null {
        if (!anchor) {
            return null;
        }
        let state = SpawnZone._anchorCarryStates.get(anchor) ?? null;
        if (!state && autoCreate) {
            state = {
                items: [],
                typeOrder: [],
                typeCounts: new Map(),
                typeKeys: new Map(),
                destroyHandlers: new Map(),
            };
            SpawnZone._anchorCarryStates.set(anchor, state);
        }
        return state;
    }

    protected onLoad (): void {
        this.rebuildCollectorAnchors();
    }

    start() {
        if(this.isActiveAutoSpawn){
            this._spawnActiveCollectors.add(this.node);
            if (!this._isCharacterInside) {
                this._isCharacterInside = true;
                this.startSpawning();
            }
        }
    }

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
        this.clearJoystickInteractions();
    }

    private onTriggerEnter(event: ITriggerEvent): void {
        const otherNode = event.otherCollider?.node ?? null;
        const binding = this.getCollectorAnchorFor(otherNode);
        if (!binding) {
            return;
        }
        const wasEmpty = this._spawnActiveCollectors.size === 0;
        this._spawnActiveCollectors.add(binding.node);
        if (wasEmpty) {
            this.incrementJoystickInteraction();
        }
        if (!this._isCharacterInside) {
            this._isCharacterInside = true;
            this.startSpawning();
        }
    }

    private onTriggerExit(event: ITriggerEvent): void {
        const otherNode = event.otherCollider?.node ?? null;
        const binding = this.getCollectorAnchorFor(otherNode);
        if (!binding) {
            return;
        }
        this._spawnActiveCollectors.delete(binding.node);
        if (this._spawnActiveCollectors.size === 0) {
            this.decrementJoystickInteraction();
        }
        if (!this._autoCollectEnabled && this._spawnActiveCollectors.size === 0) {
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
        const otherNode = event.otherCollider?.node ?? null;
        const binding = this.getCollectorAnchorFor(otherNode);
        if (!binding) {
            return;
        }
        const wasEmpty = this._collectActiveCollectors.size === 0;
        this._collectActiveCollectors.add(binding.node);
        this._activeCollectorNode = binding.node;
        this._activeCollectorAnchor = binding.anchor;
        this._isCharacterInCollectTrigger = true;
        this.startCollecting();
        if (wasEmpty) {
            this.incrementJoystickInteraction();
        }
    }

    private onCollectTriggerExit(event: ITriggerEvent): void {
        const otherNode = event.otherCollider?.node ?? null;
        const binding = this.getCollectorAnchorFor(otherNode);
        if (!binding) {
            return;
        }
        this._collectActiveCollectors.delete(binding.node);
        if (binding.node === this._activeCollectorNode) {
            const iterator = this._collectActiveCollectors.values().next();
            if (!iterator.done) {
                this._activeCollectorNode = iterator.value;
                this.updateActiveCollectorAnchor();
            } else {
                this._activeCollectorNode = null;
                this._activeCollectorAnchor = null;
            }
        }

        if (this._collectActiveCollectors.size === 0) {
            this._isCharacterInCollectTrigger = false;
            this.stopCollecting();
            this.decrementJoystickInteraction();
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

    public setAutoCollectEnabled(state: boolean): void {
        if (this._autoCollectEnabled === state) {
            return;
        }
        this._autoCollectEnabled = state;

        if (state) {
            this._isCharacterInside = true;
            this.startSpawning();
        } else {
            if (this._spawnActiveCollectors.size === 0) {
                this._isCharacterInside = false;
                this.stopSpawning();
            } else {
                this._isCharacterInside = true;
            }
        }
    }

    private collectNextPrefab(): void {
        if (!this._isCharacterInCollectTrigger) {
            return;
        }
        const entry = this.getNextQueuedEntry();
        if (!entry) {
            return;
        }
        const anchor = this._activeCollectorAnchor ?? this.characterCarryAnchor ?? this.character;
        if (!anchor) {
            return;
        }
        const carried = this.transferItemToCharacter(entry.node, anchor);
        if (carried) {
            this.releaseSlotIndex(entry.slotIndex);
            this.playCollectSound();
            return;
        }
        this.queueSpawnEntry(entry);
    }

    private spawnPrefab(): void {
        if (!this._isCharacterInside || !this.prefabToSpawn) {
            return;
        }
        if (this.maxSpawnedItems > 0 && this._availableItems.length >= this.maxSpawnedItems) {
            return;
        }
        const targetParent = this.spawnParent ?? this.node;
        const spawned = object_pool_manager.instance.Spawn(this.prefabToSpawn, undefined, undefined, targetParent);
        if (!spawned) {
            return;
        }
        this.ensureCollectibleItem(spawned);
        const slotIndex = this.acquireSlotIndex();
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

        this.playSpawnSound();
    }

    private getNextQueuedEntry(): SpawnedSlotEntry | null {
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
        return entry;
    }

    private queueSpawnEntry(entry: SpawnedSlotEntry): void {
        const node = entry.node;
        if (!node || !node.isValid) {
            this.releaseSlotIndex(entry.slotIndex);
            if (node) {
                this._nodeSlotIndex.delete(node);
            }
            return;
        }

        this._nodeSlotIndex.set(node, entry.slotIndex);
        this._availableItems.push(entry);
    }

    private transferItemToCharacter(item: Node, anchorOverride?: Node | null): boolean {
        const anchor = anchorOverride ?? this.characterCarryAnchor ?? this.character;
        if (!anchor) {
            console.warn(`[SpawnZone] ${this.node.name} needs characterCarryAnchor or character assigned to move prefabs to the player.`);
            return false;
        }

        const state = this.getCarryState(anchor, true);
        if (!state) {
            return false;
        }

        const collectible = this.ensureCollectibleItem(item);
        const rawTypeId = collectible?.getTypeId() ?? item.name ?? '';
        const typeKey = this.resolveTypeKey(rawTypeId);
        const typeSlot = this.getOrRegisterTypeSlot(state, typeKey);
        if (typeSlot === -1) {
            return false;
        }

        state.items.push(item);
        this.incrementTypeCount(state, typeKey);
        this.registerCollectedItemCleanup(anchor, state, item, typeKey);

        this.relayoutTypeColumn(anchor, state, typeKey);
        return true;
    }

    private ensureCollectibleItem(node: Node): CollectibleItem | null {
        if (!node || !node.isValid) {
            return null;
        }

        let collectible = this._collectibleLookup.get(node);
        if (!collectible || !collectible.node.isValid) {
            collectible = node.getComponent(CollectibleItem) ?? node.addComponent(CollectibleItem);
        }

        if (!collectible) {
            return null;
        }

        collectible.ensureTypeId();
        this._collectibleLookup.set(node, collectible);
        return collectible;
    }

    public getCollectibleForNode(target: Node | null): CollectibleItem | null {
        if (!target) {
            return null;
        }

        const collectible = this._collectibleLookup.get(target);
        if (collectible) {
            if (collectible.node.isValid) {
                return collectible;
            }
            this._collectibleLookup.delete(target);
        }

        return this.ensureCollectibleItem(target);
    }

    public getCollectedCollectibles(): CollectibleItem[] {
        const results: CollectibleItem[] = [];
        const anchor = this.characterCarryAnchor ?? this.character;
        const state = this.getCarryState(anchor);
        if (!state) {
            return results;
        }

        state.items.forEach((node) => {
            const collectible = this.getCollectibleForNode(node);
            if (collectible) {
                results.push(collectible);
            }
        });
        return results;
    }

    public getCollectedItemTypes(): string[] {
        const types: string[] = [];
        const anchor = this.characterCarryAnchor ?? this.character;
        const state = this.getCarryState(anchor);
        if (!state) {
            return types;
        }

        state.items.forEach((node) => {
            const collectible = this.getCollectibleForNode(node);
            if (collectible) {
                const typeId = collectible.getTypeId();
                if (typeId.length > 0) {
                    types.push(typeId);
                }
            }
        });
        return types;
    }

    public releaseCollectedItem(node: Node | null): void {
        if (!node) {
            return;
        }

        const anchor = this.characterCarryAnchor ?? this.character;
        const state = this.getCarryState(anchor);
        if (!anchor || !state) {
            return;
        }

        const typeKey = state.typeKeys.get(node);
        if (!typeKey) {
            return;
        }

        this.onCollectedItemReleased(anchor, state, node, typeKey);
    }

    private getOrRegisterTypeSlot(state: AnchorCarryState, typeKey: string): number {
        const existing = state.typeOrder.indexOf(typeKey);
        if (existing !== -1) {
            return existing;
        }

        const maxTypes = Math.max(1, Math.floor(this.maxCarryTypes));
        if (state.typeOrder.length >= maxTypes) {
            return -1;
        }

        state.typeOrder.push(typeKey);
        return state.typeOrder.length - 1;
    }

    private incrementTypeCount(state: AnchorCarryState, typeKey: string): void {
        const current = state.typeCounts.get(typeKey) ?? 0;
        state.typeCounts.set(typeKey, current + 1);
    }

    private computeCarryWorldTargetFrom(anchorWorldPos: Vec3, anchorWorldRot: Quat, typeSlot: number, stackIndex: number, out: Vec3): void {
        out.set(anchorWorldPos);

        if (this.carryOffset.x !== 0 || this.carryOffset.y !== 0 || this.carryOffset.z !== 0) {
            this._carryOffsetWorld.set(this.carryOffset.x, this.carryOffset.y, this.carryOffset.z);
            Vec3.transformQuat(this._carryOffsetWorld, this._carryOffsetWorld, anchorWorldRot);
            Vec3.add(out, out, this._carryOffsetWorld);
        }

        if (stackIndex > 0 && this.carryVerticalSpacing !== 0) {
            if (this.carryStackDirection.x !== 0 || this.carryStackDirection.y !== 0 || this.carryStackDirection.z !== 0) {
                this._carryStackWorld.set(this.carryStackDirection.x, this.carryStackDirection.y, this.carryStackDirection.z);
                Vec3.transformQuat(this._carryStackWorld, this._carryStackWorld, anchorWorldRot);
                if (this._carryStackWorld.lengthSqr() > 0.0001) {
                    this._carryStackWorld.normalize();
                    this._carryStackWorld.multiplyScalar(stackIndex * this.carryVerticalSpacing);
                    Vec3.add(out, out, this._carryStackWorld);
                }
            } else {
                out.y += stackIndex * this.carryVerticalSpacing;
            }
        }

        if (typeSlot > 0 && this.typeZOffsetSpacing !== 0) {
            this._typeOffsetWorld.set(0, 0, typeSlot * this.typeZOffsetSpacing);
            Vec3.transformQuat(this._typeOffsetWorld, this._typeOffsetWorld, anchorWorldRot);
            Vec3.add(out, out, this._typeOffsetWorld);
        }
    }

    public registerCollector (character: Node | null, anchor: Node | null): void {
        if (!character) {
            return;
        }
        this._runtimeCollectors.set(character, anchor ?? character);
    }

    public unregisterCollector (character: Node | null): void {
        if (!character) {
            return;
        }
        this._runtimeCollectors.delete(character);
        this._spawnActiveCollectors.delete(character);
        this._collectActiveCollectors.delete(character);
        if (this._activeCollectorNode === character) {
            this._activeCollectorNode = null;
            this._activeCollectorAnchor = null;
        }
    }

    private rebuildCollectorAnchors (): void {
        this._collectorAnchors.clear();
        if (this.character) {
            this._collectorAnchors.set(this.character, this.characterCarryAnchor ?? this.character);
        }
        if (!this.additionalCollectors) {
            return;
        }
        for (let i = 0; i < this.additionalCollectors.length; i++) {
            const collector = this.additionalCollectors[i];
            if (!collector) {
                continue;
            }
            const anchor = (this.additionalCarryAnchors && this.additionalCarryAnchors[i]) ?? null;
            this._collectorAnchors.set(collector, anchor ?? collector);
        }
    }

    private getCollectorAnchorFor (candidate: Node | null): { node: Node, anchor: Node } | null {
        if (!candidate) {
            return null;
        }

        const entries: Array<[Node, Node | null]> = [];
        this._collectorAnchors.forEach((value, key) => {
            entries.push([key, value]);
        });
        this._runtimeCollectors.forEach((value, key) => {
            entries.push([key, value]);
        });

        for (const [collector, anchor] of entries) {
            let current: Node | null = candidate;
            while (current) {
                if (current === collector) {
                    return { node: collector, anchor: (anchor ?? collector) };
                }
                current = current.parent;
            }
        }
        return null;
    }

    private updateActiveCollectorAnchor (): void {
        if (!this._activeCollectorNode) {
            this._activeCollectorAnchor = null;
            return;
        }
        const binding = this.getCollectorAnchorFor(this._activeCollectorNode);
        this._activeCollectorAnchor = binding?.anchor ?? null;
    }

    private relayoutTypeColumn(anchor: Node, state: AnchorCarryState, typeKey: string): void {
        const typeSlot = state.typeOrder.indexOf(typeKey);
        if (typeSlot === -1) {
            return;
        }

        const worldPos = this._baseWorldPos;
        const worldRot = this._anchorWorldRotation;
        anchor.getWorldPosition(worldPos);
        anchor.getWorldRotation(worldRot);

        const moneyShift = getMoneyCarryShift(anchor, this._moneyCarryLocal);
        if (moneyShift <= 0) {
            this._moneyCarryLocal.set(0, 0, 0);
        }

        const nodes: Node[] = [];
        state.items.forEach((node) => {
            if (!node || !node.isValid) {
                return;
            }
            if (state.typeKeys.get(node) === typeKey) {
                nodes.push(node);
            }
        });

        nodes.forEach((node, index) => {
            this.computeCarryWorldTargetFrom(worldPos, worldRot, typeSlot, index, this._carryTargetWorld);
            if (moneyShift > 0) {
                this._moneyCarryWorld.set(this._moneyCarryLocal.x, this._moneyCarryLocal.y, this._moneyCarryLocal.z);
                Vec3.transformQuat(this._moneyCarryWorld, this._moneyCarryWorld, worldRot);
                this._moneyCarryWorld.multiplyScalar(moneyShift);
                Vec3.add(this._carryTargetWorld, this._carryTargetWorld, this._moneyCarryWorld);
            }
            this.defaultMoveToParent(node, anchor, this._carryTargetWorld, this.carryRotation, this.carryScale);
        });
    }

    private relayoutAllColumns(anchor: Node, state: AnchorCarryState): void {
        state.typeOrder.forEach((typeKey) => {
            this.relayoutTypeColumn(anchor, state, typeKey);
        });
    }

    private resolveTypeKey(typeId: string): string {
        const trimmed = typeId?.trim();
        if (trimmed && trimmed.length > 0) {
            return trimmed;
        }
        return '__default__';
    }

    private registerCollectedItemCleanup(anchor: Node, state: AnchorCarryState, node: Node, typeKey: string): void {
        if (!node || !node.isValid) {
            return;
        }

        state.typeKeys.set(node, typeKey);
        const handler = () => {
            this.onCollectedItemReleased(anchor, state, node, typeKey);
        };
        state.destroyHandlers.set(node, handler);
        node.on(Node.EventType.NODE_DESTROYED, handler, this);
    }

    private onCollectedItemReleased(anchor: Node, state: AnchorCarryState, node: Node, typeKey: string): void {
        this.unregisterCollectedItemCleanup(state, node);
        state.typeKeys.delete(node);
        this.removeCollectedItemReference(state, node);

        const current = state.typeCounts.get(typeKey);
        if (current === undefined) {
            return;
        }

        if (current <= 1) {
            state.typeCounts.delete(typeKey);
            const orderIndex = state.typeOrder.indexOf(typeKey);
            if (orderIndex !== -1) {
                state.typeOrder.splice(orderIndex, 1);
            }
            this.relayoutAllColumns(anchor, state);
        } else {
            state.typeCounts.set(typeKey, current - 1);
            this.relayoutTypeColumn(anchor, state, typeKey);
        }

        this.cleanupAnchorCarryState(anchor, state);
    }

    private removeCollectedItemReference(state: AnchorCarryState, node: Node): void {
        const index = state.items.indexOf(node);
        if (index !== -1) {
            state.items.splice(index, 1);
        }
    }

    private unregisterCollectedItemCleanup(state: AnchorCarryState, node: Node): void {
        const handler = state.destroyHandlers.get(node);
        if (!handler) {
            return;
        }
        node.off(Node.EventType.NODE_DESTROYED, handler, this);
        state.destroyHandlers.delete(node);
    }

    private cleanupAnchorCarryState(anchor: Node, state: AnchorCarryState): void {
        if (state.items.length > 0) {
            return;
        }
        state.typeOrder.length = 0;
        state.typeCounts.clear();
        state.typeKeys.clear();
        state.destroyHandlers.clear();
        SpawnZone._anchorCarryStates.delete(anchor);
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

    private playSpawnSound (): void {
        if (!this.spawnAudio || this.isActiveAutoSpawn || this._autoCollectEnabled) {
            return;
        }
        this.spawnAudio.stop();
        this.spawnAudio.play();
    }

    private playCollectSound (): void {
        if (!this.collectAudio) {
            return;
        }
        this.collectAudio.stop();
        this.collectAudio.play();
    }

    private incrementJoystickInteraction (): void {
        this._joystickInteractionRefs++;
        if (this._joystickInteractionRefs === 1) {
            UI_Joystick.beginExternalInteraction();
        }
    }

    private decrementJoystickInteraction (): void {
        if (this._joystickInteractionRefs === 0) {
            return;
        }
        this._joystickInteractionRefs--;
        if (this._joystickInteractionRefs === 0) {
            UI_Joystick.endExternalInteraction();
        }
    }

    private clearJoystickInteractions (): void {
        while (this._joystickInteractionRefs > 0) {
            this._joystickInteractionRefs--;
            UI_Joystick.endExternalInteraction();
        }
    }
}

export function releaseCarriedItem (node: Node | null): void {
    SpawnZone.releaseCarriedItemInternal(node);
}
