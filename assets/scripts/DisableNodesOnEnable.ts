import { _decorator, Component, Node } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('DisableNodesOnEnable')
export class DisableNodesOnEnable extends Component {
    @property({ type: [Node], tooltip: 'These nodes will be disabled when this component becomes enabled.' })
    public targets: Node[] = [];

    @property({ tooltip: 'Re-enable the targets when this component disables.' })
    public restoreOnDisable = true;

    private _previousStates: Array<{ node: Node; wasActive: boolean }> = [];

    protected onEnable(): void {
        this._previousStates.length = 0;
        for (const node of this.targets) {
            if (!node || !node.isValid) {
                continue;
            }

            this._previousStates.push({ node, wasActive: node.active });
            node.active = false;
        }
    }

    protected onDisable(): void {
        if (!this.restoreOnDisable) {
            return;
        }

        this._previousStates.forEach(({ node, wasActive }) => {
            if (node && node.isValid) {
                node.active = wasActive;
            }
        });
        this._previousStates.length = 0;
    }
}
