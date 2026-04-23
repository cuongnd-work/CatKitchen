import { _decorator, AnimationClip, Component, Node, SkeletalAnimation, Tween, Vec3, tween } from 'cc';
import { CatAnimationController } from 'db://assets/scripts/CatAnimationController';
import { CustomersQueueEvent, CustomersQueueEvents } from 'db://assets/scripts/customers/CustomersQueueEvents';
import { OrderPopup } from 'db://assets/scripts/OrderPopup';
import { RandomSkeletalAnimationByClip } from 'db://assets/scripts/RandomSkeletalAnimationPlayer';

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

function projectVec3 (source: Vec3, axis: Vec3): number {
    return source.x * axis.x + source.y * axis.y + source.z * axis.z;

}

@ccclass('CustomersQueueManager')
export class CustomersQueueManager extends Component {
    @property({ tooltip: 'Khoảng cách tối đa để gom mèo vào cùng 1 hàng theo trục X', min: 0 })
    columnSnapThreshold = 0.75;

    @property({ tooltip: 'Xử lý toàn bộ customer như một hàng chờ 1 chiều, thay vì từng cột riêng lẻ.' })
    useSingleLineQueue = false;

    @property({
        tooltip: 'Nếu bật, hàng 1 chiều sẽ dùng đúng thứ tự node con trong hierarchy để xác định đầu hàng -> cuối hàng.',
        visible () {
            return this.useSingleLineQueue;
        },
    })
    singleLineUseSiblingOrder = false;

    @property({
        type: Vec3,
        tooltip: 'Trục local dùng để sắp xếp hàng 1 chiều từ đầu hàng tới cuối hàng.',
        visible () {
            return this.useSingleLineQueue;
        },
    })
    singleLineAxis: Vec3 = new Vec3(1, 0, 0);

    @property({
        tooltip: 'Nếu bật, giá trị lớn hơn trên trục single-line sẽ nằm gần quầy hơn.',
        visible () {
            return this.useSingleLineQueue;
        },
    })
    singleLineFrontUsesMaxAxis = true;

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

    @property({ tooltip: 'Tốc độ di chuyển của khách khi đi ra điểm end. 0.5 = chậm còn một nửa.', min: 0.01 })
    exitMoveSpeedScale = 0.5;

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

    @property({ type: AnimationClip, tooltip: 'Kéo clip Walk_Angry vào đây để ép customer dùng đúng clip khi di chuyển.' })
    walkAngryClip: AnimationClip | null = null;

    @property({ type: RandomSkeletalAnimationByClip, tooltip: 'Random animation player for customer idle states (auto-find when empty).' })
    randomAnimationPlayer: RandomSkeletalAnimationByClip | null = null;

    private _columns: ColumnData[] = [];
    private _entryLookup = new Map<string, QueueEntry>();
    private _columnAdvanceMultipliers = new Map<number, number>();
    private _activeCustomers = new Set<string>();
    private _advancingColumns = new Set<number>();
    private _singleLineEntries: QueueEntry[] = [];
    private _singleLineAdvancing = false;
    private _singleLineAxisScratch: Vec3 = new Vec3(1, 0, 0);
    private _worldScratch: Vec3 = new Vec3();
    private _localScratch: Vec3 = new Vec3();

    onLoad (): void {
        CustomersQueueEvents.on(CustomersQueueEvent.ORDER_COMPLETED, this.onOrderCompleted, this);
    }

