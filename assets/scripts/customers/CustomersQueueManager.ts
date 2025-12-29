import { _decorator, Component, Node, Vec3, tween } from 'cc';
import { CatAnimationController } from 'db://assets/scripts/CatAnimationController';
import { CustomersQueueEvent, CustomersQueueEvents } from 'db://assets/scripts/customers/CustomersQueueEvents';
import { OrderPopup } from 'db://assets/scripts/OrderPopup';

const { ccclass, property } = _decorator;

type ColumnData = {
    id: number;
    sortIndex: number;
    centerX: number;
    entries: QueueEntry[];
};

type QueueEntry = {
    node: Node;
    targetPosition: Vec3;
    column: ColumnData;
};

function cloneVec3 (source: Vec3): Vec3 {
    return new Vec3(source.x, source.y, source.z);

}

@ccclass('CustomersQueueManager')
export class CustomersQueueManager extends Component {
    @property({ tooltip: 'Khoảng cách tối đa để gom mèo vào cùng 1 hàng theo trục X', min: 0 })
    columnSnapThreshold = 0.75;

    @property({ type: Vec3, tooltip: 'Vector local mèo sẽ di chuyển khi rời hàng' })
    exitOffset: Vec3 = new Vec3(0, 0, -2);

    @property({ tooltip: 'Khoảng cách mèo bước sang ngang trước khi rời hàng', min: 0 })
    sideStepDistance = 0.8;

    @property({ tooltip: 'Thời gian tween bước ngang (giây)', min: 0 })
    sideStepDuration = 0.2;

    @property({ tooltip: 'Thời gian tween mèo rời hàng (giây)', min: 0 })
    exitDuration = 0.35;

    @property({ tooltip: 'Hệ số làm chậm mèo khi rời hàng (>=1 chậm hơn)', min: 0 })
    exitDurationScale = 1.5;

    @property({ tooltip: 'Thời gian chờ trước khi mèo quay lại cuối hàng', min: 0 })
    rejoinDelay = 0.1;

    @property({ tooltip: 'Thời gian tween mèo quay lại cuối hàng (giây)', min: 0 })
    rejoinDuration = 0.4;

    @property({ tooltip: 'Thời gian tween mèo còn lại tiến lên (giây)', min: 0 })
    shiftDuration = 0.25;

    private _columns: ColumnData[] = [];
    private _entryLookup = new Map<string, QueueEntry>();
    private _columnAdvanceMultipliers = new Map<number, number>();

    onLoad (): void {
        CustomersQueueEvents.on(CustomersQueueEvent.ORDER_COMPLETED, this.onOrderCompleted, this);
    }

    start (): void {
        this.buildQueues();
    }

    onDestroy (): void {
        CustomersQueueEvents.off(CustomersQueueEvent.ORDER_COMPLETED, this.onOrderCompleted, this);
    }

    private buildQueues (): void {
        this._columns = [];
        this._entryLookup.clear();

        const controllers = this.node.getComponentsInChildren(CatAnimationController);

        controllers.forEach((ctrl) => {
            const column = this.getOrCreateColumn(ctrl.node.position.x);
            const targetPosition = cloneVec3(ctrl.node.getPosition());

            const entry: QueueEntry = {
                node: ctrl.node,
                targetPosition,
                column,
            };

            column.entries.push(entry);
            this._entryLookup.set(ctrl.node.uuid, entry);
        });

        this._columns.sort((a, b) => a.centerX - b.centerX);

        this._columns.forEach((column, index) => {
            column.sortIndex = index;
            column.entries.sort((a, b) => a.targetPosition.z - b.targetPosition.z);
        });
    }

    private getOrCreateColumn (x: number): ColumnData {
        for (const column of this._columns) {
            if (Math.abs(column.centerX - x) <= this.columnSnapThreshold) {
                return column;
            }
        }

        const column: ColumnData = {
            id: this._columns.length,
            sortIndex: this._columns.length,
            centerX: x,
            entries: [],
        };

        this._columns.push(column);
        return column;
    }

    private onOrderCompleted (customerNode: Node): void {
        const entry = this.findEntry(customerNode);
        if (!entry) {
            return;
        }

        const column = entry.column;
        if (!column || column.entries.length === 0) {
            return;
        }

        const frontEntry = column.entries[0];
        if (frontEntry !== entry) {
            const index = column.entries.indexOf(entry);
            if (index < 0) {
                return;
            }

            column.entries.splice(index, 1);
            column.entries.unshift(entry);
        }

        column.entries.shift();
        const rejoinSlot = this.shiftColumnForward(column, entry.targetPosition);
        this.animateDeparture(entry, rejoinSlot);
    }

