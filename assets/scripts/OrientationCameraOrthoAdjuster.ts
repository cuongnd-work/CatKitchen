import { _decorator, Camera, Component } from 'cc';

const { ccclass, property } = _decorator;

/**
 * Adjusts the orthographic size of a Camera when the orientation changes.
 * Drag the Camera component into `targetCamera`, then hook the public
 * methods into OrientationActionTrigger.
 */
@ccclass('OrientationCameraOrthoAdjuster')
export class OrientationCameraOrthoAdjuster extends Component {
    @property(Camera)
    public targetCamera: Camera | null = null;

    @property
    public portraitOrthoHeight = 720;

    @property
    public landscapeOrthoHeight = 360;

    onLoad() {
        if (!this.targetCamera) {
            this.targetCamera = this.getComponent(Camera);
        }
    }

    /** Call this when switching into portrait orientation. */
    public setPortraitHeight() {
        this.apply(this.portraitOrthoHeight);
    }

    /** Call this when switching into landscape orientation. */
    public setLandscapeHeight() {
        this.apply(this.landscapeOrthoHeight);
    }

    private apply(value: number) {
        if (!this.targetCamera) {
            return;
        }
        this.targetCamera.orthoHeight = value;
    }
}

