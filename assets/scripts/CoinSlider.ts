import { _decorator, Component, Slider, Label, Node } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('CoinSlider')
export class CoinSlider extends Component {
    @property(Slider)
    slider: Slider | null = null;

    @property(Label)
    coinLabel: Label | null = null;

    private minCoin: number = 10;
    private maxCoin: number = 999;

    onLoad() {
        if (this.slider) {
            this.slider.node.on(Slider.EventType.SLIDE, this.onSliderChange, this);
            this.updateCoinDisplay();
        }
    }

    private onSliderChange() {
        this.updateCoinDisplay();
    }

    private updateCoinDisplay() {
        if (!this.slider || !this.coinLabel) return;

        const sliderValue = this.slider.progress;
        const coinValue = Math.round(this.minCoin + (this.maxCoin - this.minCoin) * sliderValue);
        this.coinLabel.string = coinValue.toString();
    }

    public setCoinRange(min: number, max: number) {
        this.minCoin = min;
        this.maxCoin = max;
        this.updateCoinDisplay();
    }

    public getCoinValue(): number {
        if (!this.slider) return this.minCoin;
        return Math.round(this.minCoin + (this.maxCoin - this.minCoin) * this.slider.progress);
    }

    onDestroy() {
        if (this.slider) {
            this.slider.node.off(Slider.EventType.SLIDE, this.onSliderChange, this);
        }
    }
}
