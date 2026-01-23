import { _decorator, Component, Node, Vec3, tween, Tween } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('VerticalOscillator')
export class VerticalOscillator extends Component {
    @property({ tooltip: 'Local Y value used at the bottom of the loop.' })
    public minY = 1;

    @property({ tooltip: 'Local Y value used at the top of the loop.' })
    public maxY = 2;

    @property({ tooltip: 'Seconds it takes to travel from min to max.' })
    public upDuration = 0.6;

    @property({ tooltip: 'Seconds it takes to travel from max back to min.' })
    public downDuration = 0.6;

    @property({ tooltip: 'Automatically start tweening when the component enables.' })
    public playOnEnable = true;

    private _loopTween: Tween<Node> | null = null;
    private _tempPos: Vec3 = new Vec3();

    protected onEnable (): void {
        if (this.playOnEnable) {
            this.startLoop();
        }
    }

    protected onDisable (): void {
        this.stopLoop();
    }

    protected onDestroy (): void {
        this.stopLoop();
    }

    public startLoop (): void {
        this.stopLoop();

        const node = this.node;
        node.getPosition(this._tempPos);
        this._tempPos.y = this.minY;
        node.setPosition(this._tempPos);

        const clampedMin = Math.min(this.minY, this.maxY);
        const clampedMax = Math.max(this.minY, this.maxY);
        const upPos = new Vec3(this._tempPos.x, clampedMax, this._tempPos.z);
        const downPos = new Vec3(this._tempPos.x, clampedMin, this._tempPos.z);

        this._loopTween = tween(node)
            .repeatForever(
                tween()
                    .to(Math.max(0.01, this.upDuration), { position: upPos })
                    .to(Math.max(0.01, this.downDuration), { position: downPos }),
            )
            .start();
    }

    public stopLoop (): void {
        if (!this._loopTween) {
            return;
        }
        this._loopTween.stop();
        this._loopTween = null;
    }
}
