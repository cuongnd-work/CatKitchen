import { _decorator, Component, Node, SkeletalAnimation } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('CatAnimationController')
export class CatAnimationController extends Component {
    @property(SkeletalAnimation)
    private animation: SkeletalAnimation = null!;

    public doIdle(){
        this.animation.play("Dung");
    }

    public doWalk(){
        this.animation.play("Warlk");
    }

    public doWalk_Angry(){
        this.animation.play("Warlk_Angry");
    }

    public doBedo(){
        this.animation.play("Bedo");
    }

    public doDoing(){
        this.animation.play("Doing");
    }
}


