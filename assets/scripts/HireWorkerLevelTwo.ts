import { _decorator, Node } from 'cc';
import { MoneyPaymentZone } from './MoneyPaymentZone';

const { ccclass, property } = _decorator;

@ccclass('HireWorkerLevelTwo')
export class HireWorkerLevelTwo extends MoneyPaymentZone {
    @property({ type: Node, tooltip: 'Node activated when the second worker is unlocked.' })
    public workerNode: Node | null = null;

    @property({ tooltip: 'Optional visual to toggle once the worker is available.' })
    public indicatorNode: Node | null = null;

    @property({ tooltip: 'Message logged when the worker is hired.' })
    public hireMessage = 'Worker level 2 unlocked!';

    protected onPaymentSatisfied (_amount: number): void {
        if (this.workerNode) {
            this.workerNode.active = true;
        }
        if (this.indicatorNode) {
            this.indicatorNode.active = false;
        }
        console.log(`[HireWorkerLevelTwo] ${this.node.name}: ${this.hireMessage}`);
    }
}
