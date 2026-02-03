import { _decorator, Animation, Component, Input, Node, Tween, Vec3, input, tween, warn } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('PingPongMover')
export class PingPongMover extends Component {
    @property({ type: Node, tooltip: 'Locator defining the first point (local position derived from this node).' })
    public pointANode: Node | null = null;

    @property({ type: Node, tooltip: 'Locator defining the second point (local position derived from this node).' })
    public pointBNode: Node | null = null;

    @property({ tooltip: 'Seconds to travel between each point.', min: 0.01 })
    public travelDuration = 0.6;

    @property({ tooltip: 'Apply easing to the tween animation.' })
    public easing = 'sineInOut';

    @property({ type: Animation, tooltip: 'Animation component used to play arrivalAnimationClip (optional).' })
    public animation: Animation | null = null;

    @property({ tooltip: 'Animation clip/state name played each time the mover reaches a point.' })
    public arrivalAnimationClip = '';

    @property({ tooltip: 'Seconds to pause at each point when no arrival animation is provided.', min: 0 })
    public arrivalPauseDuration = 0.2;

    private _moveTween: Tween<Node> | null = null;
    private _resolvedPointA: Vec3 = new Vec3();
    private _resolvedPointB: Vec3 = new Vec3();
    private _arrivalDelayCallback: (() => void) | null = null;
    private _animationFinishHandler: (() => void) | null = null;

    protected onEnable(): void {
        input.on(Input.EventType.MOUSE_DOWN, this.handleGlobalClick, this);
        input.on(Input.EventType.TOUCH_START, this.handleGlobalClick, this);
        this.startMovement();
    }

    protected onDisable(): void {
        input.off(Input.EventType.MOUSE_DOWN, this.handleGlobalClick, this);
        input.off(Input.EventType.TOUCH_START, this.handleGlobalClick, this);
        this.stopMovement();
    }

    private startMovement(): void {
        this.stopMovement();
        this.resolvePoint(this.pointANode, this._resolvedPointA);
        this.resolvePoint(this.pointBNode, this._resolvedPointB);

        this.node.setPosition(this._resolvedPointA);
        this.moveToTarget(this._resolvedPointB, true);
    }

    private stopMovement(): void {
        if (this._moveTween) {
            this._moveTween.stop();
            this._moveTween = null;
        }

        this.cancelArrivalWaits();
    }

    private handleGlobalClick(): void {
        if (!this.node || !this.node.isValid) {
            return;
        }

        this.node.active = false;
    }

    private resolvePoint(source: Node | null, out: Vec3): void {
        const parent = this.node.parent;

        if (!source || !source.isValid) {
            warn('[PingPongMover] Assign both point nodes for movement.');
            out.set(this.node.position);
            return;
        }

        if (!parent) {
            out.set(source.worldPosition);
            return;
        }

        parent.inverseTransformPoint(out, source.worldPosition);
    }

    private moveToTarget(target: Vec3, movingToB: boolean): void {
        this.stopMovementTweenOnly();

        const duration = Math.max(0.01, this.travelDuration);
        const destination = target.clone();
        this._moveTween = tween(this.node)
            .to(duration, { position: destination }, { easing: this.easing })
            .call(() => this.onReachedTarget(movingToB))
            .start();
    }

    private onReachedTarget(movedTowardB: boolean): void {
        this._moveTween = null;
        this.playArrivalAnimation(() => {
            if (!this.node || !this.node.isValid || !this.node.activeInHierarchy) {
                return;
            }

            const nextTarget = movedTowardB ? this._resolvedPointA : this._resolvedPointB;
            this.moveToTarget(nextTarget, !movedTowardB);
        });
    }

    private playArrivalAnimation(onComplete: () => void): void {
        this.cancelArrivalWaits();

        const animationComponent = this.getAnimationComponent();
        if (!animationComponent || !this.arrivalAnimationClip) {
            this.scheduleArrivalPause(onComplete);
            return;
        }

        const handler = () => {
            animationComponent.off(Animation.EventType.FINISHED, handler, this);
            if (this._animationFinishHandler === handler) {
                this._animationFinishHandler = null;
            }
            onComplete();
        };

        this._animationFinishHandler = handler;
        animationComponent.on(Animation.EventType.FINISHED, handler, this);
        animationComponent.play(this.arrivalAnimationClip);
    }

    private scheduleArrivalPause(onComplete: () => void): void {
        const delay = Math.max(0, this.arrivalPauseDuration);
        if (delay === 0) {
            onComplete();
            return;
        }

        const callback = () => {
            if (this._arrivalDelayCallback === callback) {
                this._arrivalDelayCallback = null;
            }
            onComplete();
        };

        this._arrivalDelayCallback = callback;
        this.scheduleOnce(callback, delay);
    }

    private cancelArrivalWaits(): void {
        if (this._arrivalDelayCallback) {
            this.unschedule(this._arrivalDelayCallback);
            this._arrivalDelayCallback = null;
        }

        if (this._animationFinishHandler) {
            const animationComponent = this.getAnimationComponent(false);
            if (animationComponent) {
                animationComponent.off(Animation.EventType.FINISHED, this._animationFinishHandler, this);
            }
            this._animationFinishHandler = null;
        }
    }

    private getAnimationComponent(allowFetch = true): Animation | null {
        if (this.animation && this.animation.isValid) {
            return this.animation;
        }

        if (!allowFetch) {
            return null;
        }

        const anim = this.getComponent(Animation);
        this.animation = anim;
        return anim;
    }

    private stopMovementTweenOnly(): void {
        if (this._moveTween) {
            this._moveTween.stop();
            this._moveTween = null;
        }
    }
}
