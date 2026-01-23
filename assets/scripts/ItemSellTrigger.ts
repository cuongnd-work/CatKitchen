import { _decorator, Component, Node, Collider, ITriggerEvent, Vec3, tween, TweenEasing, Tween, Prefab, AudioSource } from 'cc';
import { UI_Joystick } from 'db://assets/kylins_easy_controller/UI_Joystick';
import { CollectibleItem } from './CollectibleItem';
import { SpawnZone } from './SpawnZone';
import { clearMoneyCarryShift, setMoneyCarryShift } from './MoneyCarryRegistry';
import { CustomersQueueManager } from 'db://assets/scripts/customers/CustomersQueueManager';
import { OrderPopup } from 'db://assets/scripts/OrderPopup';
import { object_pool_manager } from 'db://assets/plugins/playable-foundation/game-foundation/object_pool';
import { MoneyStackItem } from './MoneyStackItem';

type MoneyCarryBasis = {
    spacing: number;
    typeSpacing: number;
    baseX: number;
    baseY: number;
    baseZ: number;
};

const { ccclass, property } = _decorator;

@ccclass('ItemSellTrigger')
export class ItemSellTrigger extends Component {
    @property({ type: Node, tooltip: 'Character root that owns the carried items.' })
    public character: Node | null = null;

    @property({ type: Node, tooltip: 'Anchor node where collected prefabs are attached (defaults to character).' })
    public characterCarryAnchor: Node | null = null;

    @property({ type: [Node], tooltip: 'Additional characters allowed to sell through this trigger.' })
    public additionalCharacters: Node[] = [];

    @property({ type: [Node], tooltip: 'Carry anchors paired with additional characters (matching indices).' })
    public additionalCarryAnchors: Node[] = [];

    @property({ type: Node, tooltip: 'Destination node items fly toward when sold.' })
    public sellTarget: Node | null = null;

    @property({ type: Node, tooltip: 'Optional node with a Collider that detects the character (defaults to this node).' })
    public triggerArea: Node | null = null;

    @property({ tooltip: 'Collectible type identifier this trigger will sell (case insensitive).' })
    public sellTypeId = '';

    @property({ tooltip: 'Collectible type id used to trigger reward nodes when enough are sold.' })
    public thresholdItemTypeId = '';

    @property({ tooltip: 'Sale count required to activate the primary threshold node.', min: 0, step: 1 })
    public thresholdItemCountPrimary = 0;

    @property({ type: Node, tooltip: 'Node activated when the primary threshold is reached.' })
    public saleThresholdPrimaryNode: Node | null = null;

    @property({ tooltip: 'Sale count required to activate the secondary threshold node.', min: 0, step: 1 })
    public thresholdItemCountSecondary = 0;

    @property({ type: Node, tooltip: 'Node activated when the secondary threshold is reached.' })
    public saleThresholdSecondaryNode: Node | null = null;

    @property({ tooltip: 'Local stacking direction used to figure out the top item within the anchor.' })
    public stackDirection: Vec3 = new Vec3(0, 1, 0);

    @property({
        tooltip: 'Duration (seconds) for items moving from the character to the sell zone.',
        displayName: 'Character → Sell Duration',
    })
    public sellDuration = 0.35;

    @property({ tooltip: 'Tween easing while moving items toward the sellTarget.' })
    public sellEasing: TweenEasing = 'quadOut';

    @property({ tooltip: 'Local scale items tween toward while selling (use 1 to keep original size).' })
    public sellScale: Vec3 = new Vec3(1, 1, 1);

    @property({ tooltip: 'Grid columns used to arrange sold items on the sell target.', min: 1, step: 1 })
    public soldColumns = 4;

    @property({ tooltip: 'Grid rows used to arrange sold items on the sell target.', min: 1, step: 1 })
    public soldRows = 4;

    @property({ tooltip: 'Distance between columns when arranging sold items.' })
    public soldHorizontalSpacing = 0.35;

    @property({ tooltip: 'Distance between rows when arranging sold items.' })
    public soldDepthSpacing = 0.35;

    @property({ tooltip: 'Distance between sold item layers.' })
    public soldVerticalSpacing = 0.25;

    @property({ tooltip: 'Seconds between scans while waiting for new items.' })
    public rescanInterval = 0.1;

    @property({ type: CustomersQueueManager, tooltip: 'Queue manager used to find the front customer.' })
    public queueManager: CustomersQueueManager | null = null;

    @property({ tooltip: 'Zero-based queue column index served by this trigger (-1 to auto-detect using the character).', step: 1 })
    public queueColumnIndex = -1;

    @property({ tooltip: 'Seconds between attempts to deliver staged items to customers.' })
    public customerRescanInterval = 0.1;

    @property({
        tooltip: 'Duration (seconds) for items moving from the sell zone to the customer.',
        displayName: 'Sell → Customer Duration',
    })
    public deliverDuration = 0.6;

    @property({ tooltip: 'Tween easing applied while delivering staged items to the customer.' })
    public deliverEasing: TweenEasing = 'quadOut';

    @property({ tooltip: 'Scale items tween toward before reaching the customer.' })
    public deliverScale: Vec3 = new Vec3(0.1, 0.1, 0.1);

    @property({ tooltip: 'World offset applied on top of the customer node while delivering items.' })
    public customerOffset: Vec3 = new Vec3(0, 0.35, 0);

    @property({ tooltip: 'Complete/advance the customer as soon as delivery starts instead of waiting for the throw to finish.' })
    public completeCustomerOnDeliveryStart = false;

    @property({ tooltip: 'Always target the absolute front-most customer determined by the queue manager.' })
    public serveAbsoluteFrontCustomer = true;

    @property({ type: Prefab, tooltip: 'Prefab spawned on the money stack when an item is sold.' })
    public moneyPrefab: Prefab | null = null;

    @property({ type: Node, tooltip: 'Root transform where money bundles are stacked (4x4 grid).' })
    public moneyStackNode: Node | null = null;

