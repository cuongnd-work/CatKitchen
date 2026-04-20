import {
    _decorator,
    Animation,
    AnimationClip,
    AudioClip,
    AudioSource,
    assetManager,
    Camera,
    Canvas,
    Color,
    Component,
    Font,
    Graphics,
    instantiate,
    Label,
    Layers,
    Node,
    input,
    Input,
    SkeletalAnimation,
    Sprite,
    SpriteFrame,
    Tween,
    TweenEasing,
    UIOpacity,
    UITransform,
    Vec3,
    Widget,
    view,
    tween,
} from 'cc';
import super_html_script from 'db://assets/plugins/playable-foundation/super-html/super_html_script';
import { CameraFollow } from './CameraFollow';
import { OrientationCameraOrthoAdjuster } from './OrientationCameraOrthoAdjuster';
import { UIScreenResolution } from './UIScreenResolution';

const { ccclass, property } = _decorator;

type ScenePhase = 'scene1' | 'scene2' | 'ending';

type LaneData = {
    index: number;
    landId: number;
    x: number;
    barrier: Node | null;
    queueSlots: Vec3[];
    queueCars: Node[];
    templateCar: Node | null;
    targetQueueSize: number;
    open: boolean;
    activeDispatches: number;
    sPoint: Vec3 | null;
    rPoint: Vec3 | null;
    progressPoint: Vec3 | null;
};

@ccclass('FoodTruckPlayableController')
export class FoodTruckPlayableController extends Component {
    private static _activeInstance: FoodTruckPlayableController | null = null;
    private static readonly UI_FONT_UUID = '4b362bb5-2b14-46a5-8c9e-a6688bb70e61';
    private static readonly ENGINE_START_AUDIO_UUID = '58263f6c-43e3-4c65-bf76-36fb080c0f8f';
    private static readonly CAR_HORN_AUDIO_UUID = 'e61f7d9c-d841-44ee-8d0c-68b1f6dbd74c';
    private static readonly HAND_CLIP_UUID = 'e26e9387-4e91-437d-83e6-c772efc4e980';
    private static readonly HAND_FRAME_A_UUID = 'bde249fd-fb02-4191-820c-f22fda1fe1a6@f9941';
    private static readonly HAND_FRAME_B_UUID = 'a68ec147-ff49-457b-b230-122b84c2e70c@f9941';
    private readonly laneCount = 4;
    private readonly baseDispatchCooldown = 2;
    private readonly cooldownReductionPerOpenedLane = 0.5;
    private readonly minimumDispatchCooldown = 0.5;
    private readonly startingCash = 30;
    private readonly scene1Reward = 200;
    private readonly scene2Reward = 200;
    private readonly scene2StartMoney = 220;
    private readonly endingMoneyTarget = 720;
    private readonly scene2MaxConcurrentDispatches = 3;
    private readonly removeBarrierCost = 25;
    private readonly dispatchCarCost = 5;
    private readonly openLaneCost = 120;
    private readonly manualDispatchesToAuto = 20;
    private readonly autoCarsToEnding = 6;
    private readonly handHintIdleDelay = 4;
    private readonly handHintOffset = new Vec3(0, -86, 0);
    private readonly hornPromptIdleDelay = 4;
    private readonly hornPromptRepeatDelay = 3.2;

    private _phase: ScenePhase = 'scene1';
    private _money = this.startingCash;
    private _carsServed = 0;
    private _openedLanes = 0;
    private _activeDispatchCount = 0;
    private _elapsed = 0;
    private _nextDispatchTime = 0;
    private _lastLaneIndex = -1;
    private _playClicked = false;
    private _manualDispatchCount = 0;
    private _autoCarsServed = 0;

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
    private _removeBarrierLabel: Label | null = null;
    private _dispatchLabel: Label | null = null;
    private _openLaneLabel: Label | null = null;

    private _playButton: Node | null = null;
    private _removeBarrierButton: Node | null = null;
    private _dispatchButton: Node | null = null;
    private _openLaneButton: Node | null = null;

    private _upgradePanel: Node | null = null;
    private _storePopup: Node | null = null;
    private _storeTitleLabel: Label | null = null;
    private _serviceProgressNode: Node | null = null;
    private _serviceProgressGraphics: Graphics | null = null;
    private _serviceProgressWorldPosition: Vec3 | null = null;
    private _removeBarrierPulse: Tween<Node> | null = null;
    private _lanes: LaneData[] = [];
    private _uiFont: Font | null = null;
    private _handHintRoot: Node | null = null;
    private _handHintAnimation: Animation | null = null;
    private _handHintClip: AnimationClip | null = null;
    private _handFrameA: SpriteFrame | null = null;
    private _handFrameB: SpriteFrame | null = null;
    private _handHintReady = false;
    private _handHintTarget: Node | null = null;
    private _engineStartAudio: AudioClip | null = null;
    private _carHornAudio: AudioClip | null = null;
    private _engineAudioSource: AudioSource | null = null;

