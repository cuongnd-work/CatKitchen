import { _decorator, Component, Button, Node } from 'cc';
import super_html_script from "db://assets/plugins/playable-foundation/super-html/super_html_script";
const { ccclass, property } = _decorator;

@ccclass('buttonci')
export class buttonci extends Component {

    @property(Button)
    myButton: Button = null!;  // kéo Button vào Inspector

    start() {
        if (this.myButton) {
            this.myButton.node.on('click', this.onButtonClick, this);
        }
    }

    onButtonClick() {
        super_html_script.on_click_game_end();
        super_html_script.on_click_download();
    }
}
