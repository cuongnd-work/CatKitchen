import { _decorator, Component, Node, Collider, ITriggerEvent, Vec3, tween, Tween, TweenEasing, Label, SpriteRenderer, Material, AudioSource } from 'cc';
import { ItemSellTrigger } from './ItemSellTrigger';
import { object_pool_manager } from 'db://assets/plugins/playable-foundation/game-foundation/object_pool';

const { ccclass, property } = _decorator;

@ccclass('MoneyPaymentZone')
export abstract class MoneyPaymentZone extends Component {
    @property({ type: Node, tooltip: 'Character node required to activate the payment zone.' })
    public character: Node | null = null;

    @property({ type: Node, tooltip: 'Collider node used to detect the character (defaults to this node).' })
    public triggerArea: Node | null = null;

    @property({ type: ItemSellTrigger, tooltip: 'ItemSellTrigger that manages the character money stack.' })
    public moneySource: ItemSellTrigger | null = null;

    @property({ type: Node, tooltip: 'Target node money bundles animate toward (defaults to this node).' })
    public depositTarget: Node | null = null;

    @property({ tooltip: 'World offset applied on top of the deposit target.' })
    public depositOffset: Vec3 = new Vec3(0, 0.25, 0);

    @property({ tooltip: 'Seconds between money bundle withdrawals while the character stays inside.' })
    public consumeInterval = 0.2;

    @property({ tooltip: 'Initial scale applied to bundles at the start of the payment animation.' })
    public consumeStartScale: Vec3 = new Vec3(1, 1, 1);

    @property({ tooltip: 'Tween duration used while moving bundles to the deposit target.' })
    public consumeDuration = 0.25;

    @property({ tooltip: 'Tween easing used while moving bundles to the deposit target.' })
    public consumeEasing: TweenEasing = 'quadOut';

    @property({ tooltip: 'Currency earned per money bundle.' })
    public moneyValuePerBundle = 20;

    @property({ tooltip: 'Target payment amount required to complete the zone.' })
    public requiredAmount = 100;

    @property({ tooltip: 'Reset progress each time the required amount is reached.' })
    public loopPayments = true;

    @property({ type: [Node], tooltip: 'Nodes disabled when this payment completes.' })
    public nodesToDisable: Node[] = [];

    @property({ type: Node, tooltip: 'Node activated when this payment succeeds (optional).' })
    public nodeToActivateOnComplete: Node | null = null;

    @property({ type: Label, tooltip: 'Label that displays the required payment amount.' })
    public requiredAmountLabel: Label | null = null;

    @property({ type: SpriteRenderer, tooltip: 'Sprite renderer whose material exposes fillAmount (0-1).' })
    public progressSprite: SpriteRenderer | null = null;

    @property({ type: Material, tooltip: 'Optional base material used when the sprite has no shared material assigned.' })
    public progressBaseMaterial: Material | null = null;

    @property({ type: AudioSource, tooltip: 'Audio source played each time the payment completes.' })
    public completionAudio: AudioSource | null = null;

    private _isCharacterInside = false;
    private _consumeTimer = 0;
    private _currentValue = 0;
    private _activeDeposits: Set<Node> = new Set();
    private _pendingDepositValues: Map<Node, number> = new Map();
    private _pendingDepositTotal = 0;
    private _worldTemp: Vec3 = new Vec3();
    private _worldTarget: Vec3 = new Vec3();
    private _localTemp: Vec3 = new Vec3();
    private _progressMaterial: Material | null = null;

    protected onLoad (): void {
        this.updateRequiredAmountLabel();
        this.updateProgressSprite();
    }

    update (deltaTime: number): void {
        this.processConsumption(deltaTime);
    }

    protected onEnable (): void {
        this.registerColliderEvents();
    }

    protected onDisable (): void {
        this.unregisterColliderEvents();
        this._isCharacterInside = false;
        this.cleanupDeposits();
    }

