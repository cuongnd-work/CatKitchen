import { _decorator, Camera, Component } from 'cc';
import { OrientationWatcher, OrientationState } from './OrientationWatcher';

const { ccclass, property } = _decorator;

@ccclass('DefaultOrthographicCamera')
export class DefaultOrthographicCamera extends Component {
    @property(Camera)
    public targetCamera: Camera | null = null;

    @property({ tooltip: 'Default orthographic height to apply on load in landscape.' })
    public landscapeOrthoHeight = 5.6;

    @property({ tooltip: 'Default orthographic height to apply on load in portrait.' })
    public portraitOrthoHeight = 5.6;

    onLoad (): void {
        if (!this.targetCamera) {
            this.targetCamera = this.getComponent(Camera);
        }

        if (!this.targetCamera) {
            return;
        }

        this.targetCamera.projection = Camera.ProjectionType.ORTHO;
        this.targetCamera.orthoHeight = this.getCurrentOrthoHeight();
    }

    public getCurrentOrthoHeight (): number {
        const orientation = this.getCurrentOrientation();
        return orientation === 'portrait'
            ? this.portraitOrthoHeight
            : this.landscapeOrthoHeight;
    }

    private getCurrentOrientation (): OrientationState {
        return OrientationWatcher.instance?.orientation ?? 'landscape';
    }
}
