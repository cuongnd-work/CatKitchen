import { _decorator, Component, Label, Color, tween, EventTarget } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('CurrencyView')
export class CurrencyView extends Component {
    private static _instance: CurrencyView | null = null;
    private static _eventTarget: EventTarget = new EventTarget();
    private static _value = 0;

    public static readonly EVENT_CHANGED = 'currency-changed';

    public static get instance(): CurrencyView | null {
        return this._instance;
    }

    public static get currentValue(): number {
        return this._value;
    }

    @property(Label)
    public currencyLabel: Label | null = null;

    @property
    public prefix = 'Money: ';

    @property
    public tweenDuration = 0.25;

    @property
    public animateChanges = true;

    private _displayValue = 0;
    private _targetValue = 0;
    private _isChanging = false;
    private _defaultColor: Color = new Color();

    protected onLoad(): void {
        if (CurrencyView._instance && CurrencyView._instance !== this) {
            console.warn('[CurrencyView] Duplicate instance found. Destroying the new one.');
            this.destroy();
            return;
        }

        CurrencyView._instance = this;
        if (!this.currencyLabel) {
            this.currencyLabel = this.getComponent(Label);
        }

        if (this.currencyLabel) {
            const labelColor = this.currencyLabel.color;
            this._defaultColor = labelColor ? new Color(labelColor) : new Color();
        }

        this._displayValue = CurrencyView._value;
        this._targetValue = CurrencyView._value;
        this.updateLabelText(this._displayValue);
    }

    protected onDestroy(): void {
        if (CurrencyView._instance === this) {
            CurrencyView._instance = null;
        }
    }

    public static onCurrencyChanged(callback: () => void, target?: unknown): void {
        this._eventTarget.on(this.EVENT_CHANGED, callback, target);
    }

    public static offCurrencyChanged(callback: () => void, target?: unknown): void {
        this._eventTarget.off(this.EVENT_CHANGED, callback, target);
    }

    public static setCurrentValue(value: number): void {
        const normalized = this.normalizeValue(value);
        const previous = this._value;
        if (normalized === previous) {
            return;
        }

        this._value = normalized;
        this._eventTarget.emit(this.EVENT_CHANGED);

        if (this._instance) {
            this._instance.applyValue(normalized, normalized - previous);
        }
    }

    public static addCurrency(amount: number): void {
        if (amount <= 0) {
            return;
        }
        this.setCurrentValue(this._value + amount);
    }

    public static subtractCurrency(amount: number): void {
        if (amount <= 0) {
            return;
        }
        this.setCurrentValue(this._value - amount);
    }

    public static trySubtractCurrency(amount: number): boolean {
        if (amount <= 0) {
            return true;
        }
        if (this._value < amount) {
            return false;
        }
        this.subtractCurrency(amount);
        return true;
    }

    public static canAfford(amount: number): boolean {
        if (amount <= 0) {
            return true;
        }
        return this._value >= amount;
    }

    private static normalizeValue(value: number): number {
        if (!Number.isFinite(value)) {
            return 0;
        }
        return Math.max(0, Math.floor(value));
    }

    private applyValue(value: number, delta: number): void {
        this._targetValue = value;

        if (!this.currencyLabel) {
            this._displayValue = value;
            return;
        }

        if (!this.animateChanges) {
            this._displayValue = value;
            this.updateLabelText(value);
            this.currencyLabel.color = this._defaultColor;
            return;
        }

        if (delta > 0) {
            this.currencyLabel.color = new Color(255, 215, 0, 255);
        } else if (delta < 0) {
            this.currencyLabel.color = new Color(255, 80, 80, 255);
        }

        if (this._isChanging) {
            return;
        }

        this.startTween();
    }

    private startTween(): void {
        if (!this.currencyLabel) {
            this._displayValue = this._targetValue;
            return;
        }

        this._isChanging = true;
        const proxy = { value: this._displayValue };
        const duration = Math.max(0.01, this.tweenDuration);

        tween(proxy)
            .to(duration, { value: this._targetValue }, {
                onUpdate: () => {
                    this._displayValue = Math.floor(proxy.value);
                    this.updateLabelText(this._displayValue);
                },
            })
            .call(() => {
                this._displayValue = this._targetValue;
                this.updateLabelText(this._displayValue);
                this.currencyLabel!.color = this._defaultColor;
                this._isChanging = false;

                if (this._displayValue !== this._targetValue) {
                    this.startTween();
                }
            })
            .start();
    }

    private updateLabelText(value: number): void {
        if (!this.currencyLabel) {
            return;
        }
        this.currencyLabel.string = `${this.prefix}${value}`;
    }
}