    @property({ tooltip: 'Money stack grid columns.', min: 1, step: 1 })
    public moneyColumns = 4;

    @property({ tooltip: 'Money stack grid rows.', min: 1, step: 1 })
    public moneyRows = 4;

    @property({ tooltip: 'Money stack horizontal spacing.' })
    public moneyHorizontalSpacing = 0.35;

    @property({ tooltip: 'Money stack depth spacing.' })
    public moneyDepthSpacing = 0.35;

    @property({ tooltip: 'Money stack vertical spacing.' })
    public moneyVerticalSpacing = 0.25;

    @property({ tooltip: 'Money bundles collected per trigger check.', min: 1, step: 1 })
    public moneyCollectBatch = 4;

    @property({ tooltip: 'Duration (seconds) money rewards take to settle on the money stack.' })
    public moneySpawnDuration = 0.25;

    @property({ tooltip: 'Tween easing used while spawning money rewards onto the stack.' })
    public moneySpawnEasing: TweenEasing = 'quadOut';

    @property({ tooltip: 'Duration (seconds) to move collected money toward the character.' })
    public moneyCollectDuration = 0.25;

    @property({ tooltip: 'Tween easing for money collection.' })
    public moneyCollectEasing: TweenEasing = 'quadOut';

    @property({ tooltip: 'World offset applied when money reaches the character.' })
    public moneyCollectOffset: Vec3 = new Vec3(0, 0.35, 0);

    @property({ tooltip: 'Duration (seconds) money bundles take to slide into the carried stack.' })
    public moneyCarryAttachDuration = 0.15;

    @property({ tooltip: 'Tween easing used while money bundles settle onto the carried stack.' })
    public moneyCarryAttachEasing: TweenEasing = 'quadOut';

    @property({ tooltip: 'Local offset applied to the carried money stack relative to the character anchor.' })
    public moneyCarryOffset: Vec3 = new Vec3(0, 0, 0);

    @property({ tooltip: 'Local scale applied to carried money bundles.' })
    public moneyCarryScale: Vec3 = new Vec3(1, 1, 1);

    @property({ tooltip: 'Local stacking direction for carried money bundles.' })
    public moneyCarryDirection: Vec3 = new Vec3(0, 1, 0);

    @property({ tooltip: 'Spacing between carried money bundles.' })
    public moneyCarrySpacing = 0.08;

    @property({ tooltip: 'Spacing applied per non-money item type before the money stack.' })
    public moneyCarryTypeSpacing = 0.4;

    @property({ tooltip: 'Local axis used to push money behind other carried item types.' })
    public moneyCarryTypeAxis: Vec3 = new Vec3(0, 0, 1);

    @property({ type: AudioSource, tooltip: 'Sound played when an item moves from the character to the sell area.' })
    public sellAudio: AudioSource | null = null;

    private _sellQueue: Node[] = [];
    private _queuedItems: Set<Node> = new Set();
    private _characterOverlaps: Set<Collider> = new Set();
    private _characterInside = false;
    private _isSelling = false;
    private _stackAxis: Vec3 = new Vec3(0, 1, 0);
    private _worldTarget: Vec3 = new Vec3();
    private _localTemp: Vec3 = new Vec3();
    private _worldTemp: Vec3 = new Vec3();
    private _scaleTemp: Vec3 = new Vec3(1, 1, 1);
    private _soldSlotIndex: Map<Node, number> = new Map();
    private _soldNextSlotIndex = 0;
    private _rescanTimer = 0;
    private _activeItem: Node | null = null;
    private _moneySlotIndex: Map<Node, number> = new Map();
    private _moneyFreeSlots: number[] = [];
    private _moneyNextSlotIndex = 0;
    private _joystickInteractionActive = false;
    private _activeMoneyCollections: Set<Node> = new Set();
    private _moneyTargetWorld: Vec3 = new Vec3();
    private _moneyTargetLocal: Vec3 = new Vec3();
    private _moneyStackCollider: Collider | null = null;
    private _isCharacterAtMoneyStack = false;
    private _carriedMoney: Node[] = [];
    private _moneyCarryDir: Vec3 = new Vec3();
    private _moneyTypeAxis: Vec3 = new Vec3();
    private _moneyCarryShift = 0;
    private _moneyTypeOrder = 0;
    private _needsMoneyRelayout = false;
    private _moneyStackSpawnLocal: Vec3 = new Vec3();
    private _moneyCarryTargetLocal: Vec3 = new Vec3();
    private _sellerAnchors: Map<Node, Node | null> = new Map();
    private _runtimeSellers: Map<Node, Node | null> = new Map();
    private _activeSellerNode: Node | null = null;
    private _activeSellerAnchor: Node | null = null;
    private _soldTypeCounts: Map<string, number> = new Map();
    private _triggeredSaleNodes: Set<Node> = new Set();
    private _stagedItems: Node[] = [];
    private _soldFreeSlots: number[] = [];
    private _customerRescanTimer = 0;
    private _isDeliveringToCustomer = false;
    private _customerItem: Node | null = null;

    protected onLoad (): void {
        this.rebuildSellerAnchors();
    }

    update (deltaTime: number): void {
        this.updateSellingLoop(deltaTime);
        this.updateCustomerServing(deltaTime);
        this.collectMoneyBundles();
        this.updateMoneyCarryLayout();
    }

    public registerSeller (character: Node | null, anchor: Node | null): void {
        if (!character) {
            return;
        }
        this._runtimeSellers.set(character, anchor ?? character);
    }

    public unregisterSeller (character: Node | null): void {
        if (!character) {
            return;
        }
        this._runtimeSellers.delete(character);
        if (this._activeSellerNode === character) {
            this._activeSellerNode = null;
            this._activeSellerAnchor = null;
        }
    }

