import { Node, Vec3 } from 'cc';

type MoneyCarryEntry = {
    axis: Vec3;
    shift: number;
};

const _moneyCarryMap: Map<Node, MoneyCarryEntry> = new Map();

export function setMoneyCarryShift (anchor: Node | null, axis: Vec3, shift: number): void {
    if (!anchor) {
        return;
    }

    const normalizedShift = Math.max(0, shift);
    if (normalizedShift <= 0 || axis.lengthSqr() < 0.0001) {
        _moneyCarryMap.delete(anchor);
        return;
    }

    let entry = _moneyCarryMap.get(anchor);
    if (!entry) {
        entry = { axis: new Vec3(), shift: normalizedShift };
        _moneyCarryMap.set(anchor, entry);
    }

    entry.axis.set(axis.x, axis.y, axis.z);
    entry.axis.normalize();
    entry.shift = normalizedShift;
}

export function clearMoneyCarryShift (anchor: Node | null): void {
    if (!anchor) {
        return;
    }
    _moneyCarryMap.delete(anchor);
}

export function getMoneyCarryShift (anchor: Node | null, outAxis: Vec3): number {
    if (!anchor) {
        outAxis.set(0, 0, 0);
        return 0;
    }

    const entry = _moneyCarryMap.get(anchor);
    if (!entry) {
        outAxis.set(0, 0, 0);
        return 0;
    }

    outAxis.set(entry.axis.x, entry.axis.y, entry.axis.z);
    return entry.shift;
}
