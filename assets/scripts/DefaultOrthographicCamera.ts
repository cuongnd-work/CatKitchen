import { _decorator, Camera, Component } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('DefaultOrthographicCamera')
export class DefaultOrthographicCamera extends Component {
    @property(Camera)
    public targetCamera: Camera | null = null;

    @property({ tooltip: 'Default orthographic height to apply on load.' })
    public orthoHeight = 5.6;

    onLoad (): void {
        if (!this.targetCamera) {
            this.targetCamera = this.getComponent(Camera);
        }

        if (!this.targetCamera) {
            return;
        }

        this.targetCamera.projection = Camera.ProjectionType.ORTHO;
        this.targetCamera.orthoHeight = this.orthoHeight;
    }
}
