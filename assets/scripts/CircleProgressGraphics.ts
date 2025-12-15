import {_decorator, Component, Graphics, Label, Node, tween, Tween} from 'cc';

const {ccclass, property} = _decorator;

@ccclass('CircleProgressGraphics')
export class CircleProgressGraphics extends Component {

    @property(Graphics)
    public gfx: Graphics | null = null;

    @property(Node)
    public mode: Node | null = null;

    private _tween: Tween<{ v: number }> | null = null;
    private _obj = {v: 0};

    @property(Label)
    private lable1: Label = null;

    @property(Label)
    private lable2: Label = null;

    private isEarn: boolean = false;

    public updateLable(index: number): void {
        if (index == 1) {
            if (this.isEarn) {
                this.lable1.string = "";
                return;
            }
            this.lable1.string = "1";
            this.isEarn = true;
        } else if (index == 2) {
            this.lable2.string = "";
        }
    }

    public startProgress(timeP: number, onComplete?: () => void) {
        if (!this.mode || !this.gfx) return;

        // ===== RESET HOÀN TOÀN =====
        this._tween?.stop();
        this._tween = null;

        this._obj.v = 0;
        this.gfx.clear();
        this.setProgress(0);

        this.mode.active = true;

        // ===== TWEEN MỚI =====
        this._tween = tween(this._obj)
            .to(timeP, {v: 1}, {
                onUpdate: () => this.setProgress(this._obj.v)
            })
            .call(() => {
                this._tween = null;
                if (onComplete) onComplete();
            })
            .start();
    }


    public pause() {
        if (this._tween) {
            this._tween.pause();
        }
    }

    public resume() {
        if (this._tween) {
            this._tween.resume();
        }
    }

    public reset() {
        this._obj.v = 0;
        this.setProgress(0);
        this.mode.active = false;
        this._tween?.stop();
        this._tween = null;
    }

    private setProgress(percent: number) {
        if (!this.gfx) return;

        const radius = 70;
        const angle = percent * Math.PI * 2;

        this.gfx.clear();
        this.gfx.moveTo(0, 0);

        for (let a = 0; a <= angle; a += 0.05) {
            this.gfx.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
        }

        this.gfx.close();
        this.gfx.fill();
    }
}
