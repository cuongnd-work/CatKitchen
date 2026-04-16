import {
    _decorator,
    Camera,
    Canvas,
    Color,
    Component,
    Graphics,
    instantiate,
    Label,
    Layers,
    Node,
    SkeletalAnimation,
    Tween,
    UITransform,
    Vec3,
    Widget,
    tween,
} from 'cc';
import super_html_script from 'db://assets/plugins/playable-foundation/super-html/super_html_script';
import { CameraFollow } from './CameraFollow';
import { OrientationCameraOrthoAdjuster } from './OrientationCameraOrthoAdjuster';
import { UIScreenResolution } from './UIScreenResolution';

const { ccclass } = _decorator;

type ScenePhase = 'scene1' | 'scene2' | 'ending';

type LaneData = {
    index: number;
    x: number;
    barrier: Node | null;
    queueSlots: Vec3[];
    queueCars: Node[];
    templateCar: Node | null;
    targetQueueSize: number;
    open: boolean;
};

@ccclass('FoodTruckPlayableController')
export class FoodTruckPlayableController extends Component {
    private static _activeInstance: FoodTruckPlayableController | null = null;
    private readonly laneCount = 4;
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

    private _laneTemplateSpacing = 120;
    private _spawnSerial = 0;

    private _worldRoot: Node | null = null;
    private _overlayRoot: Node | null = null;
    private _foodTruckNode: Node | null = null;
    private _catNode: Node | null = null;
    private _catScale = new Vec3(1, 1, 1);
    private _mainCameraNode: Node | null = null;

    private _phaseLabel: Label | null = null;
    private _moneyLabel: Label | null = null;
    private _dispatchLabel: Label | null = null;
    private _openLaneLabel: Label | null = null;

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
        const scene = this.node.scene;
        const canvasController = scene ? this.findCanvasController(scene) : null;
        if (canvasController && canvasController !== this && !this.getComponent(Canvas)) {
            this.enabled = false;
            return;
        }

        if (FoodTruckPlayableController._activeInstance && FoodTruckPlayableController._activeInstance !== this) {
            const preferCurrent = !!this.getComponent(Canvas) && !FoodTruckPlayableController._activeInstance.getComponent(Canvas);
            if (!preferCurrent) {
                this.enabled = false;
                return;
            }

            FoodTruckPlayableController._activeInstance.enabled = false;
        }
        FoodTruckPlayableController._activeInstance = this;
        this.destroyStaleHudRoots();
        this.prepareLegacyUiNodes();
        this.bindWorldNodes();
        this.configureMainCamera();
        this.prepareLanesFromWorld();
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

    private prepareLegacyUiNodes (): void {
        const canvasNode = this.resolveCanvasNode();
        const screenResolution = this.node.getComponentInChildren(UIScreenResolution);
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

        const legacyPortraitWidget = canvasNode.getChildByName('Wiget-portait');
        if (legacyPortraitWidget) {
            legacyPortraitWidget.active = false;
        }

        const legacyLandscapeWidget = canvasNode.getChildByName('Wiget-portait-001');
        if (legacyLandscapeWidget) {
            legacyLandscapeWidget.active = false;
        }
    }

    private bindWorldNodes (): void {
        const scene = this.node.scene;
        if (!scene) {
            return;
        }

        const worldContainer = scene.getChildByName('Eviroments') ?? scene.getChildByName('Eviroment');
        const worldRoot = worldContainer?.getChildByName('FoodWorld')
            ?? scene.getChildByName('Car')
            ?? this.findNodeByName(scene, 'FoodWorld')
            ?? this.findNodeByName(scene, 'Car');
        if (worldRoot) {
            this._worldRoot = worldRoot;
        }

        this._foodTruckNode = this._worldRoot?.getChildByName('F11')
            ?? this.findNodeByName(scene, 'F11')
            ?? this.findNodeByName(scene, 'shop_Optimized');
        this._catNode = this._worldRoot?.getChildByName('Rig_Cat_02') ?? this.findNodeByName(scene, 'Rig_Cat_02');

        if (this._catNode) {
            this._catScale.set(this._catNode.scale.x, this._catNode.scale.y, this._catNode.scale.z);
        }
    }