    private rebuildSellerAnchors (): void {
        this._sellerAnchors.clear();
        if (this.character) {
            this._sellerAnchors.set(this.character, this.characterCarryAnchor ?? this.character);
        }
        if (!this.additionalCharacters) {
            return;
        }
        for (let i = 0; i < this.additionalCharacters.length; i++) {
            const seller = this.additionalCharacters[i];
            if (!seller) {
                continue;
            }
            const anchor = (this.additionalCarryAnchors && this.additionalCarryAnchors[i]) ?? null;
            this._sellerAnchors.set(seller, anchor ?? seller);
        }
    }

    private resolveSellerBinding (candidate: Node | null): { node: Node, anchor: Node } | null {
        if (!candidate) {
            return null;
        }

        const entries: Array<[Node, Node | null]> = [];
        this._sellerAnchors.forEach((value, key) => entries.push([key, value]));
        this._runtimeSellers.forEach((value, key) => entries.push([key, value]));

        for (const [seller, anchor] of entries) {
            let current: Node | null = candidate;
            while (current) {
                if (current === seller) {
                    return { node: seller, anchor: anchor ?? seller };
                }
                current = current.parent;
            }
        }
        return null;
    }

    private updateActiveSellerAnchor (): void {
        if (!this._activeSellerNode) {
            this._activeSellerAnchor = null;
            return;
        }
        const binding = this.resolveSellerBinding(this._activeSellerNode);
        this._activeSellerAnchor = binding?.anchor ?? null;
    }

    protected onEnable (): void {
        this.registerColliderEvents();
        this.setupMoneyStackTrigger();
    }

    protected onDisable (): void {
        this.unregisterColliderEvents();
        this._characterInside = false;
        this._characterOverlaps.clear();
        this.stopAllSelling(true);
        this.stopCustomerDelivery();
        this.teardownMoneyStackTrigger();
        this.resetMoneyCollections();
        clearMoneyCarryShift(this.characterCarryAnchor ?? this.character);
    }

    private registerColliderEvents (): void {
        const collider = this.getTriggerCollider();
        if (!collider) {
            console.warn(`[ItemSellTrigger] ${this.node.name} is missing a Collider to detect the character.`);
            return;
        }
        collider.on('onTriggerEnter', this.onTriggerEnter, this);
        collider.on('onTriggerExit', this.onTriggerExit, this);
        collider.on('onTriggerStay', this.onTriggerStay, this);
    }

    private unregisterColliderEvents (): void {
        const collider = this.getTriggerCollider();
        if (!collider) {
            return;
        }
        collider.off('onTriggerEnter', this.onTriggerEnter, this);
        collider.off('onTriggerExit', this.onTriggerExit, this);
        collider.off('onTriggerStay', this.onTriggerStay, this);
    }

    private getTriggerCollider (): Collider | null {
        const node = this.triggerArea ?? this.node;
        if (!node) {
            return null;
        }
        return node.getComponent(Collider);
    }

    private resolveSellTarget (): Node | null {
        if (this.sellTarget) {
            return this.sellTarget;
        }
        return this.triggerArea ?? null;
    }

    private onTriggerEnter (event: ITriggerEvent): void {
        this.handleTriggerEvent(event, true);
    }

    private onTriggerStay (event: ITriggerEvent): void {
        this.handleTriggerEvent(event, true);
    }

    private onTriggerExit (event: ITriggerEvent): void {
        this.handleTriggerEvent(event, false);
    }

    private handleTriggerEvent (event: ITriggerEvent, inside: boolean): void {
        const otherCollider = event.otherCollider;
        const otherNode = otherCollider?.node ?? null;
        const binding = this.resolveSellerBinding(otherNode);
        if (!otherCollider || !binding) {
            return;
        }

        if (inside) {
            const previousInside = this._characterInside;
            this._characterOverlaps.add(otherCollider);
            this._activeSellerNode = binding.node;
            this._activeSellerAnchor = binding.anchor;
            if (!previousInside) {
                this._characterInside = true;
                this._rescanTimer = 0;
                this.beginJoystickInteraction();
            }
            return;
        }

        this._characterOverlaps.delete(otherCollider);
        if (this._characterInside && this._characterOverlaps.size === 0) {
            this._characterInside = false;
            this._activeSellerNode = null;
            this._activeSellerAnchor = null;
            this.stopAllSelling(true);
            this.endJoystickInteraction();
        }
    }

    private isCharacterNode (candidate: Node | null): boolean {
        return !!this.resolveSellerBinding(candidate);
    }

    private findMatchingItems (anchor: Node): Node[] {
        const normalized = this._stackAxis;
        normalized.set(this.stackDirection.x, this.stackDirection.y, this.stackDirection.z);
        if (normalized.lengthSqr() < 0.0001) {
            normalized.set(0, 1, 0);
        }
        normalized.normalize();

        const typeId = this.sellTypeId.trim();
        if (!typeId) {
            return [];
        }

        const results: Node[] = [];
        anchor.children.forEach((child) => {
            const collectible = child.getComponent(CollectibleItem);
            if (!collectible) {
                return;
            }
            if (!collectible.matchesType(typeId)) {
                return;
            }
            results.push(child);
        });

        results.sort((a, b) => {
            const posA = a.position;
            const posB = b.position;
            const dotA = normalized.x * posA.x + normalized.y * posA.y + normalized.z * posA.z;
            const dotB = normalized.x * posB.x + normalized.y * posB.y + normalized.z * posB.z;
            return dotB - dotA;
        });

        return results;
    }

    private collectMatchesIntoQueue (): void {
        const anchor = this._activeSellerAnchor ?? this.characterCarryAnchor ?? this.character;
        if (!anchor) {
            return;
        }

        const matches = this.findMatchingItems(anchor);
        matches.forEach((node) => {
            if (!node || !node.isValid || this._queuedItems.has(node)) {
                return;
            }
            this._queuedItems.add(node);
            this._sellQueue.push(node);
        });
    }

