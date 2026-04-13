import { _decorator, Component, Widget, view, UITransform, Node, screen, Size } from 'cc';
const { ccclass, property, executeInEditMode, menu, requireComponent } = _decorator;

@ccclass('UIScreenResolution')
@executeInEditMode(true)
@requireComponent(Widget)
@requireComponent(UITransform)
@menu('UI/UIScreenResolution')
export class UIScreenResolution extends Component {
    @property(Node) Doc: Node = null!;
    @property(Node) Ngang: Node = null!;

    private widget: Widget = null!;
    private uiTransform: UITransform = null!;

    onLoad() {
        this.assignField();
        // Chạy kiểm tra ngay lần đầu tiên
        this.resizeToFullScreen();
    }

    private assignField() {
        this.widget = this.getComponent(Widget)!;
        this.uiTransform = this.getComponent(UITransform)!;

        this.widget.isAlignLeft = true;
        this.widget.isAlignRight = true;
        this.widget.isAlignTop = true;
        this.widget.isAlignBottom = true;
        this.widget.left = 0;
        this.widget.right = 0;
        this.widget.top = 0;
        this.widget.bottom = 0;
    }

    onEnable() {
        view.on('canvas-resize', this.resizeToFullScreen, this);
        this.node.on(Node.EventType.SIZE_CHANGED, this.resizeToFullScreen, this);
    }

    onDisable() {
        view.off('canvas-resize', this.resizeToFullScreen, this);
        this.node.off(Node.EventType.SIZE_CHANGED, this.resizeToFullScreen, this);
    }

    public resizeToFullScreen() {
        let w = view.getFrameSize().width;
        let h = view.getFrameSize().height;


        if (w > h) {
            if (this.Ngang) this.Ngang.active = true;
            if (this.Doc) this.Doc.active = false;
        } else {
            if (this.Doc) this.Doc.active = true;
            if (this.Ngang) this.Ngang.active = false;
        }

        // Cập nhật lại Widget để UI không bị lệch
        if (this.widget) this.widget.updateAlignment();
    }
}