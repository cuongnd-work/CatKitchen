import { _decorator, Component, Node, SkeletalAnimation } from 'cc';
import { CurrencyView } from 'db://assets/scripts/CurrencyView';
const { ccclass, property } = _decorator;

@ccclass('CatAnimationController')
export class CatAnimationController extends Component {
    @property(SkeletalAnimation)
    private animation: SkeletalAnimation = null!;


    protected onLoad (): void {
    }

    public doIdle(){
        this.animation.play("Dung");
    }

    public doWalk(){
        // const popup = this.resolveOrderPopup();
        // if (popup) {
        //     popup.sell();
        // }

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