    private animateToSellTarget (item: Node): void {
        const sellTarget = this.resolveSellTarget();
        if (!sellTarget || !this._characterInside) {
            this.stopAllSelling(false);
            return;
        }

        const slotIndex = this.registerSoldItem(item);
        const parent = sellTarget;
        Tween.stopAllByTarget(item);
        item.getWorldPosition(this._worldTemp);
        parent.inverseTransformPoint(this._localTemp, this._worldTemp);
        item.setParent(parent);
        item.setPosition(this._localTemp);

        this.computeSoldStackPosition(this._worldTarget, parent, slotIndex);
        parent.inverseTransformPoint(this._localTemp, this._worldTarget);
        const targetLocal = new Vec3(this._localTemp.x, this._localTemp.y, this._localTemp.z);

        const targetScale = this._scaleTemp;
        targetScale.set(this.sellScale.x, this.sellScale.y, this.sellScale.z);

        this._isSelling = true;
        this._activeItem = item;
        this.playSellSound();
        tween(item)
            .to(
                Math.max(0, this.sellDuration),
                { position: targetLocal, scale: targetScale },
                { easing: this.sellEasing },
            )
            .call(() => {
                this._queuedItems.delete(item);
                this.applySoldSlotPosition(item, slotIndex);
                this.stageSoldItem(item, true);
                this._isSelling = false;
                this._activeItem = null;
                this._rescanTimer = 0;
            })
            .start();
    }

    private updateSellingLoop (deltaTime: number): void {
        if (!this._characterInside || this._isSelling) {
            return;
        }
        if (!this.resolveSellTarget()) {
            this.stopAllSelling(true);
            return;
        }

        this._rescanTimer -= deltaTime;
        if (this._sellQueue.length === 0 && this._rescanTimer <= 0) {
            this._rescanTimer = Math.max(0.02, this.rescanInterval);
            this.collectMatchesIntoQueue();
        }

        if (this._sellQueue.length === 0) {
            return;
        }

        this.processNextQueuedSale();
    }

    private processNextQueuedSale (): void {
        if (!this._characterInside) {
            return;
        }

        let nextItem: Node | undefined;
        while (this._sellQueue.length > 0 && !nextItem) {
            const candidate = this._sellQueue.shift() ?? null;
            if (!candidate) {
                continue;
            }
            this._queuedItems.delete(candidate);
            if (candidate.isValid) {
                nextItem = candidate;
            }
        }

        if (!nextItem) {
            return;
        }

        this.animateToSellTarget(nextItem);
    }

    private stopAllSelling (stopActiveTween: boolean): void {
        this._sellQueue.length = 0;
        this._queuedItems.clear();
        this._rescanTimer = 0;
        this._customerRescanTimer = 0;

        if (stopActiveTween || !this._isSelling) {
            this.stopActiveTween();
            this._isSelling = false;
        }
    }

    private stopActiveTween (): void {
        if (this._activeItem && this._activeItem.isValid) {
            Tween.stopAllByTarget(this._activeItem);
            const slotIndex = this._soldSlotIndex.get(this._activeItem);
            if (slotIndex !== undefined) {
                this.applySoldSlotPosition(this._activeItem, slotIndex);
            }
        }
        this._activeItem = null;
    }

    private registerSoldItem (item: Node): number {
        const existing = this._soldSlotIndex.get(item);
        if (existing !== undefined) {
            return existing;
        }

        this.releaseFromCarryAnchor(item);
        const slotIndex = this.acquireSoldSlotIndex();
        this._soldSlotIndex.set(item, slotIndex);
        return slotIndex;
    }

    private releaseFromCarryAnchor (item: Node): void {
        SpawnZone.releaseCarriedItemInternal(item);
    }

    private computeSoldStackPosition (out: Vec3, reference: Node, slotIndex: number): void {
        const columns = Math.max(1, Math.floor(this.soldColumns));
        const rows = Math.max(1, Math.floor(this.soldRows));
        const perLayer = columns * rows;

        const layerIndex = Math.floor(slotIndex / perLayer);
        const cellIndex = slotIndex % perLayer;
        const rowIndex = Math.floor(cellIndex / columns);
        const columnIndex = cellIndex % columns;

        reference.getWorldPosition(out);
        const baseX = out.x;
        const baseY = out.y;
        const baseZ = out.z;

        const halfWidth = (columns - 1) * this.soldHorizontalSpacing * 0.5;
        const halfDepth = (rows - 1) * this.soldDepthSpacing * 0.5;

        out.set(
            baseX + columnIndex * this.soldHorizontalSpacing - halfWidth,
            baseY + layerIndex * this.soldVerticalSpacing,
            baseZ + rowIndex * this.soldDepthSpacing - halfDepth,
        );
    }

    private applySoldSlotPosition (item: Node, slotIndex: number): void {
        const parent = this.resolveSellTarget();
        if (!parent || !item.isValid) {
            return;
        }

        this.computeSoldStackPosition(this._worldTarget, parent, slotIndex);
        parent.inverseTransformPoint(this._localTemp, this._worldTarget);
        item.setParent(parent);
        item.setPosition(this._localTemp);
        item.setScale(this.sellScale.x, this.sellScale.y, this.sellScale.z);
    }

    private acquireSoldSlotIndex (): number {
        if (this._soldFreeSlots.length > 0) {
            return this._soldFreeSlots.shift() as number;
        }

        const slotIndex = this._soldNextSlotIndex;
        this._soldNextSlotIndex++;
        return slotIndex;
    }

    private releaseSoldSlot (item: Node): void {
        const slotIndex = this._soldSlotIndex.get(item);
        if (slotIndex === undefined) {
            return;
        }

        this._soldSlotIndex.delete(item);

        let inserted = false;
        for (let i = 0; i < this._soldFreeSlots.length; i++) {
            if (slotIndex < this._soldFreeSlots[i]) {
                this._soldFreeSlots.splice(i, 0, slotIndex);
                inserted = true;
                break;
            }
        }

        if (!inserted) {
            this._soldFreeSlots.push(slotIndex);
        }
    }