    private registerColliderEvents (): void {
        const collider = this.getTriggerCollider();
        if (!collider) {
            console.warn(`[MoneyPaymentZone] ${this.node.name} is missing a Collider to detect the character.`);
            return;
        }
        collider.on('onTriggerEnter', this.onTriggerEnter, this);
        collider.on('onTriggerStay', this.onTriggerStay, this);
        collider.on('onTriggerExit', this.onTriggerExit, this);
    }

    private unregisterColliderEvents (): void {
        const collider = this.getTriggerCollider();
        if (!collider) {
            return;
        }
        collider.off('onTriggerEnter', this.onTriggerEnter, this);
        collider.off('onTriggerStay', this.onTriggerStay, this);
        collider.off('onTriggerExit', this.onTriggerExit, this);
    }

    private getTriggerCollider (): Collider | null {
        const node = this.triggerArea ?? this.node;
        if (!node) {
            return null;
        }
        return node.getComponent(Collider);
    }

    private onTriggerEnter (event: ITriggerEvent): void {
        if (!this.character || !event.otherCollider || event.otherCollider.node !== this.character) {
            return;
        }
        this._isCharacterInside = true;
        this._consumeTimer = 0;
    }

    private onTriggerStay (event: ITriggerEvent): void {
        if (!this.character || !event.otherCollider || event.otherCollider.node !== this.character) {
            return;
        }
        this._isCharacterInside = true;
    }

    private onTriggerExit (event: ITriggerEvent): void {
        if (!this.character || !event.otherCollider || event.otherCollider.node !== this.character) {
            return;
        }
        this._isCharacterInside = false;
    }

    private processConsumption (deltaTime: number): void {
        if (!this._isCharacterInside || !this.moneySource) {
            return;
        }

        this._consumeTimer -= deltaTime;
        if (this._consumeTimer > 0) {
            return;
        }
        this._consumeTimer = Math.max(0.01, this.consumeInterval);

        const bundles = this.moneySource.withdrawMoneyBundles(1);
        if (bundles.length === 0) {
            return;
        }
        bundles.forEach((bundle) => this.animateDeposit(bundle));
    }

    private animateDeposit (bundle: Node): void {
        const targetNode = this.depositTarget ?? this.node;
        if (!targetNode || !bundle || !bundle.isValid) {
            object_pool_manager.instance.Recycle(bundle);
            return;
        }

        this._activeDeposits.add(bundle);
        this.registerPendingDeposit(bundle, this.moneyValuePerBundle);
        bundle.getWorldPosition(this._worldTemp);
        targetNode.addChild(bundle);
        targetNode.inverseTransformPoint(this._localTemp, this._worldTemp);
        bundle.setPosition(this._localTemp);
        bundle.setScale(this.consumeStartScale.x, this.consumeStartScale.y, this.consumeStartScale.z);

        targetNode.getWorldPosition(this._worldTarget);
        this._worldTarget.x += this.depositOffset.x;
        this._worldTarget.y += this.depositOffset.y;
        this._worldTarget.z += this.depositOffset.z;
        targetNode.inverseTransformPoint(this._localTemp, this._worldTarget);
        const targetLocal = new Vec3(this._localTemp.x, this._localTemp.y, this._localTemp.z);

        Tween.stopAllByTarget(bundle);
        tween(bundle)
            .to(
                Math.max(0.01, this.consumeDuration),
                { position: targetLocal },
                { easing: this.consumeEasing },
            )
            .call(() => {
                this._activeDeposits.delete(bundle);
                this.resolvePendingDeposit(bundle, true);
                this.recycleBundle(bundle);
            })
            .start();
    }

    private reportPaymentProgress (): void {
        const requirement = Math.max(1, Math.floor(this.requiredAmount));
        if (requirement <= 0) {
            return;
        }

        while (this._currentValue >= requirement) {
            this.playCompletionSound();
            this.onPaymentSatisfied(requirement);
            if (this.loopPayments) {
                this._currentValue -= requirement;
                this.updateProgressSprite();
                continue;
            }
            break;
        }

        if (!this.loopPayments && this._currentValue >= requirement) {
            this.disablePaymentZone();
        }
    }

