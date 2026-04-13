import {
    _decorator,
    Color,
    Component,
    Graphics,
    Label,
    Node,
    Tween,
    UITransform,
    Vec3,
    tween,
} from 'cc';
import super_html_script from 'db://assets/plugins/playable-foundation/super-html/super_html_script';
import { UIScreenResolution } from './UIScreenResolution';

const { ccclass } = _decorator;

type ScenePhase = 'scene1' | 'scene2' | 'ending';

type LaneData = {
    index: number;
    root: Node;
    barrier: Node;
    titleLabel: Label;
    queueSlots: Vec3[];
    queueCars: Node[];
    open: boolean;
};

@ccclass('FoodTruckPlayableController')
export class FoodTruckPlayableController extends Component {
    private static _activeInstance: FoodTruckPlayableController | null = null;
    private readonly laneCount = 4;
    private readonly initialCarsPerLane = 8;
    private readonly queueSpacing = 78;
    private readonly baseDispatchCooldown = 2;
    private readonly cooldownReductionPerOpenedLane = 0.5;
    private readonly minimumDispatchCooldown = 0.5;
    private readonly scene1Reward = 28;
    private readonly scene2Reward = 44;
    private readonly scene2StartMoney = 220;
    private readonly endingMoneyTarget = 720;

    private _phase: ScenePhase = 'scene1';
    private _money = 0;
    private _carsServed = 0;
    private _openedLanes = 0;
    private _elapsed = 0;
    private _nextDispatchTime = 0;
    private _dispatchInProgress = false;
    private _lastLaneIndex = -1;
    private _playClicked = false;

    private _root: Node | null = null;
    private _worldRoot: Node | null = null;
    private _overlayRoot: Node | null = null;

    private _phaseLabel: Label | null = null;
    private _moneyLabel: Label | null = null;
    private _dispatchLabel: Label | null = null;
    private _openLaneLabel: Label | null = null;

    private _catNode: Node | null = null;
    private _catScale = new Vec3(1, 1, 1);

    private _playButton: Node | null = null;
    private _removeBarrierButton: Node | null = null;
    private _dispatchButton: Node | null = null;
    private _openLaneButton: Node | null = null;

    private _upgradePanel: Node | null = null;
    private _storePopup: Node | null = null;
    private _storeTitleLabel: Label | null = null;

    private _removeBarrierPulse: Tween<Node> | null = null;
    private _lanes: LaneData[] = [];

    protected onLoad (): void {
        if (FoodTruckPlayableController._activeInstance && FoodTruckPlayableController._activeInstance !== this) {
            this.enabled = false;
            return;
        }
        FoodTruckPlayableController._activeInstance = this;
        this.prepareLegacySceneNodes();
        this.createLayout();
        this.createFoodTruck();
        this.createLanes();
        this.createHud();
        this.createEndingUi();
        this.refreshUiState();
    }

    protected onDestroy (): void {
        if (FoodTruckPlayableController._activeInstance === this) {
            FoodTruckPlayableController._activeInstance = null;
        }
        if (this._removeBarrierPulse) {
            this._removeBarrierPulse.stop();
            this._removeBarrierPulse = null;
        }
        if (this._catNode) {
            Tween.stopAllByTarget(this._catNode);
        }
    }

    update (deltaTime: number): void {
        this._elapsed += Math.max(0, deltaTime);
        this.refreshDispatchButtonLabel();
        if (this._phase === 'scene2' && !this._dispatchInProgress && this._elapsed >= this._nextDispatchTime) {
            this.tryDispatchCar();
        }
    }

    private prepareLegacySceneNodes (): void {
        const canvasNode = this.resolveCanvasNode();
        const screenResolution = this.node.getComponent(UIScreenResolution);
        if (screenResolution) {
            screenResolution.enabled = false;
            if (screenResolution.Doc) {
                screenResolution.Doc.active = false;
            }
            if (screenResolution.Ngang) {
                screenResolution.Ngang.active = false;
            }
        }

        if (!canvasNode) {
            return;
        }

        const level = canvasNode.getChildByName('Level');
        if (level) {
            level.active = false;
        }
    }

