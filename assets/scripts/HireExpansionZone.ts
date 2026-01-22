import { _decorator, Node } from 'cc';
import { MoneyPaymentZone } from './MoneyPaymentZone';

const { ccclass, property } = _decorator;

@ccclass('HireExpansionZone')
export class HireExpansionZone extends MoneyPaymentZone {
    @property({ type: Node, tooltip: 'Area or building enabled when the expansion is purchased.' })
    public expansionRoot: Node | null = null;

    @property({ tooltip: 'Message logged when the expansion is purchased.' })
    public expansionMessage = 'Expansion unlocked!';

    protected onPaymentSatisfied (_amount: number): void {
        if (this.expansionRoot) {
            this.expansionRoot.active = true;
        }

        console.log(`[HireExpansionZone] ${this.node.name}: ${this.expansionMessage}`);
    }
}