    private stageSoldItem (item: Node, atFront = false, autoServe = true): void {
        if (!item || !item.isValid) {
            return;
        }

        if (this._stagedItems.indexOf(item) !== -1) {
            return;
        }

        if (atFront) {
            this._stagedItems.unshift(item);
        } else {
            this._stagedItems.push(item);
        }

        this.handleSaleThreshold(item);
        this._customerRescanTimer = 0;

        if (autoServe && !this._isDeliveringToCustomer) {
            this.tryServeCustomer();
        }
    }

    private handleSaleThreshold (item: Node | null): void {
        if (!item || !item.isValid) {
            return;
        }

        const target = this.thresholdItemTypeId?.trim().toLowerCase();
        if (!target) {
            return;
        }

        const collectible = item.getComponent(CollectibleItem);
        const typeId = collectible?.getTypeId().trim().toLowerCase();
        if (!typeId || typeId !== target) {
            return;
        }

        const next = (this._soldTypeCounts.get(target) ?? 0) + 1;
        this._soldTypeCounts.set(target, next);

        if (this.saleThresholdPrimaryNode && next >= Math.max(1, Math.floor(this.thresholdItemCountPrimary))) {
            this.saleThresholdPrimaryNode.active = true;
            this.saleThresholdPrimaryNode = null;
        }

        if (this.saleThresholdSecondaryNode && next >= Math.max(1, Math.floor(this.thresholdItemCountSecondary))) {
            this.saleThresholdSecondaryNode.active = true;
            this.saleThresholdSecondaryNode = null;
        }
    }

    private dequeueStagedItem (): Node | null {
        while (this._stagedItems.length > 0) {
            const candidate = this._stagedItems.shift() ?? null;
            if (candidate && candidate.isValid) {
                return candidate;
            }
        }

        return null;
    }

    private updateCustomerServing (deltaTime: number): void {
        if (this._stagedItems.length === 0) {
            this._customerRescanTimer = 0;
            return;
        }

        if (this._isDeliveringToCustomer) {
            return;
        }

        this._customerRescanTimer -= deltaTime;
        if (this._customerRescanTimer > 0) {
            return;
        }

        this._customerRescanTimer = Math.max(0.02, this.customerRescanInterval);
        this.tryServeCustomer();
    }

    private tryServeCustomer (): void {
        if (this._isDeliveringToCustomer || this._stagedItems.length === 0) {
            return;
        }

        const manager = this.resolveQueueManager();
        if (!manager) {
            return;
        }

        const columnIndex = this.serveAbsoluteFrontCustomer ? -1 : this.resolveTargetColumnIndex(manager);
        const customerNode = columnIndex >= 0
            ? manager.getFrontCustomerNode(columnIndex)
            : manager.getFrontMostCustomerNode();
        if (!customerNode || !customerNode.isValid) {
            return;
        }

        const orderPopup = customerNode.getComponentInChildren(OrderPopup);
        if (orderPopup && orderPopup.isSoldOut()) {
            return;
        }

        const item = this.dequeueStagedItem();
        if (!item) {
            return;
        }

        this.deliverItemToCustomer(item, customerNode, orderPopup ?? null, manager);
    }