    private createLayout (): void {
        this._root = new Node('FoodTruckPlayableRoot');
        this.node.addChild(this._root);
        const rootTransform = this._root.addComponent(UITransform);
        rootTransform.setContentSize(720, 1280);
        this._root.setPosition(0, 0, 0);

        const bgBack = this.createRectNode(this._root, 'BackgroundBack', new Color(245, 199, 116, 255), 720, 1280);
        bgBack.setPosition(0, 0, 0);
        const bgTop = this.createRectNode(this._root, 'BackgroundTop', new Color(250, 225, 164, 255), 720, 550);
        bgTop.setPosition(0, 365, 0);

        this._worldRoot = new Node('WorldRoot');
        this._root.addChild(this._worldRoot);
        const worldTransform = this._worldRoot.addComponent(UITransform);
        worldTransform.setContentSize(720, 1280);
        this._worldRoot.setPosition(0, 0, 0);

        const roadArea = this.createRectNode(this._worldRoot, 'RoadArea', new Color(62, 62, 62, 255), 620, 940);
        roadArea.setPosition(0, -65, 0);

        this._overlayRoot = new Node('OverlayRoot');
        this._root.addChild(this._overlayRoot);
        const overlayTransform = this._overlayRoot.addComponent(UITransform);
        overlayTransform.setContentSize(720, 1280);
        this._overlayRoot.setPosition(0, 0, 0);
    }

    private createFoodTruck (): void {
        if (!this._worldRoot) {
            return;
        }

        const truckBody = this.createRectNode(this._worldRoot, 'FoodTruckBody', new Color(255, 145, 74, 255), 400, 180, 18);
        truckBody.setPosition(0, 445, 0);

        const truckBanner = this.createRectNode(this._worldRoot, 'FoodTruckBanner', new Color(255, 241, 180, 255), 340, 52, 12);
        truckBanner.setPosition(0, 500, 0);
        this.createLabel(truckBanner, 'Street Food Cat', 34, new Color(75, 47, 28, 255), new Vec3(0, 0, 0));

        const truckText = this.createLabel(truckBody, 'Quay do an / Xe do an', 30, new Color(90, 36, 22, 255), new Vec3(0, 10, 0));
        truckText.overflow = Label.Overflow.CLAMP;

        this._catNode = this.createRectNode(truckBody, 'ChefCat', new Color(255, 236, 205, 255), 130, 92, 20);
        this._catNode.setPosition(0, -42, 0);
        this._catScale.set(1, 1, 1);
        this._catNode.setScale(this._catScale);
        this.createLabel(this._catNode, 'Meo Chef dang nau an', 21, new Color(96, 40, 28, 255), new Vec3(0, 0, 0));
    }

    private createLanes (): void {
        if (!this._worldRoot) {
            return;
        }

        const laneX = [-240, -80, 80, 240];
        const queueTopY = 185;
        const laneBottom = -450;

        for (let i = 0; i < this.laneCount; i++) {
            const laneRoot = new Node(`Lane_${i + 1}`);
            this._worldRoot.addChild(laneRoot);
            laneRoot.addComponent(UITransform).setContentSize(130, 980);
            laneRoot.setPosition(laneX[i], -50, 0);

            const lanePaint = this.createRectNode(laneRoot, `LanePaint_${i + 1}`, new Color(78, 78, 78, 255), 112, 900, 10);
            lanePaint.setPosition(0, 0, 0);

            const laneTitle = this.createLabel(laneRoot, `Lan ${i + 1} - Dang chan`, 20, new Color(250, 235, 206, 255), new Vec3(0, 350, 0));

            const barrier = this.createRectNode(laneRoot, `Barrier_${i + 1}`, new Color(204, 64, 64, 255), 120, 22, 8);
            barrier.setPosition(0, 250, 0);
            this.createLabel(barrier, 'Chan', 18, new Color(255, 240, 236, 255), new Vec3(0, 0, 0));

            const queueSlots: Vec3[] = [];
            for (let slot = 0; slot < this.initialCarsPerLane; slot++) {
                queueSlots.push(new Vec3(0, queueTopY - slot * this.queueSpacing, 0));
            }

            const lane: LaneData = {
                index: i,
                root: laneRoot,
                barrier,
                titleLabel: laneTitle,
                queueSlots,
                queueCars: [],
                open: false,
            };
            this._lanes.push(lane);
            this.fillLaneQueue(lane, true);

            const laneCap = this.createRectNode(laneRoot, `LaneCap_${i + 1}`, new Color(94, 94, 94, 255), 130, 45, 8);
            laneCap.setPosition(0, laneBottom, 0);
        }
    }

