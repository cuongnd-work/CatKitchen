import { _decorator, Component, Vec3 } from 'cc';

const { ccclass, property } = _decorator;

const tempPosition = new Vec3();

/**
 * Adds a subtle floating/bobbing motion on the Y axis to mimic hovering.
 */
@ccclass('FloatingHover')
export class FloatingHover extends Component {

    @property({ tooltip: 'Maximum distance (in units) away from the start Y position.' })
    public amplitude: number = 10;

    @property({ tooltip: 'Seconds required to complete one up & down cycle.' })
    public cycleDuration: number = 2;

    @property({ tooltip: 'Animate in world space instead of local space.' })
    public useWorldSpace: boolean = false;

    @property({ tooltip: 'Offset the animation phase randomly for each instance.' })
    public randomizePhase: boolean = true;

    private _startPosition: Vec3 = new Vec3();
    private _time: number = 0;

    onEnable() {
        this.captureStartPosition();
        this._time = this.randomizePhase ? Math.random() * Math.PI * 2 : 0;
    }

    onDisable() {
        this.applyPosition(0);
    }

    update(deltaTime: number) {
        if (this.cycleDuration <= 0) {
            return;
        }

        const angularSpeed = (Math.PI * 2) / this.cycleDuration;
        this._time += deltaTime * angularSpeed;
        const offset = Math.sin(this._time) * this.amplitude;

        this.applyPosition(offset);
    }

    private captureStartPosition() {
        if (this.useWorldSpace) {
            this.node.getWorldPosition(this._startPosition);
        } else {
            this.node.getPosition(this._startPosition);
        }
    }

    private applyPosition(yOffset: number) {
        tempPosition.set(this._startPosition);
        tempPosition.y = this._startPosition.y + yOffset;

        if (this.useWorldSpace) {
            this.node.setWorldPosition(tempPosition);
        } else {
            this.node.setPosition(tempPosition);
        }
    }
}
