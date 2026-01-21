import { _decorator, Component } from 'cc';

const { ccclass, property } = _decorator;

/**
 * Lightweight tag component that lets gameplay scripts ask a prefab instance
 * which logical item type it represents (cola, burger, money, ...).
 */
@ccclass('CollectibleItem')
export class CollectibleItem extends Component {
    @property({
        tooltip: 'Logical type identifier (e.g. burger, cola). Empty value falls back to this node name.',
    })
    public typeId = '';

    protected onLoad (): void {
        this.ensureTypeId();
    }

    /**
     * Returns the resolved type identifier and lazily fills it when designers leave the field blank.
     */
    public getTypeId (): string {
        this.ensureTypeId();
        return this.typeId;
    }

    /**
     * Matches using a case-insensitive comparison so order logic can stay simple.
     */
    public matchesType (candidate: string): boolean {
        if (!candidate) {
            return false;
        }

        return this.getTypeId().toLowerCase() === candidate.trim().toLowerCase();
    }

    /**
     * Ensures the serialized string stays trimmed and defaults to the node name for ease of setup.
     */
    public ensureTypeId (): void {
        const trimmed = this.typeId.trim();
        if (trimmed.length > 0) {
            this.typeId = trimmed;
            return;
        }

        const fallback = this.node?.name ?? '';
        this.typeId = fallback.trim();
    }
}