    private resolveQueueManager (): CustomersQueueManager | null {
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

    private resolveTargetColumnIndex (manager: CustomersQueueManager): number {
        if (this.queueColumnIndex >= 0) {
            return Math.floor(this.queueColumnIndex);
        }

        if (this.character) {
            const detected = manager.getColumnIndexForNode(this.character);
            if (detected >= 0) {
                return detected;
            }
        }

        return -1;
    }

    private deliverItemToCustomer (item: Node, customerNode: Node, popup: OrderPopup | null, manager: CustomersQueueManager): void {
        if (!item || !item.isValid) {
            return;
        }

        const parent = item.parent ?? this.resolveSellTarget() ?? this.node;
        if (!parent) {
            return;
        }

        Tween.stopAllByTarget(item);
        const accepted = manager.beginServingCustomer(customerNode);
        if (!accepted) {
            this.stageSoldItem(item, true, false);
            this._customerItem = null;
            this._isDeliveringToCustomer = false;
            this._customerRescanTimer = 0;
            this.tryServeCustomer();
            return;
        }

        this.releaseSoldSlot(item);

        if (this.completeCustomerOnDeliveryStart) {
            manager.completeServingCustomer(customerNode);
        }

        this.computeCustomerTargetPosition(this._worldTarget, customerNode, popup);
        parent.inverseTransformPoint(this._localTemp, this._worldTarget);
        const targetLocal = new Vec3(this._localTemp.x, this._localTemp.y, this._localTemp.z);

        const targetScale = this._scaleTemp;
        targetScale.set(this.deliverScale.x, this.deliverScale.y, this.deliverScale.z);

        this._isDeliveringToCustomer = true;
        this._customerItem = item;

        tween(item)
            .to(
                Math.max(0.01, this.deliverDuration),
                { position: targetLocal, scale: targetScale },
                { easing: this.deliverEasing },
            )
            .call(() => {
                this.handleCustomerDeliveryComplete(item, popup, customerNode, manager);
            })
            .start();
    }

    private computeCustomerTargetPosition (out: Vec3, customerNode: Node, popup: OrderPopup | null): void {
        const targetNode = popup && popup.node && popup.node.isValid ? popup.node : customerNode;
        targetNode.getWorldPosition(out);
        out.x += this.customerOffset.x;
        out.y += this.customerOffset.y;
        out.z += this.customerOffset.z;
    }

    private handleCustomerDeliveryComplete (item: Node, popup: OrderPopup | null, customerNode: Node, manager: CustomersQueueManager): void {
        let soldOut = true;
        if (popup && popup.node && popup.node.isValid) {
            soldOut = popup.sell();
        }

        this.spawnMoneyReward();

        if (soldOut && customerNode && customerNode.isValid) {
            manager.completeServingCustomer(customerNode);
        }

        this.recycleSoldItem(item);
        this._customerItem = null;
        this._isDeliveringToCustomer = false;
        this._customerRescanTimer = 0;
        this.tryServeCustomer();
    }

    private recycleSoldItem (item: Node): void {
        if (!item || !item.isValid) {
            return;
        }

        object_pool_manager.instance.Recycle(item);
    }

    private spawnMoneyReward (): void {
        const prefab = this.moneyPrefab;
        const stackNode = this.moneyStackNode;
        if (!prefab || !stackNode) {
            return;
        }

        const reward = object_pool_manager.instance.Spawn(prefab);
        if (!reward) {
            return;
        }

        if (!stackNode || !stackNode.isValid) {
            object_pool_manager.instance.Recycle(reward);
            return;
        }

        reward.setScale(1, 1, 1);
        reward.setRotationFromEuler(0, 0, 0);
        reward.active = true;

        const collectible = reward.getComponent(CollectibleItem) ?? reward.addComponent(CollectibleItem);
        collectible.typeId = 'money';
        collectible.ensureTypeId();

        const info = reward.getComponent(MoneyStackItem) ?? reward.addComponent(MoneyStackItem);
        info.owner = this;

        const slotIndex = this.acquireMoneySlotIndex();
        info.slotIndex = slotIndex;
        this._moneySlotIndex.set(reward, slotIndex);

        const targetWorld = this._worldTarget;
        this.computeMoneyStackPosition(targetWorld, stackNode, slotIndex);

        const spawnReference = this.resolveSellTarget() ?? stackNode;
        spawnReference.getWorldPosition(this._worldTemp);
        stackNode.inverseTransformPoint(this._moneyStackSpawnLocal, this._worldTemp);

        stackNode.addChild(reward);
        reward.setPosition(this._moneyStackSpawnLocal);

        stackNode.inverseTransformPoint(this._localTemp, targetWorld);
        const targetLocal = new Vec3(this._localTemp.x, this._localTemp.y, this._localTemp.z);

        Tween.stopAllByTarget(reward);
        tween(reward)
            .to(
                Math.max(0.01, this.moneySpawnDuration),
                { position: targetLocal },
                { easing: this.moneySpawnEasing },
            )
            .call(() => {
                reward.setPosition(targetLocal);
            })
            .start();
    }

    private acquireMoneySlotIndex (): number {
        if (this._moneyFreeSlots.length > 0) {
            return this._moneyFreeSlots.shift() as number;
        }

        const slotIndex = this._moneyNextSlotIndex;
        this._moneyNextSlotIndex++;
        return slotIndex;
    }

    private releaseMoneySlotIndex (slotIndex: number): void {
        if (slotIndex < 0) {
            return;
        }

        let inserted = false;
        for (let i = 0; i < this._moneyFreeSlots.length; i++) {
            if (slotIndex < this._moneyFreeSlots[i]) {
                this._moneyFreeSlots.splice(i, 0, slotIndex);
                inserted = true;
                break;
            }
        }

        if (!inserted) {
            this._moneyFreeSlots.push(slotIndex);
        }
    }

    private computeMoneyStackPosition (out: Vec3, reference: Node, slotIndex: number): void {
        const columns = Math.max(1, Math.floor(this.moneyColumns));
        const rows = Math.max(1, Math.floor(this.moneyRows));
        const perLayer = columns * rows;

        const layerIndex = Math.floor(slotIndex / perLayer);
        const cellIndex = slotIndex % perLayer;
        const rowIndex = Math.floor(cellIndex / columns);
        const columnIndex = cellIndex % columns;

        reference.getWorldPosition(out);
        const baseX = out.x;
        const baseY = out.y;
        const baseZ = out.z;

        const halfWidth = (columns - 1) * this.moneyHorizontalSpacing * 0.5;
        const halfDepth = (rows - 1) * this.moneyDepthSpacing * 0.5;

        out.set(
            baseX + columnIndex * this.moneyHorizontalSpacing - halfWidth,
            baseY + layerIndex * this.moneyVerticalSpacing,
            baseZ + rowIndex * this.moneyDepthSpacing - halfDepth,
        );
    }

    private collectMoneyBundles (): void {
        if (!this._isCharacterAtMoneyStack || !this.moneyStackNode || !this.character) {
            return;
        }

        const children = this.moneyStackNode.children.slice();
        children.sort((a, b) => {
            const slotA = a ? (a.getComponent(MoneyStackItem)?.slotIndex ?? this._moneySlotIndex.get(a) ?? 0) : 0;
            const slotB = b ? (b.getComponent(MoneyStackItem)?.slotIndex ?? this._moneySlotIndex.get(b) ?? 0) : 0;
            return slotA - slotB;
        });

        const limit = Math.max(1, Math.floor(this.moneyCollectBatch));
        let collected = 0;
        for (let i = 0; i < children.length && collected < limit; i++) {
            const child = children[i];
            if (!child || !child.isValid || this._activeMoneyCollections.has(child)) {
                continue;
            }

            const collectible = child.getComponent(CollectibleItem);
            if (!collectible || !collectible.matchesType('money')) {
                continue;
            }

            const info = child.getComponent(MoneyStackItem);
            if (!info) {
                continue;
            }

            this.startCollectingMoneyBundle(child, info);
            collected++;
        }
    }

    private startCollectingMoneyBundle (bundle: Node, info: MoneyStackItem): void {
        const parent = bundle.parent;
        if (!parent || !this.character) {
            return;
        }

        this._activeMoneyCollections.add(bundle);
        this.character.getWorldPosition(this._moneyTargetWorld);
        this._moneyTargetWorld.add(this.moneyCollectOffset);
        parent.inverseTransformPoint(this._moneyTargetLocal, this._moneyTargetWorld);

        Tween.stopAllByTarget(bundle);
        tween(bundle)
            .to(
                Math.max(0.01, this.moneyCollectDuration),
                { position: new Vec3(this._moneyTargetLocal.x, this._moneyTargetLocal.y, this._moneyTargetLocal.z) },
                { easing: this.moneyCollectEasing },
            )
            .call(() => {
                this._activeMoneyCollections.delete(bundle);
                this.onMoneyBundleCollected(bundle);
                this.attachCollectedMoney(bundle);
            })
            .start();
    }

    public onMoneyBundleCollected (reward: Node): void {
        const info = reward.getComponent(MoneyStackItem);
        const slotIndex = info?.slotIndex ?? this._moneySlotIndex.get(reward) ?? -1;
        if (slotIndex >= 0) {
            this.releaseMoneySlotIndex(slotIndex);
        }
        this._moneySlotIndex.delete(reward);
        info?.reset();
    }

    private attachCollectedMoney (bundle: Node): void {
        const anchor = this.characterCarryAnchor ?? this.character;
        if (!anchor || !bundle || !bundle.isValid) {
            object_pool_manager.instance.Recycle(bundle);
            return;
        }

        const collectible = bundle.getComponent(CollectibleItem) ?? bundle.addComponent(CollectibleItem);
        collectible.typeId = 'money';
        collectible.ensureTypeId();

        bundle.getWorldPosition(this._worldTemp);
        bundle.removeFromParent();
        anchor.addChild(bundle);
        anchor.inverseTransformPoint(this._localTemp, this._worldTemp);
        bundle.setPosition(this._localTemp);
        bundle.setScale(this.moneyCarryScale.x, this.moneyCarryScale.y, this.moneyCarryScale.z);
        bundle.setRotationFromEuler(0, 0, 0);

        this._carriedMoney.push(bundle);
        this._moneyTypeOrder = this.resolveMoneyTypeOrder(anchor);

        const basis = this.computeMoneyCarryBasis();
        const dir = this._moneyCarryDir;
        const index = this._carriedMoney.length - 1;
        const targetLocal = new Vec3(
            basis.baseX + dir.x * index * basis.spacing,
            basis.baseY + dir.y * index * basis.spacing,
            basis.baseZ + dir.z * index * basis.spacing,
        );

        const duration = Math.max(0.01, this.moneyCarryAttachDuration);
        Tween.stopAllByTarget(bundle);
        tween(bundle)
            .to(duration, { position: targetLocal }, { easing: this.moneyCarryAttachEasing })
            .call(() => {
                bundle.setPosition(targetLocal);
            })
            .start();

        if (this._moneyTypeOrder === 0 && basis.typeSpacing > 0) {
            setMoneyCarryShift(anchor, this._moneyTypeAxis, basis.typeSpacing);
        } else {
            clearMoneyCarryShift(anchor);
        }
    }

    public withdrawMoneyBundles (count: number): Node[] {
        const results: Node[] = [];
        if (count <= 0 || this._carriedMoney.length === 0) {
            return results;
        }

        const anchor = this.characterCarryAnchor ?? this.character;
        const requested = Math.min(Math.floor(count), this._carriedMoney.length);
        for (let i = 0; i < requested; i++) {
            const bundle = this._carriedMoney.pop();
            if (!bundle || !bundle.isValid) {
                continue;
            }
            SpawnZone.releaseCarriedItemInternal(bundle);
            results.push(bundle);
        }

        if (results.length > 0 && anchor) {
            this._moneyTypeOrder = Math.min(this._moneyTypeOrder, this.resolveMoneyTypeOrder(anchor));
            this.relayoutCarriedMoney(anchor);
        }

        return results;
    }

    public recycleMoneyBundle (bundle: Node | null): void {
        if (!bundle) {
            return;
        }

        const index = this._carriedMoney.indexOf(bundle);
        if (index !== -1) {
            this._carriedMoney.splice(index, 1);
        }

        bundle.removeFromParent();
        object_pool_manager.instance.Recycle(bundle);
    }

    private updateMoneyCarryLayout (): void {
        if (this._carriedMoney.length === 0) {
            this._moneyCarryShift = 0;
            this._moneyTypeOrder = 0;
            this._needsMoneyRelayout = false;
            clearMoneyCarryShift(this.characterCarryAnchor ?? this.character);
            return;
        }

        const anchor = this.characterCarryAnchor ?? this.character;
        if (!anchor) {
            clearMoneyCarryShift(null);
            return;
        }

        const nextOrder = this.resolveMoneyTypeOrder(anchor);
        if (nextOrder !== this._moneyTypeOrder) {
            this._moneyTypeOrder = nextOrder;
            this._needsMoneyRelayout = true;
        }

        for (let i = 0; i < this._carriedMoney.length; i++) {
            const node = this._carriedMoney[i];
            if (!node || !node.isValid) {
                this._carriedMoney.splice(i, 1);
                i--;
                this._needsMoneyRelayout = true;
                continue;
            }
        }

        if (!this._needsMoneyRelayout) {
            return;
        }

        this.relayoutCarriedMoney(anchor);
        this._needsMoneyRelayout = false;
    }

    private resolveMoneyTypeOrder (anchor: Node): number {
        const tracked = SpawnZone.getAnchorTypeCount(anchor);
        if (tracked > 0) {
            return tracked;
        }
        return this.countNonMoneyChildren(anchor);
    }

    private countNonMoneyChildren (anchor: Node): number {
        let count = 0;
        const children = anchor.children;
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            if (!child || !child.isValid) {
                continue;
            }

            if (this._carriedMoney.indexOf(child) !== -1) {
                continue;
            }

            const collectible = child.getComponent(CollectibleItem);
            if (!collectible || collectible.matchesType('money')) {
                continue;
            }
            count++;
        }
        return count;
    }