    private createHud (): void {
        if (!this._overlayRoot) {
            return;
        }

        this._phaseLabel = this.createLabel(
            this._overlayRoot,
            'Scene 1 - Xe xep hang mua do an',
            28,
            new Color(82, 44, 18, 255),
            new Vec3(0, 588, 0),
        );

        const moneyHolder = this.createRectNode(this._overlayRoot, 'MoneyHolder', new Color(255, 255, 255, 230), 230, 64, 12);
        moneyHolder.setPosition(232, 560, 0);
        this._moneyLabel = this.createLabel(moneyHolder, 'Tien: 0', 28, new Color(41, 134, 54, 255), new Vec3(0, 0, 0));

        this._playButton = this.createButton(
            this._overlayRoot,
            'PlayGameButton',
            'Play Game',
            new Vec3(-232, 560, 0),
            new Vec3(220, 64, 0),
            new Color(53, 159, 226, 255),
            () => this.onPlayGameClicked(),
        );

        this._removeBarrierButton = this.createButton(
            this._overlayRoot,
            'RemoveBarrierButton',
            'Bo thanh chan (0$)',
            new Vec3(0, -505, 0),
            new Vec3(300, 72, 0),
            new Color(52, 173, 96, 255),
            () => this.onRemoveBarrierClicked(),
        );

        this._dispatchButton = this.createButton(
            this._overlayRoot,
            'DispatchButton',
            'Cho xe vao',
            new Vec3(0, -505, 0),
            new Vec3(300, 72, 0),
            new Color(61, 123, 236, 255),
            () => this.onDispatchClicked(),
        );
        this._dispatchLabel = this._dispatchButton.getComponentInChildren(Label);

        this._openLaneButton = this.createButton(
            this._overlayRoot,
            'OpenLaneButton',
            'Tao duong cho xe di vao',
            new Vec3(0, -585, 0),
            new Vec3(370, 66, 0),
            new Color(241, 144, 57, 255),
            () => this.onOpenLaneClicked(),
        );
        this._openLaneLabel = this._openLaneButton.getComponentInChildren(Label);
    }

    private createEndingUi (): void {
        if (!this._overlayRoot) {
            return;
        }

        this._upgradePanel = this.createRectNode(this._overlayRoot, 'UpgradePanel', new Color(24, 24, 24, 198), 720, 1280);
        this._upgradePanel.setPosition(0, 0, 0);
        this._upgradePanel.active = false;

        const card = this.createRectNode(this._upgradePanel, 'UpgradeCard', new Color(252, 236, 209, 255), 560, 520, 16);
        card.setPosition(0, 80, 0);

        this.createLabel(card, 'Du tien upgrade nha moi!', 42, new Color(79, 48, 28, 255), new Vec3(0, 185, 0));
        this.createLabel(card, 'Chon nha hang ban muon mo:', 28, new Color(106, 64, 36, 255), new Vec3(0, 125, 0));

        this.createEndingOption(card, 'Ramen', new Vec3(0, 25, 0));
        this.createEndingOption(card, 'Hot Dog', new Vec3(0, -65, 0));
        this.createEndingOption(card, 'Hamburger', new Vec3(0, -155, 0));

        this._storePopup = this.createRectNode(this._upgradePanel, 'StorePopup', new Color(255, 255, 255, 255), 490, 240, 14);
        this._storePopup.setPosition(0, -260, 0);
        this._storePopup.active = false;

        this._storeTitleLabel = this.createLabel(
            this._storePopup,
            'Mo Store',
            30,
            new Color(73, 41, 20, 255),
            new Vec3(0, 65, 0),
        );

        this.createButton(
            this._storePopup,
            'StoreGoButton',
            'Vao Store',
            new Vec3(0, -10, 0),
            new Vec3(220, 62, 0),
            new Color(52, 173, 96, 255),
            () => this.onStoreConfirmClicked(),
        );

        this.createButton(
            this._storePopup,
            'StoreCloseButton',
            'Dong',
            new Vec3(0, -84, 0),
            new Vec3(140, 48, 0),
            new Color(144, 144, 144, 255),
            () => {
                if (this._storePopup) {
                    this._storePopup.active = false;
                }
            },
        );
    }

