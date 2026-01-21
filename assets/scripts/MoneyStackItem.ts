import { _decorator, Component } from 'cc';
import type { ItemSellTrigger } from './ItemSellTrigger';

const { ccclass } = _decorator;

@ccclass('MoneyStackItem')
export class MoneyStackItem extends Component {
    public owner: ItemSellTrigger | null = null;
    public slotIndex = -1;

    public reset (): void {
        this.owner = null;
        this.slotIndex = -1;
    }
}
