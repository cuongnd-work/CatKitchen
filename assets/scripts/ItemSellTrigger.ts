import { _decorator, Component, Node, Collider, ITriggerEvent, Vec3, tween, TweenEasing, Tween } from 'cc';
import { CollectibleItem } from './CollectibleItem';

const { ccclass, property } = _decorator;

@ccclass('ItemSellTrigger')
export class ItemSellTrigger extends Component {
    @property({ type: Node, tooltip: 'Character root that owns the carried items.' })
    public character: Node | null = null;

    @property({ type: Node, tooltip: 'Anchor node where collected prefabs are attached (defaults to character).' })
    public characterCarryAnchor: Node | null = null;

    @property({ type: Node, tooltip: 'Destination node items fly toward when sold.' })
    public sellTarget: Node | null = null;

    @property({ tooltip: 'Collectible type identifier this trigger will sell (case insensitive).' })
    public sellTypeId = '';

    @property({ tooltip: 'Local stacking direction used to figure out the top item within the anchor.' })
    public stackDirection: Vec3 = new Vec3(0, 1, 0);

    @property({ tooltip: 'Duration (seconds) for each item to travel toward sellTarget.' })
    public sellDuration = 0.35;

    @property({ tooltip: 'Tween easing while moving items toward the sellTarget.' })
    public sellEasing: TweenEasing = 'quadOut';

    @property({ tooltip: 'Seconds between scans while waiting for new items.' })
    public rescanInterval = 0.1;

    private _sellQueue: Node[] = [];
    private _queuedItems: Set<Node> = new Set();
    private _characterOverlaps: Set<Collider> = new Set();
    private _characterInside = false;
    private _isSelling = false;
    private _stackAxis: Vec3 = new Vec3(0, 1, 0);
    private _worldTarget: Vec3 = new Vec3();
    private _localTemp: Vec3 = new Vec3();
    private _worldTemp: Vec3 = new Vec3();
    private _rescanTimer = 0;
    private _activeItem: Node | null = null;

    update (deltaTime: number): void {
        this.updateSellingLoop(deltaTime);
    }

    protected onEnable (): void {
        this.registerColliderEvents();
    }

    protected onDisable (): void {
        this.unregisterColliderEvents();
        this._characterInside = false;
        this._characterOverlaps.clear();
        this.stopAllSelling(true);
    }

    private registerColliderEvents (): void {
        const collider = this.getComponent(Collider);
        if (!collider) {
            console.warn(`[ItemSellTrigger] ${this.node.name} is missing a Collider to detect the character.`);
            return;
        }
        collider.on('onTriggerEnter', this.onTriggerEnter, this);
        collider.on('onTriggerExit', this.onTriggerExit, this);
        collider.on('onTriggerStay', this.onTriggerStay, this);
    }

    private unregisterColliderEvents (): void {
        const collider = this.getComponent(Collider);
        if (!collider) {
            return;
        }
        collider.off('onTriggerEnter', this.onTriggerEnter, this);
        collider.off('onTriggerExit', this.onTriggerExit, this);
        collider.off('onTriggerStay', this.onTriggerStay, this);
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
            this.stopAllSelling(false);
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
        const sellTarget = this.sellTarget;
        if (!sellTarget || !this._characterInside) {
            this.stopAllSelling(false);
            return;
        }

        sellTarget.getWorldPosition(this._worldTarget);

        item.getWorldPosition(this._worldTemp);
        sellTarget.inverseTransformPoint(this._localTemp, this._worldTemp);

        const parent = sellTarget;
        Tween.stopAllByTarget(item);
        item.setParent(parent);
        item.setPosition(this._localTemp);

        parent.inverseTransformPoint(this._localTemp, this._worldTarget);
        const targetLocal = new Vec3(this._localTemp.x, this._localTemp.y, this._localTemp.z);

        this._isSelling = true;
        this._activeItem = item;
        tween(item)
            .to(Math.max(0, this.sellDuration), { position: targetLocal }, { easing: this.sellEasing })
            .call(() => {
                this._queuedItems.delete(item);
                if (item.isValid) {
                    item.destroy();
                }
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
        if (!this.sellTarget) {
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

        if (stopActiveTween) {
            this.stopActiveTween();
            this._isSelling = false;
        } else if (!this._isSelling) {
            this.stopActiveTween();
        }
    }

    private stopActiveTween (): void {
        if (this._activeItem && this._activeItem.isValid) {
            Tween.stopAllByTarget(this._activeItem);
        }
        this._activeItem = null;
    }

}