    private computeMoneyCarryBasis (): MoneyCarryBasis {
        const dir = this._moneyCarryDir;
        dir.set(this.moneyCarryDirection.x, this.moneyCarryDirection.y, this.moneyCarryDirection.z);
        if (dir.lengthSqr() < 0.0001) {
            dir.set(0, 1, 0);
        }
        dir.normalize();

        const axis = this._moneyTypeAxis;
        axis.set(this.moneyCarryTypeAxis.x, this.moneyCarryTypeAxis.y, this.moneyCarryTypeAxis.z);
        if (axis.lengthSqr() < 0.0001) {
            axis.set(0, 0, 1);
        }
        axis.normalize();

        const typeSpacing = Math.max(0, this.moneyCarryTypeSpacing);
        const spacing = Math.max(0, this.moneyCarrySpacing);
        const carryShift = Math.max(0, this._moneyTypeOrder) * typeSpacing;
        this._moneyCarryShift = carryShift;

        const offset = this.moneyCarryOffset;
        return {
            spacing,
            typeSpacing,
            baseX: offset.x + axis.x * carryShift,
            baseY: offset.y + axis.y * carryShift,
            baseZ: offset.z + axis.z * carryShift,
        };
    }

    private relayoutCarriedMoney (anchor: Node): void {
        if (!anchor) {
            clearMoneyCarryShift(null);
            return;
        }

        const basis = this.computeMoneyCarryBasis();
        const dir = this._moneyCarryDir;

        for (let i = 0; i < this._carriedMoney.length; i++) {
            const node = this._carriedMoney[i];
            if (!node || !node.isValid) {
                this._carriedMoney.splice(i, 1);
                i--;
                continue;
            }

            if (node.parent !== anchor) {
                anchor.addChild(node);
            }

            node.setScale(this.moneyCarryScale.x, this.moneyCarryScale.y, this.moneyCarryScale.z);
            node.setRotationFromEuler(0, 0, 0);
            node.setPosition(
                basis.baseX + dir.x * i * basis.spacing,
                basis.baseY + dir.y * i * basis.spacing,
                basis.baseZ + dir.z * i * basis.spacing,
            );
        }

        if (this._carriedMoney.length === 0 || basis.typeSpacing <= 0) {
            clearMoneyCarryShift(anchor);
        } else if (this._moneyTypeOrder === 0) {
            setMoneyCarryShift(anchor, this._moneyTypeAxis, basis.typeSpacing);
        } else {
            clearMoneyCarryShift(anchor);
        }
    }

