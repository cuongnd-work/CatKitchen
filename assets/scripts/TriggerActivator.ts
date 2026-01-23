import { _decorator, Component, Node, Collider, ITriggerEvent } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('TriggerActivator')
export class TriggerActivator extends Component {
    @property({ type: Node, tooltip: 'Character node required to activate this trigger.' })
    public character: Node | null = null;

    @property({ type: Node, tooltip: 'Node that owns the trigger Collider (defaults to this node).' })
    public triggerArea: Node | null = null;

    @property({ type: [Node], tooltip: 'Nodes disabled when the trigger succeeds.' })
    public nodesToDisable: Node[] = [];

    @property({ type: [Node], tooltip: 'Nodes activated when the trigger succeeds.' })
    public nodesToActivate: Node[] = [];

    @property({ tooltip: 'Allow the trigger to fire again while enabled.' })
    public repeatable = false;

    @property({ tooltip: 'Seconds to wait when no trigger occurs (only if repeatable).' })
    public idleTimeout = 4;

    private _triggerCollider: Collider | null = null;
    private _hasTriggered = false;
    private _idleTimerScheduled = false;
    private _idleCallback: (() => void) | null = null;

    protected onEnable(): void {
        this._hasTriggered = false;
        this.registerTriggerCollider();
        this.startIdleTimer();
    }

    protected onDisable(): void {
        this.unregisterTriggerCollider();
        this.clearIdleTimer();
    }

    private registerTriggerCollider(): void {
        this.unregisterTriggerCollider();
        const colliderNode = this.triggerArea ?? this.node;
        if (!colliderNode) {
            console.warn('[TriggerActivator] Missing trigger node.');
            return;
        }
        const collider = colliderNode.getComponent(Collider);
        if (!collider) {
            console.warn(`[TriggerActivator] ${colliderNode.name} needs a Collider set as trigger.`);
            return;
        }
        this._triggerCollider = collider;
        collider.on('onTriggerEnter', this.onTriggerEnter, this);
    }

    private unregisterTriggerCollider(): void {
        if (!this._triggerCollider) {
            return;
        }
        this._triggerCollider.off('onTriggerEnter', this.onTriggerEnter, this);
        this._triggerCollider = null;
    }

    private onTriggerEnter(event: ITriggerEvent): void {
        if (!this.character) {
            console.warn('[TriggerActivator] Character node is not assigned.');
            return;
        }
        if (this._hasTriggered && !this.repeatable) {
            return;
        }
        const otherNode = event.otherCollider?.node ?? null;
        if (!otherNode || otherNode !== this.character) {
            return;
        }
        this.applyActivation();
    }

    private applyActivation(): void {
        this._hasTriggered = true;
        this.setNodesActive(this.nodesToDisable, false);
        this.setNodesActive(this.nodesToActivate, true);
        this.clearIdleTimer();

        if (!this.repeatable) {
            this.unregisterTriggerCollider();
        } else {
            this._hasTriggered = false;
            this.startIdleTimer();
        }
    }

    private setNodesActive(nodes: Node[] | null, active: boolean): void {
        if (!nodes) {
            return;
        }
        nodes.forEach((node) => {
            if (node) {
                node.active = active;
            }
        });
    }

    private startIdleTimer(): void {
        if (this.idleTimeout <= 0 || this._idleTimerScheduled) {
            return;
        }
        this._idleTimerScheduled = true;
        this._idleCallback = () => {
            this._idleTimerScheduled = false;
            this._idleCallback = null;
            if (this._hasTriggered) {
                return;
            }
            this.applyActivation();
        };
        this.scheduleOnce(this._idleCallback, this.idleTimeout);
    }

    private clearIdleTimer(): void {
        if (!this._idleTimerScheduled) {
            return;
        }
        if (this._idleCallback) {
            this.unschedule(this._idleCallback);
            this._idleCallback = null;
        }
        this._idleTimerScheduled = false;
    }
}