    @property(Node)
    public endingSelectionNode: Node | null = null;

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
        this.loadUiFont();
        this.loadEngineStartAudio();
        this.loadCarHornAudio();
        this.bindWorldNodes();
        this.configureMainCamera();
        this.prepareLanesFromWorld();
        this.createHud();
        this.loadHandHint();
        this.createEndingUi();
        this.refreshUiState();
        if (this.endingSelectionNode) {
            this.endingSelectionNode.active = false;
        }
        input.on(Input.EventType.TOUCH_START, this.onGlobalTouchStart, this);
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
        this.unschedule(this.showHandHintForCurrentTarget);
        this.unschedule(this.playHornPromptIfNeeded);
        input.off(Input.EventType.TOUCH_START, this.onGlobalTouchStart, this);
    }

    update (deltaTime: number): void {
        this._elapsed += Math.max(0, deltaTime);
        this.refreshDispatchButtonLabel();
        this.updateServiceProgressPosition();
        if (this._phase === 'scene2' && this.canDispatchMoreCars() && this._elapsed >= this._nextDispatchTime) {
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
                const landId = this.parseLandId(laneRoot.name, index + 1);
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
                    landId,
                    x: firstLocal.x,
                    barrier: null,
                    queueSlots,
                    queueCars: laneCars,
                    templateCar,
                    targetQueueSize,
                    open: false,
                    activeDispatches: 0,
                    sPoint: null,
                    rPoint: null,
                    progressPoint: null,
                });
            });
        }

        if (this._lanes.length === 0) {
            this.prepareLegacyLanesFromWorld();
        }

        this._lanes.sort((a, b) => b.x - a.x);
        this._lanes.forEach((lane, index) => {
            lane.index = index;
            lane.sPoint = this.findLaneRouteMarker(`S${lane.landId}`);
            lane.rPoint = this.findLaneRouteMarker(`R${lane.landId}`);
            lane.progressPoint = this.findLaneRouteMarker(`P${lane.landId}`);
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
                landId: i + 1,
                x: laneX,
                barrier: null,
                queueSlots,
                queueCars: laneCars,
                templateCar,
                targetQueueSize,
                open: false,
                activeDispatches: 0,
                sPoint: null,
                rPoint: null,
                progressPoint: null,
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

        const topCardWidth = Math.min(220, canvasWidth * 0.36);
        const topCardHeight = canvasWidth < 500 ? 52 : 64;

        const moneyHolder = this.createRectNode(this._overlayRoot, 'MoneyHolder', new Color(255, 255, 255, 230), topCardWidth, topCardHeight, 12);
        moneyHolder.setPosition(halfWidth - topCardWidth * 0.5 - 16, halfHeight - topCardHeight * 0.5 - 18, 0);
        this._moneyLabel = this.createLabel(
            moneyHolder,
            `Cash: ${this._money}`,
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
        const bottomPrimaryY = -halfHeight + 160;
        const bottomSecondaryY = -halfHeight + 88;

        this._removeBarrierButton = this.createButton(
            this._overlayRoot,
            'RemoveBarrierButton',
            `Remove Barrier ($${this.removeBarrierCost})`,
            new Vec3(0, bottomPrimaryY, 0),
            new Vec3(primaryButtonWidth, primaryButtonHeight, 0),
            new Color(52, 173, 96, 255),
            () => this.onRemoveBarrierClicked(),
        );
        this._removeBarrierLabel = this._removeBarrierButton.getComponentInChildren(Label);

        this._dispatchButton = this.createButton(
            this._overlayRoot,
            'DispatchButton',
            `Send Cars ($${this.dispatchCarCost})`,
            new Vec3(0, bottomPrimaryY, 0),
            new Vec3(primaryButtonWidth, primaryButtonHeight, 0),
            new Color(61, 123, 236, 255),
            () => this.onDispatchClicked(),
        );
        this._dispatchLabel = this._dispatchButton.getComponentInChildren(Label);

        this._openLaneButton = this.createButton(
            this._overlayRoot,
            'OpenLaneButton',
            `Open Car Route ($${this.openLaneCost})`,
            new Vec3(0, bottomSecondaryY, 0),
            new Vec3(secondaryButtonWidth, secondaryButtonHeight, 0),
            new Color(241, 144, 57, 255),
            () => this.onOpenLaneClicked(),
        );
        this._openLaneLabel = this._openLaneButton.getComponentInChildren(Label);

        this._serviceProgressNode = new Node('ServiceProgressOverlay');
        this._overlayRoot.addChild(this._serviceProgressNode);
        this.setUiLayerRecursive(this._serviceProgressNode);
        this._serviceProgressNode.addComponent(UITransform).setContentSize(56, 56);
        this._serviceProgressGraphics = this._serviceProgressNode.addComponent(Graphics);
        this._serviceProgressNode.active = false;
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

        this.createLabel(card, 'Upgrade Unlocked!', overlayWidth < 500 ? 28 : 42, new Color(79, 48, 28, 255), new Vec3(0, cardHeight * 0.36, 0));
        this.createLabel(card, 'Choose your next restaurant:', overlayWidth < 500 ? 20 : 28, new Color(106, 64, 36, 255), new Vec3(0, cardHeight * 0.24, 0));

        this.createEndingOption(card, 'Ramen', new Vec3(0, cardHeight * 0.04, 0));
        this.createEndingOption(card, 'Hot Dog', new Vec3(0, -cardHeight * 0.14, 0));
        this.createEndingOption(card, 'Hamburger', new Vec3(0, -cardHeight * 0.32, 0));

        this._storePopup = this.createRectNode(this._upgradePanel, 'StorePopup', new Color(255, 255, 255, 255), Math.min(490, overlayWidth - 36), overlayWidth < 500 ? 210 : 240, 14);
        this._storePopup.setPosition(0, -Math.min(overlayHeight * 0.3, 220), 0);
        this._storePopup.active = false;

        this._storeTitleLabel = this.createLabel(
            this._storePopup,
            'Store Open',
            30,
            new Color(73, 41, 20, 255),
            new Vec3(0, 65, 0),
        );

        this.createButton(
            this._storePopup,
            'StoreGoButton',
            'Enter Store',
            new Vec3(0, -10, 0),
            new Vec3(220, 62, 0),
            new Color(52, 173, 96, 255),
            () => this.onStoreConfirmClicked(),
        );

        this.createButton(
            this._storePopup,
            'StoreCloseButton',
            'Close',
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
        super_html_script.on_click_game_end();
        super_html_script.on_click_download();
    }

    private onRemoveBarrierClicked (): void {
        this.trackFirstClick();
        if (this._phase !== 'scene1' || this._openedLanes > 0 || !this.trySpendMoney(this.removeBarrierCost)) {
            return;
        }

        this.openNextLane();
        this.stopRemoveBarrierPulse();
        this.refreshUiState();
    }

    private onDispatchClicked (): void {
        this.trackFirstClick();
        if (this._phase === 'scene1') {
            this._manualDispatchCount++;
        }
        if (!this.trySpendMoney(this.dispatchCarCost)) {
            if (this._phase === 'scene1') {
                this._manualDispatchCount = Math.max(0, this._manualDispatchCount - 1);
            }
            return;
        }

        const dispatched = this.tryDispatchCar(true);
        if (!dispatched) {
            this.addMoney(this.dispatchCarCost);
            if (this._phase === 'scene1') {
                this._manualDispatchCount = Math.max(0, this._manualDispatchCount - 1);
            }
            return;
        }

        this.tryEnterScene2();
    }

    private onOpenLaneClicked (): void {
        this.trackFirstClick();
        if (this._phase !== 'scene1' || !this.trySpendMoney(this.openLaneCost)) {
            return;
        }
        this.openNextLane();
        this.refreshUiState();
    }

    private onEndingOptionClicked (_selection: string): void {
        if (this._storePopup) {
            this._storePopup.active = false;
        }

        super_html_script.on_click_game_end();
        super_html_script.on_click_download();
    }

    private onStoreConfirmClicked (): void {
        super_html_script.on_click_game_end();
        super_html_script.on_click_download();
    }

    private trackFirstClick (): void {
        this.hideHandHint();
        this.scheduleHandHint();
        if (this._playClicked) {
            return;
        }
        this._playClicked = true;
        super_html_script.on_first_click();
    }

    private tryDispatchCar (ignoreCooldown = false): boolean {
        if (this._phase === 'ending') {
            return false;
        }
        if (!this.canDispatchMoreCars(ignoreCooldown) || (!ignoreCooldown && this._elapsed < this._nextDispatchTime)) {
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

        lane.activeDispatches++;
        this._activeDispatchCount++;
        this._nextDispatchTime = this._elapsed + this.getDispatchCooldown();
        this.shiftLaneQueue(lane);
        this.animateCarFlow(lane, car);
        this.refreshDispatchButtonLabel();
        return true;
    }

    private pickLaneForDispatch (): LaneData | null {
        const laneTotal = this.getLaneTotal();
        const openLanes = this._lanes.filter((lane) => lane.open && lane.queueCars.length > 0 && lane.activeDispatches === 0);
        if (openLanes.length === 0) {
            return null;
        }

        for (let step = 1; step <= laneTotal; step++) {
            const candidateIndex = (this._lastLaneIndex + step + laneTotal) % laneTotal;
            const lane = this._lanes[candidateIndex];
            if (lane && lane.open && lane.queueCars.length > 0 && lane.activeDispatches === 0) {
                this._lastLaneIndex = candidateIndex;
                return lane;
            }
        }

        return openLanes[0];
    }

    private animateCarFlow (lane: LaneData, car: Node): void {
        const frontSlot = lane.queueSlots[0] ?? car.position.clone();
        const route = this.getLaneRouteTargets(lane, frontSlot);
        const drivePath = this.buildDrivePath(lane, car.position.clone(), route.sPoint, route.rPoint);

        Tween.stopAllByTarget(car);
        this.playEngineStartAudio();
        let sequence = tween(car);
        for (let i = 0; i < drivePath.length; i++) {
            const section = drivePath[i];
            sequence = sequence.then(this.tweenCarAlongPoints(car, section.points, section.speed, section.minSegmentDuration));
            if (section.pauseAfter > 0) {
                sequence = sequence.call(() => {
                    this.playCatCookingAnim();
                    this.playServiceProgress(lane, car, section.pauseAfter);
                }).delay(section.pauseAfter);
            }
        }

        sequence
            .call(() => {
                this.recycleCarToLane(lane, car);
                this.onCarServed(lane);
            })
            .start();
    }

    private onCarServed (lane: LaneData): void {
        lane.activeDispatches = Math.max(0, lane.activeDispatches - 1);
        this._activeDispatchCount = Math.max(0, this._activeDispatchCount - 1);
        this._carsServed++;
        this.addMoney(this._phase === 'scene1' ? this.scene1Reward : this.scene2Reward);

        if (this._phase === 'scene1') {
            return;
        }

        if (this._phase === 'scene2') {
            this._autoCarsServed++;
            this.fillOpenLaneQueues();
            if (this._autoCarsServed >= this.autoCarsToEnding) {
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
        this._autoCarsServed = 0;
        if (this._phaseLabel) {
            this._phaseLabel.string = 'Scene 2 - Full Auto Service';
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
            this._phaseLabel.string = 'Ending - Choose a New Restaurant';
        }
        if (this._upgradePanel) {
            this._upgradePanel.active = true;
        }
        if (this.endingSelectionNode) {
            this.endingSelectionNode.active = true;
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
        this.tryEnterScene2();
    }

    private tryEnterScene2 (): void {
        if (this._phase !== 'scene1') {
            return;
        }

        const openedAllLanes = this._openedLanes >= this.getLaneTotal();
        const reachedManualDispatchTarget = this._manualDispatchCount >= this.manualDispatchesToAuto;
        if (!openedAllLanes && !reachedManualDispatchTarget) {
            return;
        }

        this.enterScene2();
    }

    private loadHandHint (): void {
        assetManager.loadAny(FoodTruckPlayableController.HAND_CLIP_UUID, (clipError: Error | null, clipAsset: AnimationClip) => {
            if (clipError || !clipAsset || !this.node?.isValid) {
                return;
            }

            this._handHintClip = clipAsset;
            this.tryCreateHandHint();
        });

        assetManager.loadAny(FoodTruckPlayableController.HAND_FRAME_A_UUID, (frameError: Error | null, frameAsset: SpriteFrame) => {
            if (frameError || !frameAsset || !this.node?.isValid) {
                return;
            }

            this._handFrameA = frameAsset;
            this.tryCreateHandHint();
        });

        assetManager.loadAny(FoodTruckPlayableController.HAND_FRAME_B_UUID, (frameError: Error | null, frameAsset: SpriteFrame) => {
            if (frameError || !frameAsset || !this.node?.isValid) {
                return;
            }

            this._handFrameB = frameAsset;
            this.tryCreateHandHint();
        });
    }

    private loadEngineStartAudio (): void {
        assetManager.loadAny(FoodTruckPlayableController.ENGINE_START_AUDIO_UUID, (error: Error | null, clip: AudioClip) => {
            if (error || !clip || !this.node?.isValid) {
                return;
            }

            this._engineStartAudio = clip;
        });
    }

    private loadCarHornAudio (): void {
        assetManager.loadAny(FoodTruckPlayableController.CAR_HORN_AUDIO_UUID, (error: Error | null, clip: AudioClip) => {
            if (error || !clip || !this.node?.isValid) {
                return;
            }

            this._carHornAudio = clip;
            this.refreshHornPrompt();
        });
    }

    private playEngineStartAudio (): void {
        if (!this._engineStartAudio || !this.node?.isValid) {
            return;
        }

        const source = this._engineAudioSource ?? this.node.getComponent(AudioSource) ?? this.node.addComponent(AudioSource);
        this._engineAudioSource = source;
        source.playOneShot(this._engineStartAudio, 1);
    }

    private playHornPromptIfNeeded = (): void => {
        if (!this.shouldPromptDispatchHorn() || !this._carHornAudio || !this.node?.isValid) {
            this.refreshHornPrompt();
            return;
        }

        const source = this._engineAudioSource ?? this.node.getComponent(AudioSource) ?? this.node.addComponent(AudioSource);
        this._engineAudioSource = source;
        source.playOneShot(this._carHornAudio, 0.9);
        this.unschedule(this.playHornPromptIfNeeded);
        if (this.shouldPromptDispatchHorn()) {
            this.scheduleOnce(this.playHornPromptIfNeeded, this.hornPromptRepeatDelay);
        }
    };

    private refreshHornPrompt (): void {
        this.unschedule(this.playHornPromptIfNeeded);
        if (!this.shouldPromptDispatchHorn() || !this._carHornAudio) {
            return;
        }

        this.scheduleOnce(this.playHornPromptIfNeeded, this.hornPromptIdleDelay);
    }

    private shouldPromptDispatchHorn (): boolean {
        return !!this._dispatchButton
            && this._dispatchButton.activeInHierarchy
            && this.canAfford(this.dispatchCarCost)
            && this._activeDispatchCount === 0
            && this._phase !== 'ending';
    }

    private tryCreateHandHint (): void {
        if (this._handHintReady || !this._overlayRoot?.isValid || !this._handHintClip || !this._handFrameA || !this._handFrameB) {
            return;
        }

        const root = new Node('HandHint');
        this._overlayRoot.addChild(root);
        root.layer = Layers.Enum.UI_2D;
        root.addComponent(UITransform).setContentSize(180, 190);
        root.setScale(0.6, 0.6, 1);
        root.active = false;

        const frameA = this.createHandFrameNode(root, 'tile000', this._handFrameA);
        frameA.active = true;
        const frameB = this.createHandFrameNode(root, 'tile001', this._handFrameB);
        frameB.active = false;

        const animation = root.addComponent(Animation);
        animation.defaultClip = this._handHintClip;
        animation.playOnLoad = false;
        animation.addClip(this._handHintClip, this._handHintClip.name);

        this._handHintRoot = root;
        this._handHintAnimation = animation;
        this._handHintReady = true;
        this.showHandHintForCurrentTarget();
    }

    private createHandFrameNode (parent: Node, name: string, frame: SpriteFrame): Node {
        const node = new Node(name);
        parent.addChild(node);
        node.layer = Layers.Enum.UI_2D;
        node.addComponent(UITransform).setContentSize(180, 190);
        const sprite = node.addComponent(Sprite);
        sprite.spriteFrame = frame;
        return node;
    }

    private onGlobalTouchStart (): void {
        this.hideHandHint();
        this.scheduleHandHint();
        this.refreshHornPrompt();
    }

    private scheduleHandHint (): void {
        this.unschedule(this.showHandHintForCurrentTarget);
        this.scheduleOnce(this.showHandHintForCurrentTarget, this.handHintIdleDelay);
    }

    private showHandHintForCurrentTarget = (): void => {
        if (!this._handHintReady || !this._handHintRoot?.isValid) {
            return;
        }

        const target = this.getPreferredHandHintTarget();
        if (!target) {
            this.hideHandHint();
            return;
        }

        this._handHintTarget = target;
        const handScale = this._handHintRoot.getScale();
        const targetPosition = target.position.clone().add(new Vec3(
            this.handHintOffset.x * handScale.x,
            this.handHintOffset.y * handScale.y,
            this.handHintOffset.z,
        ));
        this._handHintRoot.setPosition(targetPosition.x, targetPosition.y, targetPosition.z);
        this._handHintRoot.active = true;
        if (this._handHintAnimation && this._handHintClip) {
            this._handHintAnimation.play(this._handHintClip.name);
        }
    };

    private hideHandHint (): void {
        if (!this._handHintRoot?.isValid) {
            return;
        }

        this._handHintRoot.active = false;
        this._handHintTarget = null;
        if (this._handHintAnimation) {
            this._handHintAnimation.stop();
        }
    }

    private getPreferredHandHintTarget (): Node | null {
        const candidates = [
            this._removeBarrierButton,
            this._openLaneButton,
            this._dispatchButton,
        ];

        for (const button of candidates) {
            if (!button || !button.isValid || !button.activeInHierarchy) {
                continue;
            }

            if (button === this._removeBarrierButton && !this.canAfford(this.removeBarrierCost)) {
                continue;
            }

            if (button === this._openLaneButton && !this.canAfford(this.openLaneCost)) {
                continue;
            }

            if (button === this._dispatchButton && !this.canAfford(this.dispatchCarCost)) {
                continue;
            }

            return button;
        }

        return null;
    }

    private getDispatchCooldown (): number {
        const reduction = this._openedLanes * this.cooldownReductionPerOpenedLane;
        return Math.max(this.minimumDispatchCooldown, this.baseDispatchCooldown - reduction);
    }

    private getMaxConcurrentDispatches (ignoreCooldown = false): number {
        if (ignoreCooldown && this._openedLanes > 0) {
            return this.scene2MaxConcurrentDispatches;
        }

        if (this._phase === 'scene2') {
            return this.scene2MaxConcurrentDispatches;
        }

        return 1;
    }

    private canDispatchMoreCars (ignoreCooldown = false): boolean {
        return this._activeDispatchCount < this.getMaxConcurrentDispatches(ignoreCooldown);
    }

    private canAfford (cost: number): boolean {
        return this._money >= cost;
    }

    private trySpendMoney (cost: number): boolean {
        if (cost <= 0) {
            return true;
        }
        if (!this.canAfford(cost)) {
            this.refreshUiState();
            return false;
        }

        this._money -= cost;
        this.refreshUiState();
        return true;
    }

    private refreshUiState (): void {
        const waitingForBarrier = this._phase === 'scene1' && this._openedLanes === 0;
        if (this._removeBarrierButton) {
            this._removeBarrierButton.active = waitingForBarrier;
        }
        if (this._removeBarrierLabel) {
            this._removeBarrierLabel.string = `Remove Barrier ($${this.removeBarrierCost})`;
        }
        const canBuyBarrier = waitingForBarrier && this.canAfford(this.removeBarrierCost);
        this.setButtonLockedVisual(this._removeBarrierButton, canBuyBarrier);
        if (canBuyBarrier) {
            this.startRemoveBarrierPulse();
        } else {
            this.stopRemoveBarrierPulse();
        }

        const dispatchVisible = this._phase !== 'ending' && this._openedLanes > 0;
        if (this._dispatchButton) {
            this._dispatchButton.active = dispatchVisible;
        }
        this.setButtonLockedVisual(this._dispatchButton, dispatchVisible && this.canAfford(this.dispatchCarCost));

        const openLaneVisible = this._phase === 'scene1' && this._openedLanes > 0 && this._openedLanes < this.getLaneTotal();
        if (this._openLaneButton) {
            this._openLaneButton.active = openLaneVisible;
        }

        if (this._openLaneLabel) {
            if (this._phase === 'scene2') {
                this._openLaneLabel.string = `All ${this.getLaneTotal()} Lanes Open`;
            } else {
                this._openLaneLabel.string = `Open Car Route ($${this.openLaneCost})`;
            }
        }
        this.setButtonLockedVisual(this._openLaneButton, openLaneVisible && this.canAfford(this.openLaneCost));

        this.refreshMoneyLabel();
        this.refreshDispatchButtonLabel();
        this.refreshHornPrompt();
        if (this._handHintRoot?.activeInHierarchy) {
            this.showHandHintForCurrentTarget();
        }
    }

    private refreshDispatchButtonLabel (): void {
        if (!this._dispatchLabel || !this._dispatchButton || !this._dispatchButton.active) {
            return;
        }
        this._dispatchLabel.string = `Send Cars ($${this.dispatchCarCost})`;
    }

    private refreshMoneyLabel (): void {
        if (this._moneyLabel) {
            this._moneyLabel.string = `Cash: ${this._money}`;
        }
    }

    private addMoney (amount: number): void {
        this._money += Math.max(0, Math.floor(amount));
        this.refreshUiState();
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
                this.tweenQueueCarTo(car, target).start();
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

        car.setPosition(recycleFrom);
        lane.queueCars.push(car);

        this.tweenQueueCarTo(car, targetSlot, 0.32).start();
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

    private beginServiceProgress (lane: LaneData, car: Node, progress: number): void {
        if (!this._serviceProgressNode || !this._serviceProgressGraphics) {
            return;
        }

        this._serviceProgressWorldPosition = lane.progressPoint?.clone() ?? car.getWorldPosition(new Vec3());
        this.updateServiceProgressPosition();
        Tween.stopAllByTarget(this._serviceProgressNode);
        this._serviceProgressNode.active = true;
        this.drawServiceProgress(this._serviceProgressGraphics, progress);
    }

    private playServiceProgress (lane: LaneData, car: Node, duration: number): void {
        this.beginServiceProgress(lane, car, 0);
        if (!this._serviceProgressNode || !this._serviceProgressGraphics) {
            return;
        }

        const state = { value: 0 };
        tween(state)
            .to(duration, { value: 1 }, {
                easing: 'linear',
                onUpdate: () => {
                    if (this._serviceProgressGraphics) {
                        this.drawServiceProgress(this._serviceProgressGraphics, state.value);
                    }
                },
            })
            .call(() => {
                if (this._serviceProgressGraphics) {
                    this.drawServiceProgress(this._serviceProgressGraphics, 1);
                }
                if (this._serviceProgressNode?.isValid) {
                    this._serviceProgressNode.active = false;
                }
                this._serviceProgressWorldPosition = null;
            })
            .start();
    }

    private updateServiceProgressPosition (): void {
        if (!this._serviceProgressNode || !this._serviceProgressWorldPosition) {
            return;
        }

        const camera = this._mainCameraNode?.getComponent(Camera);
        const overlayTransform = this._overlayRoot?.getComponent(UITransform);
        if (!camera || !overlayTransform) {
            return;
        }

        const screenPos = camera.worldToScreen(this._serviceProgressWorldPosition);
        const visibleSize = view.getVisibleSize();
        const scaleX = overlayTransform.contentSize.width / Math.max(1, visibleSize.width);
        const scaleY = overlayTransform.contentSize.height / Math.max(1, visibleSize.height);
        const localX = (screenPos.x - visibleSize.width * 0.5) * scaleX;
        const localY = (screenPos.y - visibleSize.height * 0.5) * scaleY;
        this._serviceProgressNode.setPosition(localX, localY, 0);
    }

    private drawServiceProgress (graphics: Graphics, progress: number): void {
        const clamped = Math.max(0, Math.min(1, progress));
        const radius = 14;
        const startAngle = Math.PI * 0.5;
        const endAngle = startAngle - Math.PI * 2 * clamped;

        graphics.clear();

        graphics.lineWidth = 4;
        graphics.strokeColor = new Color(255, 255, 255, 150);
        graphics.circle(0, 0, radius);
        graphics.stroke();

        graphics.lineWidth = 5;
        graphics.strokeColor = new Color(97, 227, 128, 255);
        graphics.arc(0, 0, radius, startAngle, endAngle, true);
        graphics.stroke();

        graphics.fillColor = new Color(30, 30, 30, 220);
        graphics.circle(0, 0, radius - 6);
        graphics.fill();
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

    private getLaneRouteTargets (lane: LaneData, frontSlot: Vec3): { sPoint: Vec3; rPoint: Vec3 } {
        const sPoint = lane.sPoint
            ? lane.sPoint.clone()
            : new Vec3(frontSlot.x + 2, frontSlot.y, frontSlot.z);
        const rPoint = lane.rPoint
            ? lane.rPoint.clone()
            : new Vec3(sPoint.x + 6, sPoint.y, sPoint.z);

        return { sPoint, rPoint };
    }

    private buildDrivePath (
        lane: LaneData,
        start: Vec3,
        sPoint: Vec3,
        rPoint: Vec3,
    ): Array<{ points: Vec3[]; speed: number; minSegmentDuration: number; pauseAfter: number }> {
        const queueForward = this.normalizeVec3(this.getLaneForwardStep(lane), new Vec3(1, 0, 0));
        const roadForward = this.normalizeVec3(
            new Vec3(rPoint.x - sPoint.x, rPoint.y - sPoint.y, rPoint.z - sPoint.z),
            new Vec3(1, 0, 0),
        );
        const radius = Math.max(0.9, Math.min(2.1, Vec3.distance(start, sPoint) * 0.28));
        const exitPoint = new Vec3(
            rPoint.x + roadForward.x * 1.6,
            rPoint.y + roadForward.y * 1.6,
            rPoint.z + roadForward.z * 1.6,
        );

        const approachPoints = this.sampleCubicBezierPoints(
            start,
            this.addScaled(start, queueForward, radius),
            this.addScaled(sPoint, roadForward, -radius * 0.65),
            sPoint,
            10,
        );
        const departurePoints = this.sampleCubicBezierPoints(
            sPoint,
            this.addScaled(sPoint, roadForward, radius * 0.45),
            this.addScaled(rPoint, roadForward, -radius * 0.5),
            rPoint,
            12,
        );
        const exitPoints = this.sampleCubicBezierPoints(
            rPoint,
            this.addScaled(rPoint, roadForward, radius * 0.35),
            this.addScaled(exitPoint, roadForward, -radius * 0.15),
            exitPoint,
            6,
        );

        return [
            { points: approachPoints, speed: 6.8, minSegmentDuration: 0.05, pauseAfter: 0.45 },
            { points: departurePoints, speed: 8.6, minSegmentDuration: 0.045, pauseAfter: 0 },
            { points: exitPoints, speed: 10.5, minSegmentDuration: 0.04, pauseAfter: 0 },
        ];
    }

    private findLaneRouteMarker (name: string): Vec3 | null {
        const scene = this.node.scene;
        if (!scene || !this._worldRoot) {
            return null;
        }

        const marker = this.findNodeByName(scene, name);
        if (!marker) {
            return null;
        }

        const worldPos = marker.getWorldPosition(new Vec3());
        return this._worldRoot.inverseTransformPoint(new Vec3(), worldPos);
    }

    private parseLandId (name: string, fallback: number): number {
        const match = name.match(/^Land(\d+)$/i);
        if (!match) {
            return fallback;
        }

        return Number.parseInt(match[1], 10) || fallback;
    }

    private faceCarAlong (car: Node, from: Vec3, to: Vec3): void {
        if (!car || !car.isValid) {
            return;
        }

        const yaw = this.getTweenYaw(car, from, to);
        if (yaw === null) {
            return;
        }

        car.setRotationFromEuler(0, yaw, 0);
    }

    private tweenCarTo (
        car: Node,
        from: Vec3,
        to: Vec3,
        duration: number,
        easing: TweenEasing,
    ): Tween<Node> {
        const yaw = this.getTweenYaw(car, from, to);
        const props: { position: Vec3; eulerAngles?: Vec3 } = {
            position: to.clone(),
        };

        if (yaw !== null) {
            props.eulerAngles = new Vec3(0, yaw, 0);
        }

        return tween(car).to(duration, props, { easing });
    }

    private tweenCarAlongPoints (
        car: Node,
        points: Vec3[],
        speed: number,
        minSegmentDuration: number,
    ): Tween<Node> {
        let sequence = tween(car);
        for (let i = 1; i < points.length; i++) {
            const from = points[i - 1];
            const to = points[i];
            sequence = sequence.then(this.tweenCarTo(
                car,
                from,
                to,
                this.getTravelDuration(from, to, speed, minSegmentDuration),
                'linear',
            ));
        }

        return sequence;
    }

    private sampleCubicBezierPoints (
        p0: Vec3,
        p1: Vec3,
        p2: Vec3,
        p3: Vec3,
        segments: number,
    ): Vec3[] {
        const points: Vec3[] = [p0.clone()];
        for (let i = 1; i <= segments; i++) {
            const t = i / segments;
            const inv = 1 - t;
            const inv2 = inv * inv;
            const inv3 = inv2 * inv;
            const t2 = t * t;
            const t3 = t2 * t;
            points.push(new Vec3(
                inv3 * p0.x + 3 * inv2 * t * p1.x + 3 * inv * t2 * p2.x + t3 * p3.x,
                inv3 * p0.y + 3 * inv2 * t * p1.y + 3 * inv * t2 * p2.y + t3 * p3.y,
                inv3 * p0.z + 3 * inv2 * t * p1.z + 3 * inv * t2 * p2.z + t3 * p3.z,
            ));
        }

        return points;
    }

    private normalizeVec3 (value: Vec3, fallback: Vec3): Vec3 {
        const length = Math.sqrt(value.x * value.x + value.y * value.y + value.z * value.z);
        if (length <= 0.0001) {
            return fallback.clone();
        }

        return new Vec3(value.x / length, value.y / length, value.z / length);
    }

    private addScaled (origin: Vec3, direction: Vec3, distance: number): Vec3 {
        return new Vec3(
            origin.x + direction.x * distance,
            origin.y + direction.y * distance,
            origin.z + direction.z * distance,
        );
    }

    private tweenQueueCarTo (car: Node, target: Vec3, minDuration = 0.24): Tween<Node> {
        const current = car.position.clone();
        const yaw = this.getTweenYaw(car, current, target);
        const props: { position: Vec3; eulerAngles?: Vec3 } = {
            position: target.clone(),
        };
        if (yaw !== null) {
            props.eulerAngles = new Vec3(0, yaw, 0);
        }

        return tween(car).to(this.getTravelDuration(current, target, 11.5, minDuration), props, { easing: 'quadOut' });
    }

    private getYawDegrees (from: Vec3, to: Vec3): number | null {
        const dx = to.x - from.x;
        const dz = to.z - from.z;
        if (Math.abs(dx) < 0.0001 && Math.abs(dz) < 0.0001) {
            return null;
        }

        return Math.atan2(dx, dz) * 180 / Math.PI + 180;
    }

    private getTweenYaw (car: Node, from: Vec3, to: Vec3): number | null {
        const targetYaw = this.getYawDegrees(from, to);
        if (targetYaw === null) {
            return null;
        }

        return this.getClosestYaw(car.eulerAngles.y, targetYaw);
    }

    private getClosestYaw (currentYaw: number, targetYaw: number): number {
        let delta = (targetYaw - currentYaw) % 360;
        if (delta > 180) {
            delta -= 360;
        } else if (delta < -180) {
            delta += 360;
        }

        return currentYaw + delta;
    }

    private getTravelDuration (from: Vec3, to: Vec3, speed: number, minDuration: number): number {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dz = to.z - from.z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        return Math.max(minDuration, distance / Math.max(0.01, speed));
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
        if (!buttonNode.getComponent(UIOpacity)) {
            buttonNode.addComponent(UIOpacity);
        }
        buttonNode.setPosition(position.x, position.y, position.z);
        this.createLabel(buttonNode, text, 24, new Color(255, 255, 255, 255), new Vec3(0, 0, 0));
        this.attachButtonPressFeedback(buttonNode);
        buttonNode.on(Node.EventType.TOUCH_END, onClick, this);
        return buttonNode;
    }

    private attachButtonPressFeedback (buttonNode: Node): void {
        const opacity = buttonNode.getComponent(UIOpacity) ?? buttonNode.addComponent(UIOpacity);
        const pressedOffset = 4;
        const pressedOpacityDelta = 35;
        let isPressed = false;
        let restPosition = buttonNode.position.clone();
        let restOpacity = opacity.opacity;

        const restoreState = (): void => {
            if (!buttonNode.isValid || !isPressed) {
                return;
            }

            isPressed = false;
            buttonNode.setPosition(restPosition.x, restPosition.y, restPosition.z);
            opacity.opacity = restOpacity;
        };

        buttonNode.on(Node.EventType.TOUCH_START, () => {
            if (!buttonNode.activeInHierarchy || isPressed) {
                return;
            }

            isPressed = true;
            restPosition = buttonNode.position.clone();
            restOpacity = opacity.opacity;
            buttonNode.setPosition(restPosition.x, restPosition.y - pressedOffset, restPosition.z);
            opacity.opacity = Math.max(80, restOpacity - pressedOpacityDelta);
        }, this);

        buttonNode.on(Node.EventType.TOUCH_END, restoreState, this);
        buttonNode.on(Node.EventType.TOUCH_CANCEL, restoreState, this);
    }

    private setButtonLockedVisual (button: Node | null, enabled: boolean): void {
        if (!button || !button.isValid) {
            return;
        }

        const opacity = button.getComponent(UIOpacity) ?? button.addComponent(UIOpacity);
        opacity.opacity = enabled ? 255 : 120;
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
        if (this._uiFont) {
            label.font = this._uiFont;
        }
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        return label;
    }

    private loadUiFont (): void {
        assetManager.loadAny(FoodTruckPlayableController.UI_FONT_UUID, (error: Error | null, asset: Font) => {
            if (error || !asset || !this.node?.isValid) {
                return;
            }

            this._uiFont = asset;
            this.applyUiFont();
        });
    }

    private applyUiFont (): void {
        if (!this._uiFont) {
            return;
        }

        if (this._overlayRoot?.isValid) {
            this.applyUiFontToNode(this._overlayRoot);
        }
    }

    private applyUiFontToNode (node: Node): void {
        const label = node.getComponent(Label);
        if (label) {
            label.font = this._uiFont;
        }

        for (const child of node.children) {
            this.applyUiFontToNode(child);
        }
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
