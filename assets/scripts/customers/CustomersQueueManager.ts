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

    @property({ type: Node, tooltip: 'Điểm đích để khách đầu hàng chạy tới sau khi được phục vụ xong.' })
    exitTarget: Node | null = null;

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

    @property({ tooltip: 'Cho khách quay lại cuối hàng sau khi tới điểm đích.' })
    requeueAfterExit = false;

    @property({ tooltip: 'Thời gian chờ trước khi mèo quay lại cuối hàng', min: 0, visible () { return this.requeueAfterExit; } })
    rejoinDelay = 0.1;

    @property({ tooltip: 'Thời gian tween mèo quay lại cuối hàng (giây)', min: 0, visible () { return this.requeueAfterExit; } })
    rejoinDuration = 0.4;

    @property({ tooltip: 'Tắt khách sau khi tới điểm đích nếu không quay lại hàng.' })
    deactivateCustomerOnExit = false;

    @property({ tooltip: 'Thời gian tween mèo còn lại tiến lên (giây)', min: 0 })
    shiftDuration = 0.25;

    @property({ tooltip: 'Delay (seconds) before the next customer advances after a sale completes', min: 0 })
    frontAdvanceDelay = 0.3;

    private _columns: ColumnData[] = [];
    private _entryLookup = new Map<string, QueueEntry>();
    private _columnAdvanceMultipliers = new Map<number, number>();
    private _activeCustomers = new Set<string>();
    private _advancingColumns = new Set<number>();
    private _worldScratch: Vec3 = new Vec3();
    private _localScratch: Vec3 = new Vec3();

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

    public beginServingCustomer (customerNode: Node): boolean {
        const entry = this.findEntry(customerNode);
        if (!entry) {
            return false;
        }

        if (this._activeCustomers.has(entry.node.uuid)) {
            return false;
        }

        const column = entry.column;
        if (!column || column.entries.length === 0 || this.isColumnAdvancing(column)) {
            return false;
        }

        const frontEntry = column.entries[0];
        if (frontEntry !== entry) {
            return false;
        }

        this._activeCustomers.add(entry.node.uuid);
        return true;
    }

    public finishServingCustomer (customerNode: Node): boolean {
        const entry = this.findEntry(customerNode);
        if (!entry) {
            return false;
        }

        return this._activeCustomers.delete(entry.node.uuid);
    }

    public completeServingCustomer (customerNode: Node): boolean {
        const entry = this.findEntry(customerNode);
        if (!entry) {
            return false;
        }

        const column = entry.column;
        if (!column || column.entries.length === 0) {
            return false;
        }

        const frontEntry = column.entries[0];
        if (frontEntry !== entry) {
            return false;
        }

        this._activeCustomers.delete(entry.node.uuid);
        column.entries.shift();
        this._entryLookup.delete(entry.node.uuid);
        this.hideCustomerOrder(entry);
        this.setColumnAdvancing(column, true);

        const freedSlot = cloneVec3(entry.targetPosition);
        const performAdvance = () => {
            const rejoinSlot = this.shiftColumnForward(column, freedSlot);
            const advanceDuration = column.entries.length > 0 ? this.getColumnAdvanceDuration(column) : 0;

            this.animateDeparture(entry, this.requeueAfterExit ? rejoinSlot : null);

            if (advanceDuration > 0) {
                this.scheduleOnce(() => {
                    this.setColumnAdvancing(column, false);
                }, advanceDuration);
            } else {
                this.setColumnAdvancing(column, false);
            }
        };

        const delay = Math.max(0, this.frontAdvanceDelay);
        if (delay > 0) {
            this.scheduleOnce(performAdvance, delay);
        } else {
            performAdvance();
        }

        return true;
    }

    private onOrderCompleted (customerNode: Node): void {
        this.completeServingCustomer(customerNode);
    }

    private animateDeparture (entry: QueueEntry, rejoinSlot: Vec3 | null): void {
        const startTarget = cloneVec3(entry.node.getPosition());
        const sideTarget = cloneVec3(startTarget);
        sideTarget.x += this.getSideStepDirection(entry.column) * this.sideStepDistance;

        const travelOrigin = this.sideStepDistance > 0 ? sideTarget : startTarget;
        const finalTarget = this.resolveExitPosition(entry, travelOrigin);

        const sequence = tween(entry.node);

        if (this.sideStepDistance > 0 && this.sideStepDuration > 0) {
            sequence.to(this.sideStepDuration, { position: sideTarget }, { easing: 'sineOut' });
        }

        const exitOutDuration = Math.max(0.01, this.exitDuration * Math.max(0.01, this.exitDurationScale));

        sequence
            .to(exitOutDuration, { position: finalTarget }, { easing: 'sineIn' })
            .call(() => {
                entry.targetPosition = cloneVec3(finalTarget);
                if (!this.requeueAfterExit && this.deactivateCustomerOnExit) {
                    entry.node.active = false;
                }
            });

        if (!this.requeueAfterExit || !rejoinSlot) {
            sequence.start();
            return;
        }

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

    private resolveExitPosition (entry: QueueEntry, fallbackOrigin: Vec3): Vec3 {
        if (!this.exitTarget || !this.exitTarget.isValid) {
            const finalTarget = cloneVec3(fallbackOrigin);
            finalTarget.add(this.exitOffset);
            return finalTarget;
        }

        this.exitTarget.getWorldPosition(this._worldScratch);

        const parent = entry.node.parent;
        if (!parent || !parent.isValid) {
            return cloneVec3(this._worldScratch);
        }

        parent.inverseTransformPoint(this._localScratch, this._worldScratch);
        return cloneVec3(this._localScratch);
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
        if (!column || column.entries.length === 0 || this.isColumnAdvancing(column)) {
            return null;
        }

        const customerNode = column.entries[0].node;
        if (!customerNode || !customerNode.isValid || this._activeCustomers.has(customerNode.uuid)) {
            return null;
        }

        return customerNode;
    }

    public getFrontMostCustomerNode (): Node | null {
        let bestNode: Node | null = null;
        let bestZ = Number.POSITIVE_INFINITY;
        let bestX = Number.POSITIVE_INFINITY;

        this._entryLookup.forEach((entry) => {
            const node = entry.node;
            if (!node || !node.isValid || !node.activeInHierarchy) {
                return;
            }

            if (this._activeCustomers.has(node.uuid) || this.isColumnAdvancing(entry.column)) {
                return;
            }

            node.getWorldPosition(this._worldScratch);
            const candidateZ = this._worldScratch.z;
            const candidateX = this._worldScratch.x;

            if (
                !bestNode ||
                candidateZ < bestZ - 0.0001 ||
                (Math.abs(candidateZ - bestZ) <= 0.0001 && candidateX < bestX - 0.0001)
            ) {
                bestNode = node;
                bestZ = candidateZ;
                bestX = candidateX;
            }
        });

        return bestNode;
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

    private isColumnAdvancing (column: ColumnData | null): boolean {
        if (!column) {
            return false;
        }

        return this._advancingColumns.has(column.id);
    }

    private setColumnAdvancing (column: ColumnData | null, advancing: boolean): void {
        if (!column) {
            return;
        }

        if (advancing) {
            this._advancingColumns.add(column.id);
            return;
        }

        this._advancingColumns.delete(column.id);
    }

    private hideCustomerOrder (entry: QueueEntry): void {
        const popup = entry.node.getComponentInChildren(OrderPopup);
        if (!popup || !popup.parentss) {
            return;
        }

        popup.parentss.active = false;
    }

    private reinsertEntry (entry: QueueEntry, slot: Vec3): void {
        entry.targetPosition = cloneVec3(slot);
        entry.node.active = false;
        entry.node.setPosition(slot);
        entry.column.entries.push(entry);
        this._entryLookup.set(entry.node.uuid, entry);
        this.resetCustomerOrder(entry);
        entry.node.active = true;
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



