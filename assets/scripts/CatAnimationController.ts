import { _decorator, Component, Node, SkeletalAnimation } from 'cc';
import {OrderPopup} from "db://assets/scripts/OrderPopup";
const { ccclass, property } = _decorator;

@ccclass('CatAnimationController')
export class CatAnimationController extends Component {
    @property(SkeletalAnimation)
    private animation: SkeletalAnimation = null!;

    @property(OrderPopup)
    public orderPopup: OrderPopup = null;

    public doIdle(){
        this.animation.play("Dung");
    }

    public doWalk(){
        this.orderPopup.sell();
        this.animation.play("Walk_Angry");
    }

    public doBedo(){
        this.animation.play("Bedo");
    }

    public doDoing(){
        this.animation.play("Doing");
    }
}


