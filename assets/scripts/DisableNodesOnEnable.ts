import { _decorator, Component, Node } from 'cc';

const { ccclass, property } = _decorator;

/**
 * Simple helper that turns off a list of nodes every time this component enables.
 */
@ccclass('DisableNodesOnEnable')
export class DisableNodesOnEnable extends Component {
    @property({ type: [Node], tooltip: 'Các node sẽ bị tắt khi component này bật.' })
    nodesToDisable: Node[] = [];

    protected onEnable(): void {
        this.nodesToDisable.forEach(node => {
            if (node && node.isValid) {
                node.active = false;
            }
        });
    }
}