    start (): void {
        this.buildQueues();
        this.syncRandomAnimationPlayerTargets();
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
            column.entries.sort((a, b) => b.targetPosition.z - a.targetPosition.z);
        });

        this.rebuildSingleLineEntries();
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

        if (this.useSingleLineQueue) {
            if (this._singleLineAdvancing || this._singleLineEntries.length === 0) {
                return false;
            }

            const frontEntry = this._singleLineEntries[0];
            if (frontEntry !== entry) {
                return false;
            }

            this._activeCustomers.add(entry.node.uuid);
            return true;
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

        if (this.useSingleLineQueue) {
            return this.completeSingleLineServingCustomer(entry);
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

    private completeSingleLineServingCustomer (entry: QueueEntry): boolean {
        if (this._singleLineAdvancing || this._singleLineEntries.length === 0) {
            return false;
        }

        const frontEntry = this._singleLineEntries[0];
        if (frontEntry !== entry) {
            return false;
        }

        this._activeCustomers.delete(entry.node.uuid);
        this._singleLineEntries.shift();
        this._entryLookup.delete(entry.node.uuid);
        this.hideCustomerOrder(entry);
        this._singleLineAdvancing = true;

        const freedSlot = cloneVec3(entry.targetPosition);
        const performAdvance = () => {
            const rejoinSlot = this.shiftEntriesForward(this._singleLineEntries, freedSlot, null);
            const advanceDuration = this._singleLineEntries.length > 0 ? this.shiftDuration : 0;

            this.animateDeparture(entry, this.requeueAfterExit ? rejoinSlot : null);

            if (advanceDuration > 0) {
                this.scheduleOnce(() => {
                    this._singleLineAdvancing = false;
                }, advanceDuration);
            } else {
                this._singleLineAdvancing = false;
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
        const controller = entry.node.getComponent(CatAnimationController);
        const startTarget = cloneVec3(entry.node.getPosition());
        const finalTarget = this.resolveExitPosition(entry, startTarget);
        const exitSpeedScale = Math.max(0.01, this.exitMoveSpeedScale);

        const sequence = tween(entry.node);
        this.applyMovingAnimation(controller, exitSpeedScale);

        const exitOutDuration = Math.max(0.01, this.exitDuration * Math.max(0.01, this.exitDurationScale) / exitSpeedScale);

        sequence
            .to(exitOutDuration, { position: finalTarget }, { easing: 'sineIn' })
            .call(() => {
                entry.targetPosition = cloneVec3(finalTarget);
                controller?.setModelVisible(false);
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
        return this.shiftEntriesForward(column.entries, freedSlot, column);
    }

    private shiftEntriesForward (entries: QueueEntry[], freedSlot: Vec3, column: ColumnData | null): Vec3 {
        let nextSlot = cloneVec3(freedSlot);

        if (entries.length === 0) {
            return nextSlot;
        }

        const advanceDuration = column ? this.getColumnAdvanceDuration(column) : Math.max(0.01, this.shiftDuration);

        entries.forEach((queueEntry) => {
            const previousSlot = cloneVec3(queueEntry.targetPosition);
            queueEntry.targetPosition = cloneVec3(nextSlot);
            const controller = queueEntry.node.getComponent(CatAnimationController);
            this.applyMovingAnimation(controller, 1);

            Tween.stopAllByTarget(queueEntry.node);

            tween(queueEntry.node)
                .to(advanceDuration, { position: queueEntry.targetPosition }, { easing: 'sineOut' })
                .call(() => {
                    this.applyIdleOrRandomAnimation(controller);
                })
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
        if (this.useSingleLineQueue) {
            if (this._singleLineAdvancing || this._singleLineEntries.length === 0) {
                return null;
            }

            const frontEntry = this._singleLineEntries[0];
            if (columnIndex >= 0 && frontEntry.column.sortIndex !== columnIndex) {
                return null;
            }

            const customerNode = frontEntry.node;
            if (!customerNode || !customerNode.isValid || !customerNode.activeInHierarchy || this._activeCustomers.has(customerNode.uuid)) {
                return null;
            }

            return customerNode;
        }

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
        if (this.useSingleLineQueue) {
            if (this._singleLineAdvancing || this._singleLineEntries.length === 0) {
                return null;
            }

            const frontEntry = this._singleLineEntries[0];
            const node = frontEntry?.node ?? null;
            if (!node || !node.isValid || !node.activeInHierarchy || this._activeCustomers.has(node.uuid)) {
                return null;
            }

            return node;
        }

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

    private rebuildSingleLineEntries (): void {
        if (!this.useSingleLineQueue) {
            this._singleLineEntries.length = 0;
            return;
        }

        if (this.singleLineUseSiblingOrder) {
            this._singleLineEntries = Array.from(this._entryLookup.values());
            this._singleLineEntries.sort((a, b) => {
                const siblingDelta = a.node.getSiblingIndex() - b.node.getSiblingIndex();
                if (siblingDelta !== 0) {
                    return siblingDelta;
                }

                return a.node.name.localeCompare(b.node.name);
            });
            return;
        }

        const axis = this.getSingleLineAxis();
        this._singleLineEntries = Array.from(this._entryLookup.values());
        this._singleLineEntries.sort((a, b) => {
            const projectionDelta = projectVec3(a.targetPosition, axis) - projectVec3(b.targetPosition, axis);
            if (Math.abs(projectionDelta) > 0.0001) {
                return this.singleLineFrontUsesMaxAxis ? -projectionDelta : projectionDelta;
            }

            return b.targetPosition.z - a.targetPosition.z;
        });
    }

    private getSingleLineAxis (): Vec3 {
        this._singleLineAxisScratch.set(this.singleLineAxis.x, this.singleLineAxis.y, this.singleLineAxis.z);
        if (this._singleLineAxisScratch.lengthSqr() < 0.0001) {
            this._singleLineAxisScratch.set(1, 0, 0);
        }

        this._singleLineAxisScratch.normalize();
        return this._singleLineAxisScratch;
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
        const popup = entry.node.getComponent(CatAnimationController)?.getOrderPopup()
            ?? entry.node.getComponentsInChildren(OrderPopup).find((candidate) => candidate?.isValid && candidate.belongsToCustomer(entry.node))
            ?? null;
        if (!popup || !popup.parentss) {
            return;
        }

        popup.parentss.active = false;
    }

    private reinsertEntry (entry: QueueEntry, slot: Vec3): void {
        const controller = entry.node.getComponent(CatAnimationController);
        entry.targetPosition = cloneVec3(slot);
        entry.node.active = false;
        entry.node.setPosition(slot);
        if (this.useSingleLineQueue) {
            this._singleLineEntries.push(entry);
        } else {
            entry.column.entries.push(entry);
        }
        this._entryLookup.set(entry.node.uuid, entry);
        this.resetCustomerOrder(entry);
        entry.node.active = true;
        this.applyIdleOrRandomAnimation(controller);
    }

    private applyMovingAnimation (controller: CatAnimationController | null, speed = 1): void {
        if (!controller) {
            return;
        }

        controller.setModelVisible(true);
        const skeletal = controller.getSkeletalAnimation();
        this.resolveRandomAnimationPlayer()?.suspendFor(skeletal);
        controller.playWalkAngry(speed, this.walkAngryClip);
    }

    private applyIdleOrRandomAnimation (controller: CatAnimationController | null): void {
        if (!controller) {
            return;
        }

        controller.setModelVisible(true);
        const skeletal = controller.getSkeletalAnimation();
        const randomPlayer = this.resolveRandomAnimationPlayer();
        if (randomPlayer && skeletal && randomPlayer.resumeFor(skeletal)) {
            return;
        }

        controller.doIdle();
    }

    private resolveRandomAnimationPlayer (): RandomSkeletalAnimationByClip | null {
        if (this.randomAnimationPlayer && this.randomAnimationPlayer.isValid) {
            return this.randomAnimationPlayer;
        }

        let player = this.node.getComponent(RandomSkeletalAnimationByClip)
            ?? this.node.getComponentInChildren(RandomSkeletalAnimationByClip);

        if (!player) {
            const scene = this.node.scene;
            if (scene) {
                player = scene.getComponentInChildren(RandomSkeletalAnimationByClip);
            }
        }

        this.randomAnimationPlayer = player ?? null;
        return this.randomAnimationPlayer;
    }

    private syncRandomAnimationPlayerTargets (): void {
        const randomPlayer = this.resolveRandomAnimationPlayer();
        if (!randomPlayer) {
            return;
        }

        const targets: SkeletalAnimation[] = [];
        this._entryLookup.forEach((entry) => {
            const controller = entry.node.getComponent(CatAnimationController);
            const skeletal = controller?.getSkeletalAnimation();
            if (!skeletal || !skeletal.isValid) {
                return;
            }

            if (targets.indexOf(skeletal) !== -1) {
                return;
            }

            targets.push(skeletal);
        });

        if (targets.length > 0) {
            randomPlayer.skeletalAnims = targets;
            targets.forEach((skeletal) => {
                randomPlayer.resumeFor(skeletal);
            });
        }
    }

    private resetCustomerOrder (entry: QueueEntry): void {
        const popup = entry.node.getComponent(CatAnimationController)?.getOrderPopup()
            ?? entry.node.getComponentsInChildren(OrderPopup).find((candidate) => candidate?.isValid && candidate.belongsToCustomer(entry.node))
            ?? null;
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



