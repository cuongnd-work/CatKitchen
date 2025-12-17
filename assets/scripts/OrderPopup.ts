import { _decorator, Component, SpriteRenderer, SpriteFrame, Label } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('OrderPopup')
export class OrderPopup extends Component {

    @property(SpriteRenderer)
    targetSprite: SpriteRenderer = null!;

    @property(Label)
    text: Label = null!;

    @property([SpriteFrame])
    spriteFrames: SpriteFrame[] = [];

    @property({ tooltip: 'Luôn dùng sprite index 0' })
    alwaysUseFirst: boolean = false;

    count : number = 99;

    start () {
        this.refreshSprite();
    }

    public sell():void {
        this.count--;
        this.text.string = this.count.toString();
    }

    /* ================= CORE ================= */

    public refreshSprite () {
        if (!this.targetSprite || this.spriteFrames.length === 0) {
            return;
        }

        let index = 0;

        if (!this.alwaysUseFirst) {
            index = Math.floor(Math.random() * this.spriteFrames.length);
        }

        this.targetSprite.spriteFrame = this.spriteFrames[index];
    }
}
