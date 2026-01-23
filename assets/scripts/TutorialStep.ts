import { _decorator, Component, Node, Collider, ITriggerEvent } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('TutorialStep')
export class TutorialStep extends Component {
    @property({ type: Node, tooltip: 'Character node required to progress this step.' })
    public character: Node | null = null;

    @property({ type: Node, tooltip: 'Collider node that listens for the character overlap (defaults to this node).' })
    public triggerArea: Node | null = null;

    @property({ type: Node, tooltip: 'Arrow or visual that highlights this step.' })
    public highlightArrow: Node | null = null;

    @property({ type: TutorialStep, tooltip: 'Step activated once this one completes.' })
    public nextStep: TutorialStep | null = null;

    private _collider: Collider | null = null;
    private _isActive = false;

    protected onEnable (): void {
        if (this._isActive) {
            this.registerTrigger();
        } else {
            this.resetState();
        }
    }

    protected onDisable (): void {
        this.unregisterTrigger();
    }

    public setStepActive (state: boolean): void {
        if (this._isActive === state) {
            return;
        }
        this._isActive = state;
        this.toggleHighlight(state);
        if (state) {
            this.registerTrigger();
        } else {
            this.unregisterTrigger();
        }
    }

    private registerTrigger (): void {
        this.unregisterTrigger();
        const node = this.triggerArea ?? this.node;
        if (!node) {
            return;
        }
        const collider = node.getComponent(Collider);
        if (!collider) {
            console.warn(`[TutorialStep] ${node.name} is missing a Collider.`);
            return;
        }
        this._collider = collider;
        collider.on('onTriggerEnter', this.onTriggerEnter, this);
    }

    private unregisterTrigger (): void {
        if (!this._collider) {
            return;
        }
        this._collider.off('onTriggerEnter', this.onTriggerEnter, this);
        this._collider = null;
    }

    private onTriggerEnter (event: ITriggerEvent): void {
        if (!this._isActive || !this.character) {
            return;
        }
        const otherNode = event.otherCollider?.node ?? null;
        if (!otherNode || otherNode !== this.character) {
            return;
        }
        this.completeStep();
    }

    private completeStep (): void {
        this.setStepActive(false);
        this.toggleHighlight(false);
        if (this.nextStep) {
            this.nextStep.setStepActive(true);
        }
    }

    private toggleHighlight (visible: boolean): void {
        if (this.highlightArrow) {
            this.highlightArrow.active = visible;
        }
    }

    private resetState (): void {
        this.toggleHighlight(false);
        this.unregisterTrigger();
    }
}