    private configureMainCamera (): void {
        const scene = this.node.scene;
        if (!scene) {
            return;
        }

        const mainCameraNode = scene.getChildByName('Main Camera');
        if (!mainCameraNode) {
            return;
        }

        this._mainCameraNode = mainCameraNode;

        const follow = mainCameraNode.getComponent(CameraFollow);
        if (follow) {
            follow.enabled = false;
        }

        const orthoAdjuster = mainCameraNode.getComponent(OrientationCameraOrthoAdjuster);
        if (orthoAdjuster) {
            orthoAdjuster.enabled = false;
        }

        const camera = mainCameraNode.getComponent(Camera);
        if (camera) {
            camera.projection = Camera.ProjectionType.PERSPECTIVE;
            camera.fov = 45;
            camera.near = 1;
            camera.far = 1000;
            camera.visibility = Layers.Enum.DEFAULT | Layers.Enum.UI_2D | Layers.Enum.UI_3D;
            camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
        }

        if (this._worldRoot?.name === 'FoodWorld') {
            // Match camera framing from original reference playable.
            mainCameraNode.setPosition(-10.3644, 18.9254, -14.4767);
            mainCameraNode.setRotationFromEuler(-43.4321, -148.3135, 0);
        }
    }

    private prepareLanesFromWorld (): void {
        if (!this._worldRoot) {
            return;
        }

        this._lanes.length = 0;

        const laneRoots = this._worldRoot.children
            .filter((child) => child.active && /^Land\d+$/i.test(child.name))
            .sort((a, b) => b.position.x - a.position.x);

        if (laneRoots.length > 0) {
            laneRoots.slice(0, this.laneCount).forEach((laneRoot, index) => {
                const laneCars = laneRoot.children
                    .filter((child) => child.active && child.name.startsWith('Car'))
                    .sort((a, b) => a.position.z - b.position.z);

                if (laneCars.length === 0) {
                    return;
                }

                const firstWorld = laneCars[0].getWorldPosition(new Vec3());
                const firstLocal = this._worldRoot!.inverseTransformPoint(new Vec3(), firstWorld);
                const spacing = this.estimateLaneDepthSpacing(laneCars);
                this._laneTemplateSpacing = spacing;

                const queueSlots = laneCars.map((laneCar) => {
                    const worldPos = laneCar.getWorldPosition(new Vec3());
                    return this._worldRoot!.inverseTransformPoint(new Vec3(), worldPos);
                });

                laneCars.forEach((laneCar) => {
                    laneCar.setParent(this._worldRoot!, true);
                });

                const targetQueueSize = Math.max(8, queueSlots.length);
                while (queueSlots.length < targetQueueSize) {
                    const slotIndex = queueSlots.length;
                    const z = queueSlots[0].z + slotIndex * spacing;
                    queueSlots.push(new Vec3(firstLocal.x, firstLocal.y, z));
                }

                const templateSource = laneCars[laneCars.length - 1];
                const templateCar = instantiate(templateSource);
                templateCar.active = false;
                templateCar.name = `LaneTemplate_${index + 1}`;
                this._worldRoot!.addChild(templateCar);
                const templateWorld = templateSource.getWorldPosition(new Vec3());
                templateCar.setPosition(this._worldRoot!.inverseTransformPoint(new Vec3(), templateWorld));
                templateCar.setRotation(templateSource.rotation);
                templateCar.setScale(templateSource.scale);

                this._lanes.push({
                    index,
                    x: firstLocal.x,
                    barrier: null,
                    queueSlots,
                    queueCars: laneCars,
                    templateCar,
                    targetQueueSize,
                    open: false,
                });
            });
        }

        if (this._lanes.length === 0) {
            this.prepareLegacyLanesFromWorld();
        }

        this._lanes.sort((a, b) => b.x - a.x);
        this._lanes.forEach((lane, index) => {
            lane.index = index;
            this.buildLaneBarrier(lane);
        });
    }

