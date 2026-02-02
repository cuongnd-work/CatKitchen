import { _decorator, Component, Node } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('EnableNodesOnEnable')
export class EnableNodesOnEnable extends Component {
    @property({ type: [Node], tooltip: 'These nodes will be enabled when this component becomes enabled.' })
    public targets: Node[] = [];

    protected onEnable(): void {
        this.toggleTargets(true);
    }

    private toggleTargets(active: boolean): void {
        for (const node of this.targets) {
            if (!node || !node.isValid) {
                continue;
            }

            node.active = active;
        }
    }
}
