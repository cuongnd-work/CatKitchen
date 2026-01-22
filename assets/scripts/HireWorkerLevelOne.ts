import { _decorator, Component, Node } from 'cc';
import { MoneyPaymentZone } from './MoneyPaymentZone';

const { ccclass, property } = _decorator;

@ccclass('HireWorkerLevelOne')
export class HireWorkerLevelOne extends MoneyPaymentZone {
    @property({ type: Node, tooltip: 'Node enabled once the worker is hired.' })
    public workerNode: Node | null = null;

    @property({ tooltip: 'Message logged when this worker becomes active.' })
    public hireMessage = 'Worker level 1 hired!';

    protected onPaymentSatisfied (_amount: number): void {
        if (this.workerNode && !this.workerNode.active) {
            this.workerNode.active = true;
        }
        console.log(`[HireWorkerLevelOne] ${this.node.name}: ${this.hireMessage}`);
    }
}
