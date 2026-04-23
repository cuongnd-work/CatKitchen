import { _decorator, Component, Widget, view, UITransform, screen, Node } from 'cc';

const { ccclass, executeInEditMode, menu, requireComponent } = _decorator;

@ccclass('UIScreenResolution')
@executeInEditMode(true)
@requireComponent(Widget)
@menu('UI/UIScreenResolution')
export class UIScreenResolution extends Component {
    private widget: Widget = null!;
    private uiTransform: UITransform = null!;
    private designAspectRatio = 0;

    onLoad() {
        this.assignField();
        this.assignWidget();
        this.getAspectRatio();
    }

    private getAspectRatio() {
        const designSize = view.getDesignResolutionSize();
        this.designAspectRatio = designSize.width / designSize.height;
        this.resizeToFullScreen();
    }

    private assignWidget() {
        Object.assign(this.widget, {
            isAlignLeft: true,
            isAlignRight: true,
            isAlignTop: true,
            isAlignBottom: true,
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
        });
    }

    private assignField() {
        this.widget = this.getComponent(Widget)!;
        this.uiTransform = this.getComponent(UITransform)!;
    }

    onEnable() {
        this.node.on(Node.EventType.SIZE_CHANGED, this.resizeToFullScreen, this);
    }

    onDisable() {
        this.node.off(Node.EventType.SIZE_CHANGED, this.resizeToFullScreen, this);
    }

    public resizeToFullScreen() {

        if (!this.widget || !this.uiTransform) return;
        const frameSize = screen.windowSize;
        const frameAspectRatio = frameSize.width / frameSize.height;
        const heightCamDefaut = 540;
        const heiCamSet = 1000;
        let ratioCam = heightCamDefaut / heiCamSet;
        // console.log(frameSize)

        this.widget.left = this.widget.right = this.widget.top = this.widget.bottom = null;

        if (frameAspectRatio > this.designAspectRatio) {
            this.uiTransform.height = view.getDesignResolutionSize().height;
            this.uiTransform.width = this.uiTransform.height * frameAspectRatio;
        } else {
            this.uiTransform.width = view.getDesignResolutionSize().width;
            this.uiTransform.height = this.uiTransform.width / frameAspectRatio;
        }

        this.widget.left = this.widget.right = this.widget.top = this.widget.bottom = 0;
    }
}