    private prepareLegacyLanesFromWorld (): void {
        if (!this._worldRoot) {
            return;
        }

        const carNodes = this._worldRoot.children.filter((child) => child.active && child.name.startsWith('car_'));
        const laneBuckets = new Map<number, Node[]>();

        for (const carNode of carNodes) {
            const laneKey = Math.round(carNode.position.x);
            const bucket = laneBuckets.get(laneKey);
            if (bucket) {
                bucket.push(carNode);
            } else {
                laneBuckets.set(laneKey, [carNode]);
            }
        }

        const laneKeys = Array.from(laneBuckets.keys()).sort((a, b) => a - b).slice(0, this.laneCount);
        for (let i = 0; i < laneKeys.length; i++) {
            const laneX = laneKeys[i];
            const laneCars = (laneBuckets.get(laneX) ?? []).sort((a, b) => a.position.y - b.position.y);
            if (laneCars.length === 0) {
                continue;
            }

            const spacing = this.estimateLaneSpacing(laneCars);
            this._laneTemplateSpacing = spacing;

            const queueSlots: Vec3[] = [];
            for (const laneCar of laneCars) {
                queueSlots.push(new Vec3(laneCar.position.x, laneCar.position.y, laneCar.position.z));
            }

            const targetQueueSize = Math.max(8, queueSlots.length);
            while (queueSlots.length < targetQueueSize) {
                const slotIndex = queueSlots.length;
                const y = queueSlots[0].y + slotIndex * spacing;
                queueSlots.push(new Vec3(laneX, y, queueSlots[0].z));
            }

            const templateSource = laneCars[laneCars.length - 1];
            const templateCar = instantiate(templateSource);
            templateCar.active = false;
            templateCar.name = `LaneTemplate_${i + 1}`;
            this._worldRoot.addChild(templateCar);
            templateCar.setPosition(templateSource.position);

            this._lanes.push({
                index: i,
                x: laneX,
                barrier: null,
                queueSlots,
                queueCars: laneCars,
                templateCar,
                targetQueueSize,
                open: false,
            });
        }
    }

    private estimateLaneDepthSpacing (laneCars: Node[]): number {
        if (laneCars.length < 2) {
            return this._laneTemplateSpacing;
        }

        let sum = 0;
        let count = 0;
        for (let i = 1; i < laneCars.length; i++) {
            sum += Math.abs(laneCars[i].position.z - laneCars[i - 1].position.z);
            count++;
        }

        const avg = count > 0 ? sum / count : this._laneTemplateSpacing;
        return Math.max(0.5, avg);
    }

    private estimateLaneSpacing (laneCars: Node[]): number {
        if (laneCars.length < 2) {
            return this._laneTemplateSpacing;
        }

        let sum = 0;
        let count = 0;
        for (let i = 1; i < laneCars.length; i++) {
            sum += Math.abs(laneCars[i].position.y - laneCars[i - 1].position.y);
            count++;
        }

        const avg = count > 0 ? sum / count : this._laneTemplateSpacing;
        return Math.max(30, avg);
    }

    private buildLaneBarrier (lane: LaneData): void {
        if (!this._worldRoot) {
            return;
        }

        const scene = this.node.scene;
        const existingBarriers = scene
            ? scene.children
                .flatMap((child) => child.name === 'Eviroment' || child.name === 'Eviroments' ? child.children : [])
                .filter((child) => child.name.startsWith('Wood_Road_Block_XSmall'))
                .sort((a, b) => b.position.x - a.position.x)
            : [];

        const existingBarrier = existingBarriers[lane.index] ?? null;
        if (existingBarrier) {
            existingBarrier.active = true;
            lane.barrier = existingBarrier;
            return;
        }

        const templateBarrier = existingBarriers[0]
            ?? this._worldRoot.getChildByName('Wood_Road_Block_XSmall')
            ?? (scene ? this.findNodeByName(scene, 'Wood_Road_Block_XSmall') : null);
        if (!templateBarrier) {
            return;
        }

        const barrier = instantiate(templateBarrier);
        barrier.name = `Wood_Road_Block_XSmall_${lane.index + 1}`;
        (templateBarrier.parent ?? this._worldRoot).addChild(barrier);
        barrier.setPosition(lane.x, templateBarrier.position.y, templateBarrier.position.z);
        barrier.setScale(templateBarrier.scale);
        barrier.setRotation(templateBarrier.rotation);
        barrier.active = true;
        lane.barrier = barrier;
    }