    private createEndingOption (parent: Node, title: string, position: Vec3): void {
        this.createButton(
            parent,
            `${title}Option`,
            title,
            position,
            new Vec3(300, 68, 0),
            new Color(245, 160, 73, 255),
            () => this.onEndingOptionClicked(title),
        );
    }

    private onPlayGameClicked (): void {
        if (!this._playClicked) {
            this._playClicked = true;
            super_html_script.on_first_click();
        }
    }

    private onRemoveBarrierClicked (): void {
        if (this._phase !== 'scene1' || this._openedLanes > 0) {
            return;
        }

        this.openNextLane();
        this.stopRemoveBarrierPulse();
        this.refreshUiState();
    }

    private onDispatchClicked (): void {
        this.tryDispatchCar();
    }

    private onOpenLaneClicked (): void {
        if (this._phase !== 'scene1') {
            return;
        }
        this.openNextLane();
        this.refreshUiState();
    }

    private onEndingOptionClicked (selection: string): void {
        if (!this._storePopup) {
            return;
        }
        this._storePopup.active = true;
        if (this._storeTitleLabel) {
            this._storeTitleLabel.string = `${selection} da san sang. Mo Store ngay!`;
        }
    }

    private onStoreConfirmClicked (): void {
        super_html_script.on_click_game_end();
        super_html_script.on_click_download();
    }

    private tryDispatchCar (): boolean {
        if (this._phase === 'ending') {
            return false;
        }
        if (this._dispatchInProgress || this._elapsed < this._nextDispatchTime) {
            return false;
        }

        const lane = this.pickLaneForDispatch();
        if (!lane || lane.queueCars.length === 0) {
            return false;
        }

        const car = lane.queueCars.shift();
        if (!car) {
            return false;
        }
        this.moveCarToWorldRoot(car);

        this._dispatchInProgress = true;
        this._nextDispatchTime = this._elapsed + this.getDispatchCooldown();
        this.shiftLaneQueue(lane);
        this.animateCarFlow(lane, car);
        this.refreshDispatchButtonLabel();
        return true;
    }

    private pickLaneForDispatch (): LaneData | null {
        const openLanes = this._lanes.filter((lane) => lane.open && lane.queueCars.length > 0);
        if (openLanes.length === 0) {
            return null;
        }

        for (let step = 1; step <= this.laneCount; step++) {
            const candidateIndex = (this._lastLaneIndex + step + this.laneCount) % this.laneCount;
            const lane = this._lanes[candidateIndex];
            if (lane && lane.open && lane.queueCars.length > 0) {
                this._lastLaneIndex = candidateIndex;
                return lane;
            }
        }

        return openLanes[0];
    }

    private animateCarFlow (lane: LaneData, car: Node): void {
        const laneX = lane.root.position.x;
        const entry = new Vec3(laneX, 230, 0);
        const shopPoint = new Vec3(0, 350, 0);
        const exitPoint = new Vec3(358, 430, 0);

        tween(car)
            .to(0.35, { position: entry }, { easing: 'sineOut' })
            .to(0.4, { position: shopPoint }, { easing: 'sineInOut' })
            .call(() => {
                this.playCatCookingAnim();
            })
            .delay(0.55)
            .to(0.5, { position: exitPoint }, { easing: 'sineIn' })
            .call(() => {
                if (car.isValid) {
                    car.destroy();
                }
                this.onCarServed();
            })
            .start();
    }

    private onCarServed (): void {
        this._dispatchInProgress = false;
        this._carsServed++;
        this.addMoney(this._phase === 'scene1' ? this.scene1Reward : this.scene2Reward);

        if (this._phase === 'scene1') {
            if (this._money >= this.scene2StartMoney && this._openedLanes >= 2) {
                this.enterScene2();
            }
            return;
        }

        if (this._phase === 'scene2') {
            this.fillOpenLaneQueues();
            if (this._money >= this.endingMoneyTarget) {
                this.enterEnding();
            }
        }
    }

    private enterScene2 (): void {
        if (this._phase !== 'scene1') {
            return;
        }

        while (this._openedLanes < this.laneCount) {
            this.openNextLane();
        }

        this._phase = 'scene2';
        if (this._phaseLabel) {
            this._phaseLabel.string = 'Scene 2 - Follow playable goc, toc do cao hon';
        }
        this.fillOpenLaneQueues();
        this.refreshUiState();
    }

