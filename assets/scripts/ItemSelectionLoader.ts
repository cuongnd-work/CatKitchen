import { _decorator, Button, CCInteger, Component, Label, Node, Sprite, SpriteFrame, Tween, Vec3, tween, warn } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('ItemSlotConfig')
class ItemSlotConfig {
    @property({ type: Button, tooltip: 'UI Button that fires when tapped/clicked.' })
    public triggerButton: Button | null = null;

    @property({ type: Sprite, tooltip: 'Sprite component that should show the configured sprite frame.' })
    public spriteComponent: Sprite | null = null;

    @property({ type: SpriteFrame, tooltip: 'Sprite frame assigned to the sprite component when refreshed.' })
    public spriteFrame: SpriteFrame | null = null;

    @property({ type: Label, tooltip: 'Label that displays the price text.' })
    public priceLabel: Label | null = null;

    @property({ type: CCInteger, tooltip: 'Displayed price for this slot.' })
    public price = 0;

    @property({ type: Node, tooltip: 'Node to enable when this slot is clicked.' })
    public enableOnClick: Node | null = null;
}

@ccclass('ItemSelectionLoader')
export class ItemSelectionLoader extends Component {
    @property({ type: [ItemSlotConfig], tooltip: 'Configure two item slots with sprites, prices, and nodes to enable.' })
    public slots: ItemSlotConfig[] = [];

    @property({ tooltip: 'Optional prefix for the displayed price (e.g., currency symbol).' })
    public pricePrefix = '';

    @property({ tooltip: 'Local Y position the UI should tween to when enabled.' })
    public targetY = 0;

    @property({ tooltip: 'Seconds for the enter tween.' })
    public enterDuration = 0.2;

    @property({ tooltip: 'Seconds for the exit tween.' })
    public exitDuration = 0.2;

    private _bindings: Array<{ button: Button; handler: () => void }> = [];
    private _originalPosition = new Vec3();
    private _enterTween: Tween<Node> | null = null;
    private _exitTween: Tween<Node> | null = null;
    private _interactionLocked = false;

    protected onEnable(): void {
        this.unregisterBindings();
        this.refreshSlots();
        this.registerBindings();
        this.cacheOriginalPosition();
        this._interactionLocked = false;
        this.resetButtonInteractivity();
        this.startEnterTween();
    }

    protected onDisable(): void {
        this.unregisterBindings();
        this.stopTweens();
        this._interactionLocked = false;
        this.resetButtonInteractivity();
    }

    private refreshSlots(): void {
        this.slots.forEach((slot, index) => {
            if (!slot) {
                return;
            }

            if (slot.spriteComponent && slot.spriteFrame) {
                slot.spriteComponent.spriteFrame = slot.spriteFrame;
            } else if (slot.spriteComponent && !slot.spriteFrame) {
                warn(`[ItemSelectionLoader] Slot ${index} is missing spriteFrame.`);
            }

            if (slot.priceLabel) {
                slot.priceLabel.string = `${this.pricePrefix}${slot.price}`;
            } else {
                warn(`[ItemSelectionLoader] Slot ${index} is missing priceLabel.`);
            }
        });
    }

    private registerBindings(): void {
        this.slots.forEach((slot, index) => {
            const triggerButton = slot?.triggerButton;
            if (!triggerButton || !triggerButton.isValid) {
                warn(`[ItemSelectionLoader] Slot ${index} is missing triggerButton.`);
                return;
            }

            const handler = () => this.handleSlotClick(slot, index);
            triggerButton.node.on(Button.EventType.CLICK, handler, this);
            this._bindings.push({ button: triggerButton, handler });
        });
    }

    private unregisterBindings(): void {
        this._bindings.forEach(({ button, handler }) => {
            if (button && button.isValid) {
                button.node.off(Button.EventType.CLICK, handler, this);
            }
        });
        this._bindings.length = 0;
    }

    private handleSlotClick(slot: ItemSlotConfig, index: number): void {
        if (this._interactionLocked) {
            return;
        }

        const target = slot.enableOnClick;
        if (!target || !target.isValid) {
            warn(`[ItemSelectionLoader] Slot ${index} has no enableOnClick target.`);
            return;
        }

        target.active = true;
        this.disableOtherButtons(index);
        this._interactionLocked = true;
        this.startExitTween();
    }

    private disableOtherButtons(activeIndex: number): void {
        this.slots.forEach((slot, index) => {
            if (index === activeIndex) {
                return;
            }

            const button = slot?.triggerButton;
            if (button && button.isValid) {
                button.interactable = false;
            }
        });
    }

    private resetButtonInteractivity(): void {
        this.slots.forEach((slot) => {
            const button = slot?.triggerButton;
            if (button && button.isValid) {
                button.interactable = true;
            }
        });
    }

    private cacheOriginalPosition(): void {
        this.node.getPosition(this._originalPosition);
    }

    private startEnterTween(): void {
        this.stopTweens();
        this.node.setPosition(this._originalPosition);
        const targetPos = new Vec3(this._originalPosition.x, this.targetY, this._originalPosition.z);
        this._enterTween = tween(this.node)
            .to(Math.max(0, this.enterDuration), { position: targetPos })
            .start();
    }

    private startExitTween(): void {
        this.stopTweens();
        const origin = this._originalPosition.clone();
        this._exitTween = tween(this.node)
            .to(Math.max(0, this.exitDuration), { position: origin })
            .call(() => {
                this.node.active = false;
                this._interactionLocked = false;
                this.resetButtonInteractivity();
            })
            .start();
    }

    private stopTweens(): void {
        if (this._enterTween) {
            this._enterTween.stop();
            this._enterTween = null;
        }
        if (this._exitTween) {
            this._exitTween.stop();
            this._exitTween = null;
        }
    }
}