    private createHud (): void {
        const canvasNode = this.resolveCanvasNode() ?? this.node;
        const canvasTransform = canvasNode.getComponent(UITransform);
        const canvasWidth = canvasTransform?.contentSize.width ?? 720;
        const canvasHeight = canvasTransform?.contentSize.height ?? 1280;
        const halfWidth = canvasWidth * 0.5;
        const halfHeight = canvasHeight * 0.5;

        this._overlayRoot = new Node('PlayableHudRoot');
        this.node.addChild(this._overlayRoot);
        this.setUiLayerRecursive(this._overlayRoot);
        this._overlayRoot.addComponent(UITransform).setContentSize(canvasWidth, canvasHeight);
        const widget = this._overlayRoot.addComponent(Widget);
        widget.isAlignTop = true;
        widget.isAlignBottom = true;
        widget.isAlignLeft = true;
        widget.isAlignRight = true;
        widget.top = 0;
        widget.bottom = 0;
        widget.left = 0;
        widget.right = 0;
        widget.alignMode = Widget.AlignMode.ALWAYS;

        this._phaseLabel = this.createLabel(
            this._overlayRoot,
            'Scene 1 - 4 lan xe cho mua do an',
            canvasWidth < 500 ? 20 : 28,
            new Color(82, 44, 18, 255),
            new Vec3(0, halfHeight - 36, 0),
        );

        const topCardWidth = Math.min(220, canvasWidth * 0.36);
        const topCardHeight = canvasWidth < 500 ? 52 : 64;

        const moneyHolder = this.createRectNode(this._overlayRoot, 'MoneyHolder', new Color(255, 255, 255, 230), topCardWidth, topCardHeight, 12);
        moneyHolder.setPosition(halfWidth - topCardWidth * 0.5 - 16, halfHeight - topCardHeight * 0.5 - 18, 0);
        this._moneyLabel = this.createLabel(
            moneyHolder,
            'Tien: 0',
            canvasWidth < 500 ? 22 : 28,
            new Color(41, 134, 54, 255),
            new Vec3(0, 0, 0),
        );

        this._playButton = this.createButton(
            this._overlayRoot,
            'PlayGameButton',
            'Play Game',
            new Vec3(-halfWidth + topCardWidth * 0.5 + 16, halfHeight - topCardHeight * 0.5 - 18, 0),
            new Vec3(topCardWidth, topCardHeight, 0),
            new Color(53, 159, 226, 255),
            () => this.onPlayGameClicked(),
        );

        const primaryButtonWidth = Math.min(300, canvasWidth - 40);
        const secondaryButtonWidth = Math.min(370, canvasWidth - 24);
        const primaryButtonHeight = canvasWidth < 500 ? 64 : 72;
        const secondaryButtonHeight = canvasWidth < 500 ? 58 : 66;

        this._removeBarrierButton = this.createButton(
            this._overlayRoot,
            'RemoveBarrierButton',
            'Bo thanh chan (0$)',
            new Vec3(0, -halfHeight + 110, 0),
            new Vec3(primaryButtonWidth, primaryButtonHeight, 0),
            new Color(52, 173, 96, 255),
            () => this.onRemoveBarrierClicked(),
        );

        this._dispatchButton = this.createButton(
            this._overlayRoot,
            'DispatchButton',
            'Cho xe vao',
            new Vec3(0, -halfHeight + 110, 0),
            new Vec3(primaryButtonWidth, primaryButtonHeight, 0),
            new Color(61, 123, 236, 255),
            () => this.onDispatchClicked(),
        );
        this._dispatchLabel = this._dispatchButton.getComponentInChildren(Label);

        this._openLaneButton = this.createButton(
            this._overlayRoot,
            'OpenLaneButton',
            'Tao duong cho xe di vao',
            new Vec3(0, -halfHeight + 38, 0),
            new Vec3(secondaryButtonWidth, secondaryButtonHeight, 0),
            new Color(241, 144, 57, 255),
            () => this.onOpenLaneClicked(),
        );
        this._openLaneLabel = this._openLaneButton.getComponentInChildren(Label);
    }

