import { _decorator, Component, tween, Vec3, Tween } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('zoom_button')
export class zoom_button extends Component {

    @property
    scaleUp: number = 1.15;

    @property
    duration: number = 0.4;

    @property
    delay: number = 200;

    @property
    isStartAnim: boolean = false;

    @property
    origin: Vec3 = new Vec3(0.8, 0.8, 0.8);

    private _originScale = new Vec3(0.8, 0.8, 0.8);
    private _zoomTween: Tween | null = null;

    start() {
        this._originScale = this.origin;

        if(this.isStartAnim){
            this.startZoom();
        }
    }

    public startZoom () {
        if (this._zoomTween) return;

        const targetScale = new Vec3(
            this._originScale.x * this.scaleUp,
            this._originScale.y * this.scaleUp,
            this._originScale.z * this.scaleUp
        );

        this._zoomTween = tween(this.node)
            .repeatForever(
                tween()
                    .to(this.duration, { scale: targetScale })
                    .to(this.duration, { scale: this._originScale })
            )
            .start();
    }

    public stopZoomAndReset () {
        if (this._zoomTween) {
            this._zoomTween.stop();
            this._zoomTween = null;
        }

        this.node.setScale(this._originScale);
    }

    onDestroy () {
        this.stopZoomAndReset();
    }
}
