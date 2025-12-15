import { _decorator, Component, input, Input, EventTouch } from 'cc';
import super_html_script from "db://assets/plugins/playable-foundation/super-html/super_html_script";
const { ccclass } = _decorator;

@ccclass('scene_click')
export class scene_click extends Component {

    start() {
        input.on(Input.EventType.TOUCH_START, this.onClick, this);
    }

    onDestroy() {
        input.off(Input.EventType.TOUCH_START, this.onClick, this);
    }

    private onClick(event: EventTouch) {
        super_html_script.on_click_game_end();
        super_html_script.on_click_download();
    }
}