    private createEndingUi (): void {
        if (!this._overlayRoot) {
            return;
        }

        const overlayTransform = this._overlayRoot.getComponent(UITransform);
        const overlayWidth = overlayTransform?.contentSize.width ?? 720;
        const overlayHeight = overlayTransform?.contentSize.height ?? 1280;
        const cardWidth = Math.min(560, overlayWidth - 40);
        const cardHeight = Math.min(520, overlayHeight - 120);

        this._upgradePanel = this.createRectNode(this._overlayRoot, 'UpgradePanel', new Color(24, 24, 24, 198), overlayWidth, overlayHeight);
        this._upgradePanel.setPosition(0, 0, 0);
        this._upgradePanel.active = false;

        const card = this.createRectNode(this._upgradePanel, 'UpgradeCard', new Color(252, 236, 209, 255), cardWidth, cardHeight, 16);
        card.setPosition(0, Math.min(40, overlayHeight * 0.08), 0);

        this.createLabel(card, 'Du tien upgrade nha moi!', overlayWidth < 500 ? 28 : 42, new Color(79, 48, 28, 255), new Vec3(0, cardHeight * 0.36, 0));
        this.createLabel(card, 'Chon nha hang ban muon mo:', overlayWidth < 500 ? 20 : 28, new Color(106, 64, 36, 255), new Vec3(0, cardHeight * 0.24, 0));

        this.createEndingOption(card, 'Ramen', new Vec3(0, cardHeight * 0.04, 0));
        this.createEndingOption(card, 'Hot Dog', new Vec3(0, -cardHeight * 0.14, 0));
        this.createEndingOption(card, 'Hamburger', new Vec3(0, -cardHeight * 0.32, 0));

        this._storePopup = this.createRectNode(this._upgradePanel, 'StorePopup', new Color(255, 255, 255, 255), Math.min(490, overlayWidth - 36), overlayWidth < 500 ? 210 : 240, 14);
        this._storePopup.setPosition(0, -Math.min(overlayHeight * 0.3, 220), 0);
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
        this.trackFirstClick();
    }

    private onRemoveBarrierClicked (): void {
        this.trackFirstClick();
        if (this._phase !== 'scene1' || this._openedLanes > 0) {
            return;
        }

        this.openNextLane();
        this.stopRemoveBarrierPulse();
        this.refreshUiState();
    }

    private onDispatchClicked (): void {
        this.trackFirstClick();
        this.tryDispatchCar();
    }

