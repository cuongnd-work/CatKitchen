import { _decorator, Component, Node } from 'cc';
import {OrderPopup} from "db://assets/scripts/OrderPopup";

const { ccclass, property } = _decorator;

@ccclass('MoveTargetProvider')
export class MoveTargetProvider extends Component {
    private static _instance: MoveTargetProvider | null = null;

    public static get instance (): MoveTargetProvider | null {
        return MoveTargetProvider._instance;
    }

    /* ================= SINGLE TARGET (giữ nguyên) ================= */

    @property(Node)
    public leftTarget: Node | null = null;

    @property(Node)
    public rightTarget: Node | null = null;

    @property({ tooltip: 'World-space X threshold to switch from left to right target' })
    public splitX = 0;

    /* ================= MULTI TARGET (MỚI) ================= */

    @property({ type: [Node], tooltip: 'Danh sách target bên trái (theo cặp index)' })
    public leftTargets: Node[] = [];

    @property({ type: [OrderPopup], tooltip: 'Danh sách target bên phải (theo cặp index)' })
    public rightTargets: OrderPopup[] = [];

    onLoad (): void {
        MoveTargetProvider._instance = this;
    }

    onDestroy (): void {
        if (MoveTargetProvider._instance === this) {
            MoveTargetProvider._instance = null;
        }
    }

    /* ================= API CŨ ================= */

    public getTargetForNode (reference: Node | null): Node | null {
        const worldX = reference ? reference.worldPosition.x : 0;
        return this.getTargetForX(worldX);
    }

    public getTargetForX (worldX: number): Node | null {
        const left = this.leftTarget;
        const right = this.rightTarget;

        if (!left && !right) return null;
        if (!left) return right;
        if (!right) return left;

        return worldX >= this.splitX ? right : left;
    }

    /* ================= API MỚI ================= */

    /**
     * Random 1 cặp target theo index: (leftTargets[i], rightTargets[i])
     */
    public getRandomTargetPair (): { left: Node | null; right: OrderPopup | null } {
        const len = Math.min(this.leftTargets.length, this.rightTargets.length);
        if (len === 0) {
            return { left: null, right: null };
        }

        const index = Math.floor(Math.random() * len);

        return {
            left: this.leftTargets[index] ?? null,
            right: this.rightTargets[index] ?? null,
        };
    }
}
