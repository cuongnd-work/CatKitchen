import { _decorator, Component, Node, warn } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('EnableNodeAfterDelay')
export class EnableNodeAfterDelay extends Component {
    @property({ type: Node, tooltip: 'Node enabled after the configured delay once this component node becomes active.' })
    public target: Node | null = null;

    @property({ tooltip: 'Seconds to wait before enabling the target node.' })
    public delay = 0;

    @property({ tooltip: 'Run only once. Leave unchecked to repeat every time this component re-enables.' })
    public runOnce = false;

    private _hasRun = false;
    private _pendingCallback: (() => void) | null = null;

    protected onEnable(): void {
        if (this.runOnce && this._hasRun) {
            return;
        }

        this.scheduleEnable();
    }

    protected onDisable(): void {
        this.cancelScheduledEnable();
    }

    private scheduleEnable(): void {
        this.cancelScheduledEnable();

        if (!this.target || !this.target.isValid) {
            warn('[EnableNodeAfterDelay] Assign a valid target node.');
            return;
        }

        const callback = () => {
            this._pendingCallback = null;

            if (!this.target || !this.target.isValid) {
                warn('[EnableNodeAfterDelay] Target became invalid before enable.');
                return;
            }

            this.target.active = true;
            this._hasRun = true;
        };

        this._pendingCallback = callback;

        const delay = Math.max(0, this.delay);
        if (delay === 0) {
            callback();
            return;
        }

        this.scheduleOnce(callback, delay);
    }

    private cancelScheduledEnable(): void {
        if (this._pendingCallback) {
            this.unschedule(this._pendingCallback);
            this._pendingCallback = null;
        }
    }
}