    private enterEnding (): void {
        if (this._phase === 'ending') {
            return;
        }
        this._phase = 'ending';
        if (this._phaseLabel) {
            this._phaseLabel.string = 'Ending - Chon nha hang moi';
        }
        if (this._upgradePanel) {
            this._upgradePanel.active = true;
        }
        if (this._storePopup) {
            this._storePopup.active = false;
        }
        this.refreshUiState();
    }

    private openNextLane (): void {
        const nextLane = this._lanes.find((lane) => !lane.open);
        if (!nextLane) {
            return;
        }

        nextLane.open = true;
        nextLane.barrier.active = false;
        nextLane.titleLabel.string = `Lan ${nextLane.index + 1} - Da mo`;
        this._openedLanes++;
        this.shiftLaneQueue(nextLane);
    }

    private getDispatchCooldown (): number {
        const reduction = Math.max(0, this._openedLanes - 1) * this.cooldownReductionPerOpenedLane;
        return Math.max(this.minimumDispatchCooldown, this.baseDispatchCooldown - reduction);
    }

    private refreshUiState (): void {
        const waitingForBarrier = this._phase === 'scene1' && this._openedLanes === 0;
        if (this._removeBarrierButton) {
            this._removeBarrierButton.active = waitingForBarrier;
        }
        if (waitingForBarrier) {
            this.startRemoveBarrierPulse();
        } else {
            this.stopRemoveBarrierPulse();
        }

        if (this._dispatchButton) {
            this._dispatchButton.active = this._phase !== 'ending' && this._openedLanes > 0;
        }

        if (this._openLaneButton) {
            this._openLaneButton.active = this._phase === 'scene1' && this._openedLanes > 0 && this._openedLanes < this.laneCount;
        }

        if (this._openLaneLabel) {
            if (this._phase === 'scene2') {
                this._openLaneLabel.string = 'Da mo du 4 lan';
            } else {
                this._openLaneLabel.string = `Tao duong cho xe di vao (${this._openedLanes}/${this.laneCount})`;
            }
        }

        this.refreshMoneyLabel();
        this.refreshDispatchButtonLabel();
    }

    private refreshDispatchButtonLabel (): void {
        if (!this._dispatchLabel || !this._dispatchButton || !this._dispatchButton.active) {
            return;
        }

        if (this._dispatchInProgress) {
            this._dispatchLabel.string = 'Xe dang di vao...';
            return;
        }

        const remain = Math.max(0, this._nextDispatchTime - this._elapsed);
        if (remain > 0.01) {
            this._dispatchLabel.string = `Cho xe vao (${remain.toFixed(1)}s)`;
            return;
        }

        this._dispatchLabel.string = `Cho xe vao (${this.getDispatchCooldown().toFixed(1)}s)`;
    }

    private refreshMoneyLabel (): void {
        if (this._moneyLabel) {
            this._moneyLabel.string = `Tien: ${this._money}`;
        }
    }

    private addMoney (amount: number): void {
        this._money += Math.max(0, Math.floor(amount));
        this.refreshMoneyLabel();
    }

    private fillLaneQueue (lane: LaneData, instant = false): void {
        while (lane.queueCars.length < this.initialCarsPerLane) {
            const car = this.createCarNode(lane.index, lane.queueCars.length);
            lane.root.addChild(car);
            const slot = lane.queueSlots[lane.queueCars.length];
            car.setPosition(slot.x, slot.y, 0);
            if (!instant) {
                car.setScale(0.8, 0.8, 1);
                tween(car).to(0.2, { scale: new Vec3(1, 1, 1) }).start();
            }
            lane.queueCars.push(car);
        }
        this.shiftLaneQueue(lane, instant);
    }

    private fillOpenLaneQueues (): void {
        this._lanes.forEach((lane) => {
            if (lane.open) {
                this.fillLaneQueue(lane);
            }
        });
    }

    private shiftLaneQueue (lane: LaneData, instant = false): void {
        for (let i = 0; i < lane.queueCars.length; i++) {
            const car = lane.queueCars[i];
            const target = lane.queueSlots[i];
            if (!target || !car || !car.isValid) {
                continue;
            }

            if (instant) {
                car.setPosition(target.x, target.y, 0);
            } else {
                tween(car)
                    .to(0.22, { position: target }, { easing: 'sineOut' })
                    .start();
            }
        }
    }

