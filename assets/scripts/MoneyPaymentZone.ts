import { _decorator, Component, Node, Collider, ITriggerEvent, Vec3, tween, Tween, TweenEasing } from 'cc';
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

    private _isCharacterInside = false;
    private _consumeTimer = 0;
    private _currentValue = 0;
    private _activeDeposits: Set<Node> = new Set();
    private _worldTemp: Vec3 = new Vec3();
    private _worldTarget: Vec3 = new Vec3();
    private _localTemp: Vec3 = new Vec3();

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
                this.recycleBundle(bundle);
                this._currentValue += this.moneyValuePerBundle;
                this.reportPaymentProgress();
            })
            .start();
    }

    private reportPaymentProgress (): void {
        const requirement = Math.max(1, Math.floor(this.requiredAmount));
        if (requirement <= 0) {
            return;
        }

        while (this._currentValue >= requirement) {
            this.onPaymentSatisfied(requirement);
            if (this.loopPayments) {
                this._currentValue -= requirement;
                continue;
            }
            break;
        }
    }

    private cleanupDeposits (): void {
        this._activeDeposits.forEach((bundle) => {
            if (!bundle || !bundle.isValid) {
                return;
            }
            Tween.stopAllByTarget(bundle);
            this.recycleBundle(bundle);
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

    protected abstract onPaymentSatisfied (amount: number): void;
}