    private onOpenLaneClicked (): void {
        this.trackFirstClick();
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

    private trackFirstClick (): void {
        if (this._playClicked) {
            return;
        }
        this._playClicked = true;
        super_html_script.on_first_click();
    }

    private tryDispatchCar (): boolean {
        if (this._phase === 'ending') {
            return false;
        }
        if (this._dispatchInProgress || this._elapsed < this._nextDispatchTime) {
            return false;
        }

        const lane = this.pickLaneForDispatch();
        if (!lane || lane.queueCars.length === 0 || !this._worldRoot) {
            return false;
        }

        const car = lane.queueCars.shift();
        if (!car) {
            return false;
        }

        this._dispatchInProgress = true;
        this._nextDispatchTime = this._elapsed + this.getDispatchCooldown();
        this.shiftLaneQueue(lane);
        this.animateCarFlow(lane, car);
        this.refreshDispatchButtonLabel();
        return true;
    }

    private pickLaneForDispatch (): LaneData | null {
        const laneTotal = this.getLaneTotal();
        const openLanes = this._lanes.filter((lane) => lane.open && lane.queueCars.length > 0);
        if (openLanes.length === 0) {
            return null;
        }

        for (let step = 1; step <= laneTotal; step++) {
            const candidateIndex = (this._lastLaneIndex + step + laneTotal) % laneTotal;
            const lane = this._lanes[candidateIndex];
            if (lane && lane.open && lane.queueCars.length > 0) {
                this._lastLaneIndex = candidateIndex;
                return lane;
            }
        }

        return openLanes[0];
    }

    private animateCarFlow (lane: LaneData, car: Node): void {
        const laneUnit = Math.max(0.1, this._laneTemplateSpacing);
        const laneForward = this.getLaneForwardStep(lane);
        const frontSlot = lane.queueSlots[0] ?? car.position.clone();
        const barrierLead = lane.barrier ? Vec3.distance(frontSlot, lane.barrier.position) : laneUnit * 0.9;
        const entryDistance = Math.max(laneUnit * 0.75, barrierLead + laneUnit * 0.2);
        const exitDistance = Math.max(laneUnit * 12, entryDistance + laneUnit * 10);

        const entryPoint = new Vec3(
            frontSlot.x + laneForward.x * entryDistance,
            frontSlot.y + laneForward.y * entryDistance,
            frontSlot.z + laneForward.z * entryDistance,
        );
        const exitPoint = new Vec3(
            frontSlot.x + laneForward.x * exitDistance,
            frontSlot.y + laneForward.y * exitDistance,
            frontSlot.z + laneForward.z * exitDistance,
        );

        Tween.stopAllByTarget(car);
        tween(car)
            .to(0.35, { position: entryPoint }, { easing: 'sineOut' })
            .call(() => {
                this.playCatCookingAnim();
            })
            .to(1.2, { position: exitPoint }, { easing: 'linear' })
            .call(() => {
                this.recycleCarToLane(lane, car);
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

        while (this._openedLanes < this.getLaneTotal()) {
            this.openNextLane();
        }

        this._phase = 'scene2';
        if (this._phaseLabel) {
            this._phaseLabel.string = 'Scene 2 - Follow playable goc';
        }
        this.fillOpenLaneQueues();
        this._nextDispatchTime = this._elapsed + 0.8;
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
        if (nextLane.barrier) {
            nextLane.barrier.active = false;
        }
        this._openedLanes++;
    }

    private getDispatchCooldown (): number {
        const reduction = this._openedLanes * this.cooldownReductionPerOpenedLane;
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
            this._openLaneButton.active = this._phase === 'scene1' && this._openedLanes > 0 && this._openedLanes < this.getLaneTotal();
        }

        if (this._openLaneLabel) {
            if (this._phase === 'scene2') {
                this._openLaneLabel.string = `Da mo du ${this.getLaneTotal()} lan`;
            } else {
                this._openLaneLabel.string = `Tao duong cho xe di vao (${this._openedLanes}/${this.getLaneTotal()})`;
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

        this._dispatchLabel.string = `Cho xe vao (CD ${this.getDispatchCooldown().toFixed(1)}s)`;
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

    private fillOpenLaneQueues (): void {
        this._lanes.forEach((lane) => {
            if (!lane.open) {
                return;
            }
            this.ensureLaneQueueLength(lane, lane.targetQueueSize);
        });
    }

    private ensureLaneQueueLength (lane: LaneData, targetSize: number, instant = false): void {
        const laneStep = this.getLaneSlotStep(lane);
        while (lane.queueSlots.length < targetSize) {
            const slotIndex = lane.queueSlots.length;
            lane.queueSlots.push(new Vec3(
                lane.queueSlots[0].x + laneStep.x * slotIndex,
                lane.queueSlots[0].y + laneStep.y * slotIndex,
                lane.queueSlots[0].z + laneStep.z * slotIndex,
            ));
        }

        while (lane.queueCars.length < targetSize) {
            const car = this.spawnCarForLane(lane);
            if (!car) {
                break;
            }
            lane.queueCars.push(car);
        }

        this.shiftLaneQueue(lane, instant);
    }

    private spawnCarForLane (lane: LaneData): Node | null {
        if (!this._worldRoot || !lane.templateCar || !lane.templateCar.isValid) {
            return null;
        }

        const car = instantiate(lane.templateCar);
        car.active = true;
        this._worldRoot.addChild(car);

        const slotIndex = lane.queueCars.length;
        const slot = lane.queueSlots[slotIndex];
        if (slot) {
            car.setPosition(slot);
        } else {
            const laneStep = this.getLaneSlotStep(lane);
            car.setPosition(new Vec3(
                lane.queueSlots[0].x + laneStep.x * slotIndex,
                lane.queueSlots[0].y + laneStep.y * slotIndex,
                lane.queueSlots[0].z + laneStep.z * slotIndex,
            ));
        }
        car.name = `car_lane${lane.index + 1}_${this._spawnSerial++}`;
        return car;
    }

    private shiftLaneQueue (lane: LaneData, instant = false): void {
        for (let i = 0; i < lane.queueCars.length; i++) {
            const car = lane.queueCars[i];
            const target = lane.queueSlots[i];
            if (!target || !car || !car.isValid) {
                continue;
            }

            if (instant) {
                car.setPosition(target);
            } else {
                tween(car)
                    .to(0.22, { position: target }, { easing: 'sineOut' })
                    .start();
            }
        }
    }

    private recycleCarToLane (lane: LaneData, car: Node): void {
        if (!car || !car.isValid) {
            return;
        }

        const targetIndex = lane.queueCars.length;
        const targetSlot = lane.queueSlots[targetIndex];
        if (!targetSlot) {
            car.destroy();
            return;
        }

        const laneStep = this.getLaneSlotStep(lane);
        const recycleFrom = new Vec3(
            targetSlot.x + laneStep.x,
            targetSlot.y + laneStep.y,
            targetSlot.z + laneStep.z,
        );

        Tween.stopAllByTarget(car);
        car.setPosition(recycleFrom);
        lane.queueCars.push(car);

        tween(car)
            .to(0.28, { position: targetSlot }, { easing: 'sineOut' })
            .start();
    }

    private playCatCookingAnim (): void {
        if (!this._catNode || !this._catNode.isValid) {
            return;
        }

        Tween.stopAllByTarget(this._catNode);
        this._catNode.setScale(this._catScale.x, this._catScale.y, this._catScale.z);

        const bigger = new Vec3(this._catScale.x * 1.15, this._catScale.y * 1.15, this._catScale.z);
        const skeletalAnimation = this._catNode.getComponent(SkeletalAnimation);
        if (skeletalAnimation && skeletalAnimation.defaultClip) {
            skeletalAnimation.crossFade(skeletalAnimation.defaultClip.name, 0.1);
        }

        tween(this._catNode)
            .to(0.12, { scale: bigger }, { easing: 'sineOut' })
            .to(0.12, { scale: this._catScale }, { easing: 'sineIn' })
            .start();
    }

    private isDepthLane (lane: LaneData): boolean {
        if (lane.queueSlots.length < 2) {
            return false;
        }

        const first = lane.queueSlots[0];
        const second = lane.queueSlots[1];
        return Math.abs(second.z - first.z) > Math.abs(second.y - first.y);
    }

    private getLaneSlotStep (lane: LaneData): Vec3 {
        if (lane.queueSlots.length < 2) {
            return this.isDepthLane(lane)
                ? new Vec3(0, 0, this._laneTemplateSpacing)
                : new Vec3(0, this._laneTemplateSpacing, 0);
        }

        const first = lane.queueSlots[0];
        const second = lane.queueSlots[1];
        return new Vec3(second.x - first.x, second.y - first.y, second.z - first.z);
    }

    private getLaneForwardStep (lane: LaneData): Vec3 {
        const backStep = this.getLaneSlotStep(lane);
        const length = Math.sqrt(backStep.x * backStep.x + backStep.y * backStep.y + backStep.z * backStep.z);
        if (length <= 0.0001) {
            return this.isDepthLane(lane) ? new Vec3(0, 0, -1) : new Vec3(0, -1, 0);
        }

        return new Vec3(-backStep.x / length, -backStep.y / length, -backStep.z / length);
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

        node.layer = Layers.Enum.UI_2D;
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
        labelNode.layer = Layers.Enum.UI_2D;
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

    private findNodeByName (root: Node, name: string): Node | null {
        if (root.name === name) {
            return root;
        }

        for (const child of root.children) {
            const found = this.findNodeByName(child, name);
            if (found) {
                return found;
            }
        }

        return null;
    }

    private findCanvasController (root: Node): FoodTruckPlayableController | null {
        const canvas = root.getComponent(Canvas);
        const controller = root.getComponent(FoodTruckPlayableController);
        if (canvas && controller) {
            return controller;
        }

        for (const child of root.children) {
            const found = this.findCanvasController(child);
            if (found) {
                return found;
            }
        }

        return null;
    }

    private destroyStaleHudRoots (): void {
        const scene = this.node.scene;
        if (!scene) {
            return;
        }

        const hudRoots = this.collectNodesByName(scene, 'PlayableHudRoot');
        for (const hudRoot of hudRoots) {
            if (!hudRoot.isValid) {
                continue;
            }

            if (hudRoot.parent !== this.node) {
                hudRoot.destroy();
            }
        }
    }

    private collectNodesByName (root: Node, name: string, result: Node[] = []): Node[] {
        if (root.name === name) {
            result.push(root);
        }

        for (const child of root.children) {
            this.collectNodesByName(child, name, result);
        }

        return result;
    }

    private resolveCanvasNode (): Node | null {
        const selfCanvas = this.node.getComponent(Canvas);
        if (selfCanvas) {
            return this.node;
        }

        if (this.node.getChildByName('Level')) {
            return this.node;
        }

        const parent = this.node.parent;
        if (parent?.getComponent(Canvas)) {
            return parent;
        }
        if (parent && parent.getChildByName('Level')) {
            return parent;
        }

        return null;
    }

    private setUiLayerRecursive (node: Node): void {
        node.layer = Layers.Enum.UI_2D;
        for (const child of node.children) {
            this.setUiLayerRecursive(child);
        }
    }

    private getLaneTotal (): number {
        return this._lanes.length > 0 ? this._lanes.length : this.laneCount;
    }
}
