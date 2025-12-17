import { _decorator, Component, Label, Color, tween } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('CurrencyView')
export class CurrencyView extends Component {
    private static _instance: CurrencyView = null;
    public static get instance(): CurrencyView {
        return this._instance;
    }

    @property(Label)
    currencyLabel: Label = null;

    public currentValue: number = 0;

    private targetValue: number = 0;

    private defaultColor: Color = new Color();
    private isChanging: boolean = false;

    onLoad() {
        if (CurrencyView._instance && CurrencyView._instance !== this) {
            console.warn("Duplicate CurrencyView found. Destroying this one.");
            this.destroy();
            return;
        }
        CurrencyView._instance = this;

        if (this.currencyLabel) {
            this.defaultColor = this.currencyLabel.color.clone();
            this.currencyLabel.string = this.currentValue.toString();
        }
        this.addCurrency(50);
    }

    public addCurrency(amount: number) {
        if (amount <= 0) return;
        this.targetValue += amount;
        this.startTween(true);
    }

    public subtractCurrency(amount: number) {
        if (amount <= 0) return;
        this.targetValue -= amount;
        this.startTween(false);
    }

    public trySubtractCurrency(amount: number) {
        if(this.targetValue < amount) return false;
        this.subtractCurrency(amount);

        return true;
    }

    private startTween(isAdd: boolean) {
        if (!this.currencyLabel) return;

        this.currencyLabel.color = isAdd ? new Color(255, 215, 0) : new Color(255, 80, 80);

        if (this.isChanging) return; // tween đang chạy, targetValue đã cập nhật, tween sẽ tự động tiếp

        this.isChanging = true;
        const tmp = { value: this.currentValue };
        const duration = 0.6;

        const updateTween = () => {
            tween(tmp)
                .to(duration, { value: this.targetValue }, {
                    onUpdate: () => {
                        this.currentValue = Math.floor(tmp.value);
                        this.currencyLabel.string = this.currentValue.toString();
                    }
                })
                .call(() => {
                    this.currentValue = this.targetValue;
                    this.currencyLabel.string = this.currentValue.toString();
                    this.currencyLabel.color = this.defaultColor;
                    this.isChanging = false;

                    // Nếu targetValue thay đổi trong lúc tween → chạy tiếp
                    if (this.currentValue !== this.targetValue) {
                        updateTween();
                    }
                })
                .start();
        };

        updateTween();
    }
}
