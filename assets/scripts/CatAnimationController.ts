import { _decorator, Component, Node, SkeletalAnimation } from 'cc';
import { OrderPopup } from 'db://assets/scripts/OrderPopup';
import { CurrencyView } from 'db://assets/scripts/CurrencyView';
const { ccclass, property } = _decorator;

@ccclass('CatAnimationController')
export class CatAnimationController extends Component {
    @property(SkeletalAnimation)
    private animation: SkeletalAnimation = null!;

    @property(OrderPopup)
    public orderPopup: OrderPopup = null;

    protected onLoad (): void {
        this.resolveOrderPopup();
    }

    public sellTargetPopup: OrderPopup | null = null;

    private resolveOrderPopup (): OrderPopup | null {
        if (!this.orderPopup) {
            this.orderPopup = this.getComponentInChildren(OrderPopup);
        }

        return this.orderPopup;
    }

    public doIdle(){
        this.animation.play("Dung");
    }

    public doWalk(){
        // const popup = this.resolveOrderPopup();
        // if (popup) {
        //     popup.sell();
        // }

        if(this.sellTargetPopup){
            this.sellTargetPopup.sell();
        }

        if (CurrencyView.instance) {
            CurrencyView.instance.addCurrency(50);
        }
        this.animation.play("Walk_Angry");
    }

    public doBedo(){
        this.animation.play("Bedo");
    }

    public doDoing(){
        this.animation.play("Doing");
    }
}


