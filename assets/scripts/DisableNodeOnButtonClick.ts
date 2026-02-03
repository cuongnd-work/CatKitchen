import { _decorator, Button, Component, Node, warn } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('DisableNodeOnButtonClick')
export class DisableNodeOnButtonClick extends Component {
    @property({ type: Node, tooltip: 'Node that will be disabled when this button is clicked.' })
    public target: Node | null = null;

    private _button: Button | null = null;

    protected onEnable(): void {
        this._button = this.getComponent(Button);
        if (!this._button) {
            warn('[DisableNodeOnButtonClick] Attach this script to a node with a Button component.');
            return;
        }

        this._button.node.on(Button.EventType.CLICK, this.handleClick, this);
    }

    protected onDisable(): void {
        if (this._button) {
            this._button.node.off(Button.EventType.CLICK, this.handleClick, this);
        }
    }

    private handleClick(): void {
        if (!this.target || !this.target.isValid) {
            warn('[DisableNodeOnButtonClick] Assign a valid target node to disable.');
            return;
        }

        this.target.active = false;
    }
}
