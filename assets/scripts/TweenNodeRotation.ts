import { _decorator, CCFloat, Component, Node, Quat, Tween, Vec3, tween, warn } from 'cc';

const { ccclass, property } = _decorator;

type TweenState = { value: number };

@ccclass('TweenNodeRotation')
export class TweenNodeRotation extends Component {
    @property({ type: Node, tooltip: 'Node whose rotation will be tweened (defaults to this node).' })
    public target: Node | null = null;

    @property({ tooltip: 'Rotate in local space (true) or world space (false).' })
    public useLocalRotation = true;

    @property({ tooltip: 'Euler angles (degrees) used as the end value of the tween.' })
    public endEuler = new Vec3(0, 360, 0);

    @property({ type: CCFloat, tooltip: 'Seconds it takes to reach the end rotation.' })
    public duration = 1;

    @property({ type: CCFloat, tooltip: 'Delay in seconds applied before the first tween begins.' })
    public startDelay = 0;

    @property({ tooltip: 'Loop the tween when it finishes.' })
    public loop = true;

    @property({ tooltip: 'Reverse the tween after it reaches the end rotation.' })
    public pingPong = false;

    @property({ tooltip: 'Play automatically when the component is enabled.' })
    public playOnEnable = true;

    @property({ tooltip: 'Easing applied to the tween.', type: String })
    public easing = 'linear';

    private _tween: Tween<TweenState> | null = null;
    private _tweenState: TweenState = { value: 0 };
    private _forward = true;
    private _endEulerCache = new Vec3();
    private _lerpEuler = new Vec3();
    private _rotationQuat = new Quat();

    protected onEnable(): void {
        if (this.playOnEnable) {
            this.startTween();
        }
    }

    protected onDisable(): void {
        this.stopTween();
    }

    public startTween(): void {
        const target = this.getTarget();
        if (!target) {
            return;
        }

        this.captureEndpoints(target);
        this._forward = true;
        this.runTween(true);
    }

    public stopTween(): void {
        if (this._tween) {
            this._tween.stop();
            this._tween = null;
        }
    }

    private getTarget(): Node | null {
        const candidate = this.target && this.target.isValid ? this.target : this.node;
        if (!candidate || !candidate.isValid) {
            warn('[TweenNodeRotation] Target node is missing or invalid.');
            return null;
        }
        return candidate;
    }

    private captureEndpoints(target: Node): void {
        this.readEulerAngles(target, this._lerpEuler);
        this._endEulerCache.set(this.endEuler);
    }

    private runTween(applyDelay: boolean): void {
        this.stopTween();
        const target = this.getTarget();
        if (!target) {
            return;
        }

        const duration = Math.max(0.0001, this.duration);
        this._tweenState.value = 0;

        const from = this._forward ? this._lerpEuler : this._endEulerCache;
        const to = this._forward ? this._endEulerCache : this._lerpEuler;

        const tweener = tween(this._tweenState);

        if (applyDelay && this.startDelay > 0) {
            tweener.delay(this.startDelay);
        }

        this._tween = tweener
            .to(duration, { value: 1 }, {
                easing: this.easing || 'linear',
                onUpdate: () => this.applyRotation(target, from, to, this._tweenState.value),
            })
            .call(() => this.onTweenFinished())
            .start();
    }

    private onTweenFinished(): void {
        if (this.pingPong) {
            this._forward = !this._forward;
            this.runTween(false);
            return;
        }

        if (this.loop) {
            this._forward = true;
            this.runTween(false);
            return;
        }

        this.stopTween();
    }

    private applyRotation(target: Node, from: Vec3, to: Vec3, ratio: number): void {
        Vec3.lerp(this._lerpEuler, from, to, ratio);
        if (this.useLocalRotation) {
            target.setRotationFromEuler(this._lerpEuler.x, this._lerpEuler.y, this._lerpEuler.z);
            return;
        }

        Quat.fromEuler(this._rotationQuat, this._lerpEuler.x, this._lerpEuler.y, this._lerpEuler.z);
        target.setWorldRotation(this._rotationQuat);
    }

    private readEulerAngles(target: Node, out: Vec3): void {
        if (this.useLocalRotation) {
            target.getRotation(this._rotationQuat);
        } else {
            target.getWorldRotation(this._rotationQuat);
        }

        Quat.toEuler(out, this._rotationQuat);
    }
}