    private cleanupDeposits (): void {
        this._activeDeposits.forEach((bundle) => {
            if (!bundle) {
                return;
            }
            Tween.stopAllByTarget(bundle);
            this.resolvePendingDeposit(bundle, false);
            if (bundle.isValid) {
                this.recycleBundle(bundle);
            }
        });
        this._activeDeposits.clear();
    }

    private recycleBundle (bundle: Node | null): void {
        if (!bundle) {
            return;
        }

        if (this.moneySource) {
            this.moneySource.recycleMoneyBundle(bundle);
        } else {
            object_pool_manager.instance.Recycle(bundle);
        }
    }

    protected disablePaymentZone (): void {
        this._isCharacterInside = false;
        this.cleanupDeposits();
        const collider = this.getTriggerCollider();
        if (collider) {
            collider.enabled = false;
        }
        this.disableExtraNodes();
        if (this.nodeToActivateOnComplete) {
            this.nodeToActivateOnComplete.active = true;
            this.nodeToActivateOnComplete = null;
        }
        this.enabled = false;
    }

    protected disableExtraNodes (): void {
        if (!this.nodesToDisable) {
            return;
        }
        this.nodesToDisable.forEach((node) => {
            if (node) {
                node.active = false;
            }
        });
    }

    protected updateRequiredAmountLabel (): void {
        if (!this.requiredAmountLabel) {
            return;
        }
        const requirement = Math.max(0, Math.floor(this.requiredAmount));
        const paidValue = Math.max(0, this._currentValue + this._pendingDepositTotal);
        const remaining = Math.max(0, Math.ceil(requirement - paidValue));
        this.requiredAmountLabel.string = `${remaining}`;
    }

    protected updateProgressSprite (): void {
        const material = this.ensureProgressMaterial();
        if (material) {
            const requirement = Math.max(1, Math.floor(this.requiredAmount));
            const paidValue = this._currentValue + this._pendingDepositTotal;
            const ratio = Math.min(1, Math.max(0, requirement > 0 ? paidValue / requirement : 0));
            material.setProperty('fillAmount', ratio);
        }
        this.updateRequiredAmountLabel();
    }

    private ensureProgressMaterial (): Material | null {
        if (!this.progressSprite) {
            return null;
        }

        if (!this.progressSprite.getSharedMaterial(0) && this.progressBaseMaterial) {
            this.progressSprite.setMaterial(this.progressBaseMaterial, 0);
        }

        if (!this._progressMaterial) {
            this._progressMaterial = this.progressSprite.getMaterialInstance(0);
        }
        return this._progressMaterial;
    }

    private registerPendingDeposit (bundle: Node, value: number): void {
        const amount = Math.max(0, value);
        this._pendingDepositValues.set(bundle, amount);
        if (amount > 0) {
            this._pendingDepositTotal += amount;
        }
        this.updateProgressSprite();
    }

    private resolvePendingDeposit (bundle: Node, delivered: boolean): void {
        if (!this._pendingDepositValues.has(bundle)) {
            return;
        }
        const amount = this._pendingDepositValues.get(bundle) ?? 0;
        if (amount > 0) {
            this._pendingDepositTotal -= amount;
            if (this._pendingDepositTotal < 0) {
                this._pendingDepositTotal = 0;
            }
        }
        this._pendingDepositValues.delete(bundle);

        if (delivered && amount > 0) {
            this._currentValue += amount;
        }

        this.updateProgressSprite();

        if (delivered) {
            this.reportPaymentProgress();
        }
    }

    protected abstract onPaymentSatisfied (amount: number): void;

    protected playCompletionSound (): void {
        if (!this.completionAudio) {
            return;
        }
        this.completionAudio.stop();
        this.completionAudio.play();
    }
}
