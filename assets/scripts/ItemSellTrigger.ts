import { _decorator, Component, Node, Collider, ITriggerEvent, Vec3, tween, TweenEasing, Tween } from 'cc';
import { CollectibleItem } from './CollectibleItem';
import { SpawnZone } from './SpawnZone';
import { CustomersQueueManager } from 'db://assets/scripts/customers/CustomersQueueManager';
import { OrderPopup } from 'db://assets/scripts/OrderPopup';
import { object_pool_manager } from 'db://assets/plugins/playable-foundation/game-foundation/object_pool';

const { ccclass, property } = _decorator;

@ccclass('ItemSellTrigger')
export class ItemSellTrigger extends Component {
    @property({ type: Node, tooltip: 'Character root that owns the carried items.' })
    public character: Node | null = null;

    @property({ type: Node, tooltip: 'Anchor node where collected prefabs are attached (defaults to character).' })
    public characterCarryAnchor: Node | null = null;

    @property({ type: Node, tooltip: 'Destination node items fly toward when sold.' })
    public sellTarget: Node | null = null;

    @property({ type: Node, tooltip: 'Optional node with a Collider that detects the character (defaults to this node).' })
    public triggerArea: Node | null = null;

    @property({ tooltip: 'Collectible type identifier this trigger will sell (case insensitive).' })
    public sellTypeId = '';

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
    private _stagedItems: Node[] = [];
    private _soldFreeSlots: number[] = [];
    private _customerRescanTimer = 0;
    private _isDeliveringToCustomer = false;
    private _customerItem: Node | null = null;

    update (deltaTime: number): void {
        this.updateSellingLoop(deltaTime);
        this.updateCustomerServing(deltaTime);
    }

    protected onEnable (): void {
        this.registerColliderEvents();
    }

    protected onDisable (): void {
        this.unregisterColliderEvents();
        this._characterInside = false;
        this._characterOverlaps.clear();
        this.stopAllSelling(true);
        this.stopCustomerDelivery();
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
        if (!otherCollider || !otherNode || !this.isCharacterNode(otherNode)) {
            return;
        }

        if (inside) {
            const previousInside = this._characterInside;
            this._characterOverlaps.add(otherCollider);
            if (!previousInside) {
                this._characterInside = true;
                this._rescanTimer = 0;
            }
            return;
        }

        this._characterOverlaps.delete(otherCollider);
        if (this._characterInside && this._characterOverlaps.size === 0) {
            this._characterInside = false;
            this.stopAllSelling(true);
        }
    }

    private isCharacterNode (candidate: Node | null): boolean {
        if (!candidate || !this.character) {
            return false;
        }

        if (candidate === this.character) {
            return true;
        }

        let current: Node | null = candidate;
        while (current) {
            if (current === this.character) {
                return true;
            }
            current = current.parent;
        }

        return false;
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
        const anchor = this.characterCarryAnchor ?? this.character;
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

        this._customerRescanTimer = 0;

        if (autoServe && !this._isDeliveringToCustomer) {
            this.tryServeCustomer();
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

}
