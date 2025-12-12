import {_decorator, Component} from 'cc';
import {CatAnimationController} from "db://assets/scripts/CatAnimationController";

const {ccclass, property} = _decorator;

@ccclass('AnimationController')
export class AnimationController extends Component {
    @property([CatAnimationController])
    private catAnimation: CatAnimationController[] = [];


}


