import { _decorator, Component, Node, tween, Vec3 } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('zoom_button')
export class zoom_button extends Component {

    @property
    scaleUp: number = 1.15;   // scale lớn nhất

    @property
    duration: number = 0.4;   // thời gian scale

    @property
    delay: number = 200;

    start() {
        setTimeout(() => {
            this.startZoom();
        }, this.delay);
    }

    startZoom() {
        const originalScale = this.node.scale.clone();
        const targetScale = new Vec3(
            originalScale.x * this.scaleUp,
            originalScale.y * this.scaleUp,
            originalScale.z * this.scaleUp
        );

        tween(this.node)
            .repeatForever(
                tween()
                    .to(this.duration, { scale: targetScale })
                    .to(this.duration, { scale: originalScale })
            )
            .start();
    }
}