    private setupMoneyStackTrigger (): void {
        this.teardownMoneyStackTrigger();
        const stackNode = this.moneyStackNode;
        if (!stackNode) {
            return;
        }

        const collider = stackNode.getComponent(Collider);
        if (!collider) {
            console.warn(`[ItemSellTrigger] ${this.node.name} moneyStackNode is missing a Collider for collection.`);
            return;
        }

        this._moneyStackCollider = collider;
        collider.on('onTriggerEnter', this.onMoneyStackTriggerEnter, this);
        collider.on('onTriggerStay', this.onMoneyStackTriggerEnter, this);
        collider.on('onTriggerExit', this.onMoneyStackTriggerExit, this);
    }

    private teardownMoneyStackTrigger (): void {
        if (!this._moneyStackCollider) {
            return;
        }

        const collider = this._moneyStackCollider;
        collider.off('onTriggerEnter', this.onMoneyStackTriggerEnter, this);
        collider.off('onTriggerStay', this.onMoneyStackTriggerEnter, this);
        collider.off('onTriggerExit', this.onMoneyStackTriggerExit, this);
        this._moneyStackCollider = null;
        this._isCharacterAtMoneyStack = false;
    }

    private onMoneyStackTriggerEnter (event: ITriggerEvent): void {
        this.handleMoneyStackTrigger(event, true);
    }

    private onMoneyStackTriggerExit (event: ITriggerEvent): void {
        this.handleMoneyStackTrigger(event, false);
    }

    private handleMoneyStackTrigger (event: ITriggerEvent, inside: boolean): void {
        const otherNode = event.otherCollider?.node;
        if (!otherNode || !this.isCharacterNode(otherNode)) {
            return;
        }

        this.setMoneyStackOverlap(inside);
    }

    public setMoneyStackOverlap (state: boolean): void {
        this._isCharacterAtMoneyStack = state;
        if (!state) {
            this.resetMoneyCollections();
        }
    }

    private stopCustomerDelivery (): void {
        if (!this._customerItem) {
            this._isDeliveringToCustomer = false;
            return;
        }

        const item = this._customerItem;
        this._customerItem = null;
        this._isDeliveringToCustomer = false;

        if (!item || !item.isValid) {
            return;
        }

        Tween.stopAllByTarget(item);
        const slotIndex = this.registerSoldItem(item);
        this.applySoldSlotPosition(item, slotIndex);
        this.stageSoldItem(item, true, false);
    }

    private resetMoneyCollections (): void {
        const pending: Node[] = [];
        this._activeMoneyCollections.forEach((node) => {
            if (node && node.isValid) {
                Tween.stopAllByTarget(node);
                pending.push(node);
            }
        });
        this._activeMoneyCollections.clear();

        pending.forEach((node) => {
            if (!node || !node.isValid) {
                return;
            }
            this.onMoneyBundleCollected(node);
            this.attachCollectedMoney(node);
        });
    }

    private playSellSound (): void {
        if (!this.sellAudio) {
            return;
        }
        this.sellAudio.stop();
        this.sellAudio.play();
    }

    private beginJoystickInteraction (): void {
        if (!this._joystickInteractionActive) {
            UI_Joystick.beginExternalInteraction();
            this._joystickInteractionActive = true;
        }
    }

    private endJoystickInteraction (): void {
        if (this._joystickInteractionActive) {
            UI_Joystick.endExternalInteraction();
            this._joystickInteractionActive = false;
        }
    }
}