    private animateDeparture (entry: QueueEntry, rejoinSlot: Vec3): void {
        const sideTarget = cloneVec3(entry.targetPosition);
        sideTarget.x += this.getSideStepDirection(entry.column) * this.sideStepDistance;

        const finalTarget = cloneVec3(sideTarget);
        finalTarget.add(this.exitOffset);

        const sequence = tween(entry.node);

        if (this.sideStepDistance > 0 && this.sideStepDuration > 0) {
            sequence.to(this.sideStepDuration, { position: sideTarget }, { easing: 'sineOut' });
        }

        const exitOutDuration = Math.max(0.01, this.exitDuration * Math.max(0.01, this.exitDurationScale));

        sequence
            .to(exitOutDuration, { position: finalTarget }, { easing: 'sineIn' })
            .call(() => {
                this._entryLookup.delete(entry.node.uuid);
            });

        if (this.rejoinDelay > 0) {
            sequence.delay(this.rejoinDelay);
        }

        const returnDuration = Math.max(this.rejoinDuration > 0 ? this.rejoinDuration : this.shiftDuration, 0.01);

        sequence
            .to(returnDuration, { position: rejoinSlot }, { easing: 'sineOut' })
            .call(() => {
                this.reinsertEntry(entry, rejoinSlot);
            })
            .start();
    }

    private shiftColumnForward (column: ColumnData, freedSlot: Vec3): Vec3 {
        let nextSlot = cloneVec3(freedSlot);

        if (column.entries.length === 0) {
            return nextSlot;
        }

        const advanceDuration = this.getColumnAdvanceDuration(column);

        column.entries.forEach((queueEntry) => {
            const previousSlot = cloneVec3(queueEntry.targetPosition);
            queueEntry.targetPosition = cloneVec3(nextSlot);

            tween(queueEntry.node)
                .stop();

            tween(queueEntry.node)
                .to(advanceDuration, { position: queueEntry.targetPosition }, { easing: 'sineOut' })
                .start();

            nextSlot = previousSlot;
        });

        return nextSlot;
    }

    public setColumnAdvanceMultiplier (columnIndex: number, multiplier: number): void {
        this._columnAdvanceMultipliers.set(columnIndex, Math.max(0.1, multiplier));
    }

    private getColumnAdvanceDuration (column: ColumnData): number {
        const multiplier = this._columnAdvanceMultipliers.get(column.sortIndex) ?? 1;
        return Math.max(0.01, this.shiftDuration / multiplier);
    }

    public resolveCustomerNode (startNode: Node | null): Node | null {
        const entry = this.findEntry(startNode);
        return entry ? entry.node : null;
    }

    public getColumnIndexForNode (startNode: Node | null): number {
        const entry = this.findEntry(startNode);
        return entry ? entry.column.sortIndex : -1;
    }

    public getFrontCustomerNode (columnIndex: number): Node | null {
        const column = this.getColumnByIndex(columnIndex);
        if (!column || column.entries.length === 0) {
            return null;
        }

        return column.entries[0].node;
    }

    private getColumnByIndex (columnIndex: number): ColumnData | null {
        return this._columns.find((col) => col.sortIndex === columnIndex) ?? null;
    }

    private findEntry (startNode: Node | null): QueueEntry | null {
        let current: Node | null = startNode;
        while (current) {
            const entry = this._entryLookup.get(current.uuid);
            if (entry) {
                return entry;
            }
            current = current.parent;
        }

        return null;
    }

    private getSideStepDirection (column: ColumnData): number {
        if (!column) {
            return 1;
        }

        if (column.centerX === 0) {
            const half = (this._columns.length - 1) / 2;
            return column.sortIndex <= half ? -1 : 1;
        }

        return column.centerX >= 0 ? 1 : -1;
    }

    private reinsertEntry (entry: QueueEntry, slot: Vec3): void {
        entry.targetPosition = cloneVec3(slot);
        entry.node.setPosition(slot);
        entry.column.entries.push(entry);
        this._entryLookup.set(entry.node.uuid, entry);
        this.resetCustomerOrder(entry);
    }

    private resetCustomerOrder (entry: QueueEntry): void {
        const popup = entry.node.getComponentInChildren(OrderPopup);
        if (!popup) {
            return;
        }

        popup.refreshSprite();
        popup.resetCount();
        if (popup.parentss) {
            popup.parentss.active = true;
        }
    }
}
