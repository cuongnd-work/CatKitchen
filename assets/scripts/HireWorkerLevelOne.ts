import { _decorator, Node } from 'cc';
import { MoneyPaymentZone } from './MoneyPaymentZone';
import { SpawnZone } from './SpawnZone';

const { ccclass, property } = _decorator;

@ccclass('HireWorkerLevelOne')
export class HireWorkerLevelOne extends MoneyPaymentZone {
    @property({ type: Node, tooltip: 'Node enabled once the worker is hired.' })
    public workerNode: Node | null = null;

    @property({ tooltip: 'Message logged when this worker becomes active.' })
    public hireMessage = 'Worker level 1 hired!';

    @property({ type: SpawnZone, tooltip: 'Spawn zone that should keep spawning after hiring.' })
    public autoSpawnZone: SpawnZone | null = null;

    protected onPaymentSatisfied (_amount: number): void {
        if (this.workerNode && !this.workerNode.active) {
            this.workerNode.active = true;
        }
        this.autoSpawnZone?.setAutoCollectEnabled(true);
        console.log(`[HireWorkerLevelOne] ${this.node.name}: ${this.hireMessage}`);
    }
}