    private playCatCookingAnim (): void {
        if (!this._catNode || !this._catNode.isValid) {
            return;
        }

        Tween.stopAllByTarget(this._catNode);
        this._catNode.setScale(this._catScale);

        const bigger = new Vec3(this._catScale.x * 1.15, this._catScale.y * 1.15, this._catScale.z);
        tween(this._catNode)
            .to(0.12, { scale: bigger }, { easing: 'sineOut' })
            .to(0.12, { scale: this._catScale }, { easing: 'sineIn' })
            .start();
    }

    private createCarNode (laneIndex: number, queueIndex: number): Node {
        const palette = [
            new Color(99, 165, 255, 255),
            new Color(116, 199, 129, 255),
            new Color(243, 172, 79, 255),
            new Color(224, 120, 120, 255),
        ];

        const car = this.createRectNode(null, `Car_${laneIndex}_${queueIndex}`, palette[laneIndex % palette.length], 95, 46, 10);
        this.createLabel(car, 'Xe', 18, new Color(255, 255, 255, 255), new Vec3(0, 0, 0));
        return car;
    }

    private createButton (
        parent: Node,
        name: string,
        text: string,
        position: Vec3,
        size: Vec3,
        color: Color,
        onClick: () => void,
    ): Node {
        const buttonNode = this.createRectNode(parent, name, color, size.x, size.y, 14);
        buttonNode.setPosition(position.x, position.y, position.z);
        this.createLabel(buttonNode, text, 24, new Color(255, 255, 255, 255), new Vec3(0, 0, 0));
        buttonNode.on(Node.EventType.TOUCH_END, onClick, this);
        return buttonNode;
    }

    private createRectNode (
        parent: Node | null,
        name: string,
        color: Color,
        width: number,
        height: number,
        radius = 0,
    ): Node {
        const node = new Node(name);
        if (parent) {
            parent.addChild(node);
        }

        node.addComponent(UITransform).setContentSize(width, height);
        const graphics = node.addComponent(Graphics);
        graphics.clear();
        graphics.fillColor = color;
        if (radius > 0) {
            graphics.roundRect(-width * 0.5, -height * 0.5, width, height, radius);
        } else {
            graphics.rect(-width * 0.5, -height * 0.5, width, height);
        }
        graphics.fill();
        return node;
    }

    private createLabel (
        parent: Node,
        text: string,
        fontSize: number,
        color: Color,
        position: Vec3,
    ): Label {
        const labelNode = new Node(`${parent.name}_Label`);
        parent.addChild(labelNode);
        labelNode.addComponent(UITransform).setContentSize(600, 70);
        labelNode.setPosition(position.x, position.y, position.z);
        const label = labelNode.addComponent(Label);
        label.string = text;
        label.fontSize = fontSize;
        label.lineHeight = Math.round(fontSize * 1.2);
        label.color = color;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        return label;
    }

    private startRemoveBarrierPulse (): void {
        if (!this._removeBarrierButton || this._removeBarrierPulse) {
            return;
        }
        this._removeBarrierButton.setScale(1, 1, 1);
        this._removeBarrierPulse = tween(this._removeBarrierButton)
            .repeatForever(
                tween()
                    .to(0.35, { scale: new Vec3(1.08, 1.08, 1) })
                    .to(0.35, { scale: new Vec3(1, 1, 1) }),
            )
            .start();
    }

    private stopRemoveBarrierPulse (): void {
        if (!this._removeBarrierButton) {
            return;
        }
        if (this._removeBarrierPulse) {
            this._removeBarrierPulse.stop();
            this._removeBarrierPulse = null;
        }
        this._removeBarrierButton.setScale(1, 1, 1);
    }

    private moveCarToWorldRoot (car: Node): void {
        if (!this._worldRoot || !car || !car.isValid) {
            return;
        }

        const worldPos = car.getWorldPosition(new Vec3());
        this._worldRoot.addChild(car);
        car.setWorldPosition(worldPos);
    }

    private resolveCanvasNode (): Node | null {
        if (this.node.getChildByName('Level')) {
            return this.node;
        }

        const parent = this.node.parent;
        if (parent && parent.getChildByName('Level')) {
            return parent;
        }

        return null;
    }
}
