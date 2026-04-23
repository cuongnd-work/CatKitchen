import {
    _decorator,
    Animation,
    AnimationClip,
    AudioClip,
    AudioSource,
    Camera,
    Canvas,
    Color,
    Component,
    Font,
    Graphics,
    input,
    Input,
    instantiate,
    Label,
    Layers,
    Node,
    ParticleSystem2D,
    SkeletalAnimation,
    SpriteRenderer,
    Sprite,
    SpriteFrame,
    Tween,
    tween,
    TweenEasing,
    UIOpacity,
    UITransform,
    Vec3,
    Material,
} from 'cc';
import super_html_script from 'db://assets/plugins/playable-foundation/super-html/super_html_script';
import {BillboardToCamera} from './BillboardToCamera';
import {CameraFollow} from './CameraFollow';
import {DefaultOrthographicCamera} from './DefaultOrthographicCamera';
import {OrientationCameraOrthoAdjuster} from './OrientationCameraOrthoAdjuster';
import {UIScreenResolution} from './UIScreenResolution';

let { ccclass, property } = _decorator;

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

@ccclass('LaneUnlockCameraConfig')
class LaneUnlockCameraConfig {
    @property({ type: Vec3, tooltip: 'Camera position to apply for this lane unlock step.' })
    public position: Vec3 = new Vec3(-10.3644, 18.9254, -14.4767);

    @property({ type: Vec3, tooltip: 'Camera rotation (Euler) to apply for this lane unlock step.' })
    public rotation: Vec3 = new Vec3(-43.4321, -148.3135, 0);

    @property({ tooltip: 'Orthographic height to apply for this lane unlock step.', min: 0 })
    public orthoHeight = 10;

    @property({ tooltip: 'Tween duration in seconds for this lane unlock camera step.', min: 0 })
    public tweenDuration = 0.45;
}

@ccclass('FoodTruckPlayableController')
export class FoodTruckPlayableController extends Component {
    private static _activeInstance: FoodTruckPlayableController | null = null;
    private readonly laneCount = 4;
    private readonly baseDispatchCooldown = 2;
    private readonly cooldownReductionPerOpenedLane = 0.5;
    private readonly minimumDispatchCooldown = 0.5;
    private readonly startingCash = 30;
    private readonly scene1Reward = 80;
    private readonly scene2Reward = 80;
    private readonly scene2StartMoney = 220;
    private readonly endingMoneyTarget = 720;
    private readonly scene2MaxConcurrentDispatches = 3;
    private readonly upgradeStepCosts = [25, 100, 200];
    private readonly dispatchCarCost = 0;
    private readonly repairableSloughCount = 4;
    private readonly manualDispatchesToAuto = 20;
    private readonly autoCarsToEnding = 6;
    private readonly handHintIdleDelay = 4;
    private readonly handHintOffset = new Vec3(-70, -86, 0);
    private readonly hornPromptIdleDelay = 4;
    private readonly hornPromptRepeatDelay = 3.2;
    private readonly carPopupInterval = 3.2;
    private readonly carPopupLifetime = 2.8;
    private readonly carPopupOffset = new Vec3(0, 0, 0);
    private readonly carPopupWaveFraction = 0.7;
    private readonly carPopupWaveMin = 5;
    private readonly carPopupWaveMax = 10;
    private readonly carPopupStaggerDelay = 0.22;
    private readonly laneActionParticleLifetime = 0.2;

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
    private _repairedSloughCount = 0;
    private _laneTemplateSpacing = 120;
    private _spawnSerial = 0;

    private _worldRoot: Node | null = null;
    private _overlayRoot: Node | null = null;
    private _foodTruckNode: Node | null = null;
    private _buildingANode: Node | null = null;
    private _buildingAScale = new Vec3(1, 1, 1);
    private _catNode: Node | null = null;
    private _catScale = new Vec3(1, 1, 1);
    private _mainCameraNode: Node | null = null;

    private _phaseLabel: Label | null = null;
    private _moneyLabel: Label | null = null;
    private _moneyIconFrame: SpriteFrame | null = null;
    private _moneyHolderIcon: Sprite | null = null;
    private _removeBarrierCostIcon: Sprite | null = null;
    private _dispatchCostIcon: Sprite | null = null;
    private _openLaneCostIcon: Sprite | null = null;
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
    private _sloughNodes: Node[] = [];
    private _endingProgressRoot: Node | null = null;
    private _endingProgressLabel: Label | null = null;
    private _endingProgressSprite: SpriteRenderer | null = null;
    private _endingProgressMaterial: Material | null = null;
    private _endingGoalAmount = this.endingMoneyTarget;
    private _endingProgressValue = 0;
    private _endingProgressDisplayValue = 0;
    private _endingProgressTweenState = { value: 0 };
    private _uiFont: Font | null = null;
    private _burgerIconFrame: SpriteFrame | null = null;
    private _handHintRoot: Node | null = null;
    private _handHintAnimation: Animation | null = null;
    private _handHintClip: AnimationClip | null = null;
    private _handFrameA: SpriteFrame | null = null;
    private _handFrameB: SpriteFrame | null = null;
    private _handHintReady = false;
    private _handHintTarget: Node | null = null;
    private _engineStartAudio: AudioClip | null = null;
    private _rankupAudio: AudioClip | null = null;
    private _carHornAudio: AudioClip | null = null;
    private _engineAudioSource: AudioSource | null = null;
    private _activeCarPopups = new Map<Node, Node>();
    private _laneActionParticleTemplate: Node | null = null;

    @property(Node)
    public endingSelectionNode: Node | null = null;

    @property(Node)
    public popupTemplateNode: Node | null = null;

    @property(Font)
    public uiFontAsset: Font | null = null;

    @property(SpriteFrame)
    public moneyIconSpriteFrame: SpriteFrame | null = null;

    @property(SpriteFrame)
    public burgerIconSpriteFrame: SpriteFrame | null = null;

    @property(SpriteFrame)
    public handFrameASpriteFrame: SpriteFrame | null = null;

    @property(SpriteFrame)
    public handFrameBSpriteFrame: SpriteFrame | null = null;

    @property({ type: [LaneUnlockCameraConfig], tooltip: 'Camera configs for lane unlock 2, 3, 4.' })
    public laneUnlockCameraConfigs: LaneUnlockCameraConfig[] = [
        new LaneUnlockCameraConfig(),
        new LaneUnlockCameraConfig(),
        new LaneUnlockCameraConfig(),
    ];

    protected onLoad (): void {
        let scene = this.node.scene;
        let canvasController = scene ? this.findCanvasController(scene) : null;
        if (canvasController && canvasController !== this && !this.getComponent(Canvas)) {
            this.enabled = false;
            return;
        }

        if (FoodTruckPlayableController._activeInstance && FoodTruckPlayableController._activeInstance !== this) {
            let preferCurrent = !!this.getComponent(Canvas) && !FoodTruckPlayableController._activeInstance.getComponent(Canvas);
            if (!preferCurrent) {
                this.enabled = false;
                return;
            }

            FoodTruckPlayableController._activeInstance.enabled = false;
        }
        FoodTruckPlayableController._activeInstance = this;
        this.prepareLegacyUiNodes();
        this.loadEngineStartAudio();
        this.loadRankupAudio();
        this.loadCarHornAudio();
        this.bindWorldNodes();
        this.configureMainCamera();
        this.prepareLanesFromWorld();
        this.bindSceneUi();
        this.initializeSceneAssetReferences();
        this.loadHandHint();
        this.refreshUiState();
        this.initializePopupTemplate();
        this.scheduleCarPopups();
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
        this.unschedule(this.showWaitingCarPopups);
        this.clearInactiveCarPopups();
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
        let canvasNode = this.resolveCanvasNode();
        let screenResolution = this.node.getComponentInChildren(UIScreenResolution);
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

        let level = canvasNode.getChildByName('Level');
        if (level) {
            level.active = false;
        }

        let legacyPortraitWidget = canvasNode.getChildByName('Wiget-portait');
        if (legacyPortraitWidget) {
            legacyPortraitWidget.active = false;
        }

        let legacyLandscapeWidget = canvasNode.getChildByName('Wiget-portait-001');
        if (legacyLandscapeWidget) {
            legacyLandscapeWidget.active = false;
        }
    }

    private bindSceneUi (): void {
        let scene = this.node.scene;
        if (!scene) {
            return;
        }

        let canvasNode = this.resolveCanvasNode() ?? this.findNodeByName(scene, 'Canvas-001');
        if (!canvasNode) {
            return;
        }

        this._overlayRoot = this.findNodeByName(canvasNode, 'PlayableHudRoot');
        this._playButton = this.findNodeByName(canvasNode, 'PlayGameButton');
        this._removeBarrierButton = this.findNodeByName(canvasNode, 'RemoveBarrierButton');
        this._dispatchButton = this.findNodeByName(canvasNode, 'DispatchButton');
        this._openLaneButton = this.findNodeByName(canvasNode, 'OpenLaneButton');
        this._serviceProgressNode = this.findNodeByName(canvasNode, 'ServiceProgressOverlay');
        this._upgradePanel = this.findNodeByName(canvasNode, 'UpgradePanel');
        this._storePopup = this.findNodeByName(canvasNode, 'StorePopup');
        this._moneyLabel = this.findNodeByName(canvasNode, 'MoneyLabel')?.getComponent(Label) ?? null;
        this._moneyHolderIcon = this.findNodeByName(canvasNode, 'MoneyHolderIcon')?.getComponent(Sprite) ?? null;
        this._removeBarrierLabel = this.findNodeByName(canvasNode, 'RemoveBarrierButton_Label')?.getComponent(Label) ?? null;
        this._dispatchLabel = this.findNodeByName(canvasNode, 'DispatchButton_Label')?.getComponent(Label) ?? null;
        this._openLaneLabel = this.findNodeByName(canvasNode, 'OpenLaneButton_Label')?.getComponent(Label) ?? null;
        this._removeBarrierCostIcon = this.findNodeByName(canvasNode, 'RemoveBarrierCostIcon')?.getComponent(Sprite) ?? null;
        this._dispatchCostIcon = this.findNodeByName(canvasNode, 'DispatchCostIcon')?.getComponent(Sprite) ?? null;
        this._openLaneCostIcon = this.findNodeByName(canvasNode, 'OpenLaneCostIcon')?.getComponent(Sprite) ?? null;
        this._storeTitleLabel = this.findNodeByName(canvasNode, 'StoreTitleLabel')?.getComponent(Label) ?? null;
        this._serviceProgressGraphics = this._serviceProgressNode?.getComponent(Graphics) ?? null;

        if (this._serviceProgressNode) {
            this._serviceProgressNode.active = false;
        }
        if (this._upgradePanel) {
            this._upgradePanel.active = false;
        }
        if (this._storePopup) {
            this._storePopup.active = false;
        }

        this.bindSceneButton(this._playButton, () => this.onPlayGameClicked());
        this.bindSceneButton(this._removeBarrierButton, () => this.onRemoveBarrierClicked());
        this.bindSceneButton(this._dispatchButton, () => this.onDispatchClicked());
        this.bindSceneButton(this._openLaneButton, () => this.onRepairSloughClicked());
        this.bindSceneButton(this.findNodeByName(canvasNode, 'RamenOption'), () => this.onEndingOptionClicked('Ramen'));
        this.bindSceneButton(this.findNodeByName(canvasNode, 'HotDogOption'), () => this.onEndingOptionClicked('Hot Dog'));
        this.bindSceneButton(this.findNodeByName(canvasNode, 'HamburgerOption'), () => this.onEndingOptionClicked('Hamburger'));
        this.bindSceneButton(this.findNodeByName(canvasNode, 'StoreGoButton'), () => this.onStoreConfirmClicked());
        this.bindSceneButton(this.findNodeByName(canvasNode, 'StoreCloseButton'), () => {
            if (this._storePopup) {
                this._storePopup.active = false;
            }
        });
    }

    private initializeSceneAssetReferences (): void {
        this._uiFont = this.uiFontAsset;
        this._moneyIconFrame = this.moneyIconSpriteFrame;
        this._burgerIconFrame = this.burgerIconSpriteFrame;
        this._handFrameA = this.handFrameASpriteFrame;
        this._handFrameB = this.handFrameBSpriteFrame;
        this.applyMoneyIconFrame(this._moneyHolderIcon);
        this.applyMoneyIconFrame(this._removeBarrierCostIcon);
        this.applyMoneyIconFrame(this._dispatchCostIcon);
        this.applyMoneyIconFrame(this._openLaneCostIcon);
        this.applyUiFont();
    }

    private bindSceneButton (buttonNode: Node | null, onClick: () => void): void {
        if (!buttonNode || !buttonNode.isValid) {
            return;
        }

        let boundKey = '__foodTruckBound';
        let feedbackKey = '__foodTruckPressFeedbackBound';
        if (!(buttonNode as Node & Record<string, unknown>)[feedbackKey]) {
            this.attachButtonPressFeedback(buttonNode);
            (buttonNode as Node & Record<string, unknown>)[feedbackKey] = true;
        }
        if ((buttonNode as Node & Record<string, unknown>)[boundKey]) {
            return;
        }

        buttonNode.on(Node.EventType.TOUCH_END, onClick, this);
        (buttonNode as Node & Record<string, unknown>)[boundKey] = true;
    }

    private bindWorldNodes (): void {
        let scene = this.node.scene;
        if (!scene) {
            return;
        }

        let worldContainer = scene.getChildByName('Eviroments') ?? scene.getChildByName('Eviroment');
        let worldRoot = worldContainer?.getChildByName('FoodWorld')
            ?? scene.getChildByName('Car')
            ?? this.findNodeByName(scene, 'FoodWorld')
            ?? this.findNodeByName(scene, 'Car');
        if (worldRoot) {
            this._worldRoot = worldRoot;
        }

        this._foodTruckNode = this._worldRoot?.getChildByName('F11')
            ?? this.findNodeByName(scene, 'F11')
            ?? this.findNodeByName(scene, 'shop_Optimized');
        this._buildingANode = this.findNodeByName(scene, 'building_A');
        this._catNode = this._worldRoot?.getChildByName('Rig_Cat_02') ?? this.findNodeByName(scene, 'Rig_Cat_02');
        this._endingProgressRoot = this.findNodeByName(scene, 'P3');
        this._endingProgressLabel = this._endingProgressRoot?.getChildByName('Label')?.getComponent(Label) ?? null;
        this._endingProgressSprite = this._endingProgressRoot?.getChildByName('SpriteRenderer-001')?.getComponent(SpriteRenderer) ?? null;

        if (this._buildingANode) {
            this._buildingAScale.set(this._buildingANode.scale.x, this._buildingANode.scale.y, this._buildingANode.scale.z);
        }
        if (this._catNode) {
            this._catScale.set(this._catNode.scale.x, this._catNode.scale.y, this._catNode.scale.z);
        }

        this._sloughNodes = Array.from({ length: this.repairableSloughCount }, (_, index) => {
            let sloughName = `slough${index + 1}`;
            return this._worldRoot?.getChildByName(sloughName)
                ?? this.findNodeByName(scene, sloughName);
        }).filter((node): node is Node => !!node);
        if (this._sloughNodes[0]?.isValid) {
            this._sloughNodes[0].active = false;
            this._repairedSloughCount = Math.max(this._repairedSloughCount, 1);
        }
        this._laneActionParticleTemplate = this.findNodeByName(scene, 'Particle2D');
        if (this._laneActionParticleTemplate?.isValid) {
            this._laneActionParticleTemplate.active = false;
        }

        this.initializeEndingProgress();
    }

    private configureMainCamera (): void {
        let scene = this.node.scene;
        if (!scene) {
            return;
        }

        let mainCameraNode = scene.getChildByName('Main Camera');
        if (!mainCameraNode) {
            return;
        }

        this._mainCameraNode = mainCameraNode;

        let follow = mainCameraNode.getComponent(CameraFollow);
        if (follow) {
            follow.enabled = false;
        }

        let orthoAdjuster = mainCameraNode.getComponent(OrientationCameraOrthoAdjuster);
        if (orthoAdjuster) {
            orthoAdjuster.enabled = false;
        }

        let defaultOrthographicCamera = mainCameraNode.getComponent(DefaultOrthographicCamera);
        let camera = mainCameraNode.getComponent(Camera);
        if (camera) {
            if (defaultOrthographicCamera) {
                camera.projection = Camera.ProjectionType.ORTHO;
                camera.orthoHeight = Math.max(0, defaultOrthographicCamera.orthoHeight);
            } else {
                camera.projection = Camera.ProjectionType.PERSPECTIVE;
                camera.fov = 45;
            }
            camera.near = 1;
            camera.far = 1000;
            camera.visibility = Layers.Enum.DEFAULT;
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

        let laneRoots = this._worldRoot.children
            .filter((child) => child.active && /^Land\d+$/i.test(child.name))
            .sort((a, b) => b.position.x - a.position.x);

        if (laneRoots.length > 0) {
            laneRoots.slice(0, this.laneCount).forEach((laneRoot, index) => {
                let landId = this.parseLandId(laneRoot.name, index + 1);
                let laneCars = laneRoot.children
                    .filter((child) => child.active && child.name.startsWith('Car'))
                    .sort((a, b) => a.position.z - b.position.z);

                if (laneCars.length === 0) {
                    return;
                }

                let firstWorld = laneCars[0].getWorldPosition(new Vec3());
                let firstLocal = this._worldRoot!.inverseTransformPoint(new Vec3(), firstWorld);
                let spacing = this.estimateLaneDepthSpacing(laneCars);
                this._laneTemplateSpacing = spacing;

                let queueSlots = laneCars.map((laneCar) => {
                    let worldPos = laneCar.getWorldPosition(new Vec3());
                    return this._worldRoot!.inverseTransformPoint(new Vec3(), worldPos);
                });

                laneCars.forEach((laneCar) => {
                    laneCar.setParent(this._worldRoot!, true);
                });

                let targetQueueSize = Math.max(8, queueSlots.length);
                while (queueSlots.length < targetQueueSize) {
                    let slotIndex = queueSlots.length;
                    let z = queueSlots[0].z + slotIndex * spacing;
                    queueSlots.push(new Vec3(firstLocal.x, firstLocal.y, z));
                }

                let templateSource = laneCars[laneCars.length - 1];
                let templateCar = instantiate(templateSource);
                templateCar.active = false;
                templateCar.name = `LaneTemplate_${index + 1}`;
                this._worldRoot!.addChild(templateCar);
                let templateWorld = templateSource.getWorldPosition(new Vec3());
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

        let carNodes = this._worldRoot.children.filter((child) => child.active && child.name.startsWith('car_'));
        let laneBuckets = new Map<number, Node[]>();

        for (let carNode of carNodes) {
            let laneKey = Math.round(carNode.position.x);
            let bucket = laneBuckets.get(laneKey);
            if (bucket) {
                bucket.push(carNode);
            } else {
                laneBuckets.set(laneKey, [carNode]);
            }
        }

        let laneKeys = Array.from(laneBuckets.keys()).sort((a, b) => a - b).slice(0, this.laneCount);
        for (let i = 0; i < laneKeys.length; i++) {
            let laneX = laneKeys[i];
            let laneCars = (laneBuckets.get(laneX) ?? []).sort((a, b) => a.position.y - b.position.y);
            if (laneCars.length === 0) {
                continue;
            }

            let spacing = this.estimateLaneSpacing(laneCars);
            this._laneTemplateSpacing = spacing;

            let queueSlots: Vec3[] = [];
            for (let laneCar of laneCars) {
                queueSlots.push(new Vec3(laneCar.position.x, laneCar.position.y, laneCar.position.z));
            }

            let targetQueueSize = Math.max(8, queueSlots.length);
            while (queueSlots.length < targetQueueSize) {
                let slotIndex = queueSlots.length;
                let y = queueSlots[0].y + slotIndex * spacing;
                queueSlots.push(new Vec3(laneX, y, queueSlots[0].z));
            }

            let templateSource = laneCars[laneCars.length - 1];
            let templateCar = instantiate(templateSource);
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

        let avg = count > 0 ? sum / count : this._laneTemplateSpacing;
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

        let avg = count > 0 ? sum / count : this._laneTemplateSpacing;
        return Math.max(30, avg);
    }

    private buildLaneBarrier (lane: LaneData): void {
        if (!this._worldRoot) {
            return;
        }

        let scene = this.node.scene;
        let existingBarriers = scene
            ? scene.children
                .flatMap((child) => child.name === 'Eviroment' || child.name === 'Eviroments' ? child.children : [])
                .filter((child) => child.name.startsWith('Wood_Road_Block_XSmall'))
                .sort((a, b) => b.position.x - a.position.x)
            : [];

        let existingBarrier = existingBarriers[lane.index] ?? null;
        if (existingBarrier) {
            existingBarrier.active = true;
            lane.barrier = existingBarrier;
            return;
        }

        let templateBarrier = existingBarriers[0]
            ?? this._worldRoot.getChildByName('Wood_Road_Block_XSmall')
            ?? (scene ? this.findNodeByName(scene, 'Wood_Road_Block_XSmall') : null);
        if (!templateBarrier) {
            return;
        }

        let barrier = instantiate(templateBarrier);
        barrier.name = `Wood_Road_Block_XSmall_${lane.index + 1}`;
        (templateBarrier.parent ?? this._worldRoot).addChild(barrier);
        barrier.setPosition(lane.x, templateBarrier.position.y, templateBarrier.position.z);
        barrier.setScale(templateBarrier.scale);
        barrier.setRotation(templateBarrier.rotation);
        barrier.active = true;
        lane.barrier = barrier;
    }

    private onPlayGameClicked (): void {
        this.trackFirstClick();
        super_html_script.on_click_game_end();
        super_html_script.on_click_download();
    }

    private onRemoveBarrierClicked (): void {
        this.trackFirstClick();
        const cost = this.getRemoveBarrierCost();
        if (!this.canOpenNextRoute() || !this.trySpendMoney(cost)) {
            return;
        }

        this.playRankupAudio();
        this.openNextLane();
        this.stopRemoveBarrierPulse();
        this.refreshUiState();
    }

    private onDispatchClicked (): void {
        this.trackFirstClick();
        if (this._phase === 'scene1' && this._openedLanes === 0) {
            this.refreshUiState();
            return;
        }
        if (this._phase === 'scene1') {
            this._manualDispatchCount++;
        }
        if (!this.trySpendMoney(this.dispatchCarCost)) {
            if (this._phase === 'scene1') {
                this._manualDispatchCount = Math.max(0, this._manualDispatchCount - 1);
            }
            return;
        }

        let dispatched = this.tryDispatchCar(true);
        if (!dispatched) {
            this.addMoney(this.dispatchCarCost);
            if (this._phase === 'scene1') {
                this._manualDispatchCount = Math.max(0, this._manualDispatchCount - 1);
            }
            return;
        }

        this.playRankupAudio();
        this.tryEnterScene2();
    }

    private onRepairSloughClicked (): void {
        this.trackFirstClick();
        const cost = this.getOpenLaneCost();
        if (!this.canRepairNextSlough() || !this.trySpendMoney(cost)) {
            return;
        }

        this.repairNextSlough();
        this.applyLaneUnlockCameraConfig(this._repairedSloughCount);
        this.playRankupAudio();
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

        let lane = this.pickLaneForDispatch();
        if (!lane || lane.queueCars.length === 0 || !this._worldRoot) {
            return false;
        }

        let car = lane.queueCars.shift();
        if (!car) {
            return false;
        }

        lane.activeDispatches++;
        this._activeDispatchCount++;
        this._nextDispatchTime = this._elapsed + this.getDispatchCooldown();
        this.destroyActivePopupForCar(car);
        this.shiftLaneQueue(lane);
        this.animateCarFlow(lane, car);
        this.refreshDispatchButtonLabel();
        return true;
    }

    private pickLaneForDispatch (): LaneData | null {
        let laneTotal = this.getLaneTotal();
        let openLanes = this._lanes.filter((lane) => lane.open && lane.queueCars.length > 0 && lane.activeDispatches === 0);
        if (openLanes.length === 0) {
            return null;
        }

        for (let step = 1; step <= laneTotal; step++) {
            let candidateIndex = (this._lastLaneIndex + step + laneTotal) % laneTotal;
            let lane = this._lanes[candidateIndex];
            if (lane && lane.open && lane.queueCars.length > 0 && lane.activeDispatches === 0) {
                this._lastLaneIndex = candidateIndex;
                return lane;
            }
        }

        return openLanes[0];
    }

    private animateCarFlow (lane: LaneData, car: Node): void {
        let frontSlot = lane.queueSlots[0] ?? car.position.clone();
        let route = this.getLaneRouteTargets(lane, frontSlot);
        let drivePath = this.buildDrivePath(lane, car.position.clone(), route.sPoint, route.rPoint);
        let serviceCompleted = false;

        Tween.stopAllByTarget(car);
        this.playEngineStartAudio();
        let sequence = tween(car);
        for (let i = 0; i < drivePath.length; i++) {
            let section = drivePath[i];
            sequence = sequence.then(this.tweenCarAlongPoints(car, section.points, section.speed, section.minSegmentDuration));
            if (section.pauseAfter > 0) {
                sequence = sequence.call(() => {
                    this.destroyActivePopupForCar(car);
                    this.playCatCookingAnim();
                    this.playServiceProgress(lane, car, section.pauseAfter);
                }).delay(section.pauseAfter)
                    .call(() => {
                        if (serviceCompleted) {
                            return;
                        }

                        serviceCompleted = true;
                        this.onCarServed(lane);
                    });
            }
        }

        sequence
            .call(() => {
                this.recycleCarToLane(lane, car);
                if (!serviceCompleted) {
                    this.onCarServed(lane);
                }
            })
            .start();
    }

    private onCarServed (lane: LaneData): void {
        lane.activeDispatches = Math.max(0, lane.activeDispatches - 1);
        this._activeDispatchCount = Math.max(0, this._activeDispatchCount - 1);
        this._carsServed++;
        let rewardAmount = this._phase === 'scene1' ? this.scene1Reward : this.scene2Reward;
        this.addMoney(rewardAmount);
        this.playBuildingRewardFeedback(rewardAmount);

        if (this._phase === 'scene1') {
            return;
        }

        if (this._phase === 'scene2') {
            this._autoCarsServed++;
            this.fillOpenLaneQueues();
        }
    }

    private enterScene2 (): void {
        if (this._phase !== 'scene1') {
            return;
        }

        this.completeAllSloughRepairs();
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
        if (this._phase === 'scene1' && this._openedLanes >= this.getMaxOpenableLanesFromRepairs()) {
            return;
        }

        let nextLane = this._lanes.find((lane) => !lane.open);
        if (!nextLane) {
            return;
        }

        nextLane.open = true;
        if (nextLane.barrier) {
            this.spawnLaneActionParticle(nextLane.barrier);
            nextLane.barrier.active = false;
        }
        this._openedLanes++;
        this.tryEnterScene2();
    }

    private applyLaneUnlockCameraConfig (unlockCount: number): void {
        if (unlockCount < 2 || !this._mainCameraNode?.isValid) {
            return;
        }

        let configIndex = Math.min(unlockCount - 2, this.laneUnlockCameraConfigs.length - 1);
        let config = this.laneUnlockCameraConfigs[configIndex];
        if (!config) {
            return;
        }

        const duration = Math.max(0, config.tweenDuration);
        Tween.stopAllByTarget(this._mainCameraNode);
        if (duration <= 0) {
            this._mainCameraNode.setPosition(
                config.position.x,
                config.position.y,
                config.position.z,
            );
            this._mainCameraNode.setRotationFromEuler(
                config.rotation.x,
                config.rotation.y,
                config.rotation.z,
            );
        } else {
            tween(this._mainCameraNode)
                .to(duration, {
                    position: new Vec3(config.position.x, config.position.y, config.position.z),
                    eulerAngles: new Vec3(config.rotation.x, config.rotation.y, config.rotation.z),
                }, { easing: 'sineInOut' })
                .start();
        }

        let camera = this._mainCameraNode.getComponent(Camera);
        if (!camera) {
            return;
        }

        const targetOrthoHeight = Math.max(0, config.orthoHeight);
        if (duration <= 0) {
            camera.orthoHeight = targetOrthoHeight;
            return;
        }

        const orthoTweenState = { value: camera.orthoHeight };
        tween(orthoTweenState)
            .to(duration, { value: targetOrthoHeight }, {
                easing: 'sineInOut',
                onUpdate: () => {
                    if (camera.node?.isValid) {
                        camera.orthoHeight = orthoTweenState.value;
                    }
                },
            })
            .start();
    }

    private canRepairNextSlough (): boolean {
        return this._phase === 'scene1'
            && this._repairedSloughCount < this.repairableSloughCount;
    }

    private canOpenNextRoute (): boolean {
        return this._phase === 'scene1'
            && this._openedLanes < this.getMaxOpenableLanesFromRepairs();
    }

    private hasUnlockedOpenLaneButton (): boolean {
        return this._phase === 'scene1'
            && (this._manualDispatchCount >= 2 || this._repairedSloughCount > 1);
    }

    private getMaxOpenableLanesFromRepairs (): number {
        return Math.min(this.getLaneTotal(), this._repairedSloughCount);
    }

    private initializeEndingProgress (): void {
        let parsedGoal = this._endingProgressLabel ? Number.parseInt(this._endingProgressLabel.string, 10) : Number.NaN;
        if (Number.isFinite(parsedGoal) && parsedGoal > 0) {
            this._endingGoalAmount = parsedGoal;
        }

        this._endingProgressValue = 0;
        this._endingProgressDisplayValue = 0;
        this._endingProgressTweenState.value = 0;
        this.updateEndingProgressUi(true);
    }

    private initializePopupTemplate (): void {
        if (this.popupTemplateNode?.isValid) {
            this.popupTemplateNode.active = false;
        }
    }

    private scheduleCarPopups (): void {
        this.unschedule(this.showWaitingCarPopups);
        this.schedule(this.showWaitingCarPopups, this.carPopupInterval);
        this.showWaitingCarPopups();
    }

    private showWaitingCarPopups = (): void => {
        if (!this.popupTemplateNode?.isValid || this._phase === 'ending') {
            return;
        }

        let waitingCars = this._lanes
            .flatMap((lane) => lane.queueCars)
            .filter((car) => car && car.isValid);
        if (waitingCars.length === 0) {
            this.clearInactiveCarPopups();
            return;
        }

        let shuffledCars = waitingCars.slice();
        for (let i = shuffledCars.length - 1; i > 0; i--) {
            let j = Math.floor(Math.random() * (i + 1));
            let temp = shuffledCars[i];
            shuffledCars[i] = shuffledCars[j];
            shuffledCars[j] = temp;
        }

        let targetCount = Math.ceil(waitingCars.length * this.carPopupWaveFraction);
        targetCount = Math.max(this.carPopupWaveMin, targetCount);
        targetCount = Math.min(targetCount, this.carPopupWaveMax, waitingCars.length);

        let selectedCars = shuffledCars.slice(0, targetCount);
        let activeCars = new Set<Node>(selectedCars);

        for (let [car, popup] of this._activeCarPopups) {
            if (!car?.isValid || !popup?.isValid || !activeCars.has(car) || !this.isWaitingQueueCar(car)) {
                this.clearActivePopupForCar(car, popup);
                if (popup?.isValid) {
                    popup.destroy();
                }
            }
        }

        for (let i = 0; i < selectedCars.length; i++) {
            let car = selectedCars[i];
            if (!car || this._activeCarPopups.has(car)) {
                continue;
            }
            this.scheduleOnce(() => {
                if (car?.isValid && !this._activeCarPopups.has(car)) {
                    this.spawnPopupForCar(car);
                }
            }, i * this.carPopupStaggerDelay);
        }
    };

    private clearInactiveCarPopups (): void {
        for (let [car, popup] of this._activeCarPopups) {
            this.clearActivePopupForCar(car, popup);
            if (popup?.isValid) {
                popup.destroy();
            }
        }
    }

    private clearActivePopupForCar (car: Node, popup: Node): void {
        let activePopup = this._activeCarPopups.get(car);
        if (activePopup === popup) {
            this._activeCarPopups.delete(car);
        }
    }

    private destroyActivePopupForCar (car: Node | null): void {
        if (!car?.isValid) {
            return;
        }

        let popup = this._activeCarPopups.get(car);
        if (!popup) {
            return;
        }

        this.clearActivePopupForCar(car, popup);
        if (popup.isValid) {
            popup.destroy();
        }
    }

    private spawnPopupForCar (car: Node): void {
        if (!this.popupTemplateNode?.isValid || !car?.isValid || !this._worldRoot?.isValid || this._activeCarPopups.has(car) || !this.isWaitingQueueCar(car)) {
            return;
        }

        let popup = instantiate(this.popupTemplateNode);
        popup.active = true;
        this._worldRoot.addChild(popup);
        let worldPosition = car.getWorldPosition(new Vec3());
        popup.setWorldPosition(
            worldPosition.x + this.carPopupOffset.x,
            worldPosition.y + this.carPopupOffset.y,
            worldPosition.z + this.carPopupOffset.z,
        );
        popup.setRotationFromEuler(0, 0, 0);
        popup.setScale(1, 1, 1);
        this.attachBillboardsToPopup(popup);
        this._activeCarPopups.set(car, popup);

        this.scheduleOnce(() => {
            this.clearActivePopupForCar(car, popup);
            if (popup.isValid) {
                popup.destroy();
            }
        }, this.carPopupLifetime);
    }

    private isWaitingQueueCar (car: Node | null): boolean {
        if (!car?.isValid) {
            return false;
        }

        return this._lanes.some((lane) => lane.queueCars.includes(car));
    }

    private attachBillboardsToPopup (popup: Node): void {
        this.ensurePopupBillboard(popup, false);
    }

    private ensurePopupBillboard (node: Node, yawOnly: boolean): void {
        let billboard = node.getComponent(BillboardToCamera) ?? node.addComponent(BillboardToCamera);
        billboard.yawOnly = yawOnly;
        billboard.targetCamera = this._mainCameraNode?.getComponent(Camera) ?? null;
    }


    private ensureEndingProgressMaterial (): Material | null {
        if (!this._endingProgressSprite) {
            return null;
        }

        if (!this._endingProgressMaterial) {
            this._endingProgressMaterial = this._endingProgressSprite.getMaterialInstance(0);
        }

        return this._endingProgressMaterial;
    }

    private addEndingProgress (amount: number): void {
        if (amount <= 0 || this._endingGoalAmount <= 0) {
            return;
        }

        this._endingProgressValue = Math.min(this._endingGoalAmount, this._endingProgressValue + amount);
        this.animateEndingProgressUi();

        if (this._phase === 'scene2' && this._endingProgressValue >= this._endingGoalAmount) {
            this.enterEnding();
        }
    }

    private animateEndingProgressUi (): void {
        Tween.stopAllByTarget(this._endingProgressTweenState);
        this._endingProgressTweenState.value = this._endingProgressDisplayValue;
        tween(this._endingProgressTweenState)
            .to(0.35, { value: this._endingProgressValue }, {
                easing: 'sineOut',
                onUpdate: () => {
                    this._endingProgressDisplayValue = this._endingProgressTweenState.value;
                    this.updateEndingProgressUi();
                },
            })
            .start();
    }

    private updateEndingProgressUi (instant = false): void {
        if (instant) {
            this._endingProgressDisplayValue = this._endingProgressValue;
        }

        let material = this.ensureEndingProgressMaterial();
        if (material) {
            let ratio = this._endingGoalAmount > 0
                ? Math.max(0, Math.min(1, this._endingProgressDisplayValue / this._endingGoalAmount))
                : 0;
            material.setProperty('fillAmount', ratio);
        }

        if (this._endingProgressLabel) {
            let remaining = Math.max(0, Math.ceil(this._endingGoalAmount - this._endingProgressDisplayValue));
            this._endingProgressLabel.string = `${remaining}`;
        }
    }

    private playBuildingRewardFeedback (amount: number): void {
        this.playBuildingPunchScale();
        this.showRewardToast(amount);
    }

    private playBuildingPunchScale (): void {
        if (!this._buildingANode?.isValid) {
            return;
        }

        Tween.stopAllByTarget(this._buildingANode);
        this._buildingANode.setScale(this._buildingAScale.x, this._buildingAScale.y, this._buildingAScale.z);

        let bigger = new Vec3(
            this._buildingAScale.x * 1.08,
            this._buildingAScale.y * 1.08,
            this._buildingAScale.z * 1.08,
        );
        tween(this._buildingANode)
            .to(0.14, { scale: bigger }, { easing: 'sineOut' })
            .to(0.18, { scale: this._buildingAScale }, { easing: 'sineIn' })
            .start();
    }

    private showRewardToast (amount: number): void {
        if (!this._overlayRoot?.isValid || amount <= 0) {
            return;
        }

        let toast = new Node(`MoneyToast_${Date.now()}`);
        toast.layer = Layers.Enum.UI_2D;
        this._overlayRoot.addChild(toast);
        toast.addComponent(UITransform).setContentSize(320, 110);

        let opacity = toast.addComponent(UIOpacity);
        opacity.opacity = 0;

        let label = toast.addComponent(Label);
        label.string = `+${Math.floor(amount)}`;
        label.fontSize = 62;
        label.lineHeight = 62;
        label.color = new Color(255, 219, 77, 255);
        label.enableOutline = true;
        label.outlineColor = new Color(92, 56, 8, 255);
        label.outlineWidth = 4;
        if (this._uiFont) {
            label.font = this._uiFont;
        }

        let startPosition = this.getRewardToastUiPosition();
        toast.setPosition(startPosition.x, startPosition.y, 0);
        toast.setScale(1.08, 1.08, 1);

        tween(opacity)
            .to(0.08, { opacity: 255 })
            .delay(0.28)
            .to(0.2, { opacity: 0 })
            .call(() => toast.destroy())
            .start();

        tween(toast)
            .to(0.18, {
                scale: new Vec3(1.2, 1.2, 1),
                position: new Vec3(startPosition.x, startPosition.y + 32, 0),
            }, { easing: 'sineOut' })
            .to(0.3, {
                scale: new Vec3(1.08, 1.08, 1),
                position: new Vec3(startPosition.x, startPosition.y + 72, 0),
            }, { easing: 'quadOut' })
            .start();
    }

    private getRewardToastUiPosition (): Vec3 {
        if (!this._overlayRoot?.isValid) {
            return new Vec3();
        }

        let building = this._buildingANode;
        let camera = this._mainCameraNode?.getComponent(Camera);
        if (!building?.isValid || !camera) {
            return new Vec3(0, 140, 0);
        }

        let worldPosition = building.getWorldPosition(new Vec3());
        worldPosition.y += 2.6;

        let uiPosition = new Vec3();
        camera.convertToUINode(worldPosition, this._overlayRoot, uiPosition);
        return new Vec3(uiPosition.x + 200, uiPosition.y - 100, 0);
    }

    private repairNextSlough (): void {
        let sloughNode = this._sloughNodes[this._repairedSloughCount] ?? null;
        if (sloughNode?.isValid) {
            this.spawnLaneActionParticle(sloughNode);
            sloughNode.active = false;
        }

        this._repairedSloughCount = Math.min(this.repairableSloughCount, this._repairedSloughCount + 1);
    }

    private spawnLaneActionParticle (targetNode: Node | null): void {
        if (!targetNode?.isValid || !this._laneActionParticleTemplate?.isValid) {
            return;
        }

        let particleNode = instantiate(this._laneActionParticleTemplate);
        let parent = this._laneActionParticleTemplate.parent;
        if (!parent?.isValid) {
            particleNode.destroy();
            return;
        }

        parent.addChild(particleNode);
        particleNode.active = true;
        let worldPosition = targetNode.getWorldPosition(new Vec3());
        let camera = this._mainCameraNode?.getComponent(Camera) ?? null;
        if (camera) {
            let uiPosition = new Vec3();
            camera.convertToUINode(worldPosition, parent, uiPosition);
            particleNode.setPosition(uiPosition);
        } else {
            particleNode.setWorldPosition(worldPosition);
        }
        particleNode.setRotation(this._laneActionParticleTemplate.rotation);
        particleNode.setScale(this._laneActionParticleTemplate.scale);

        const particleSystems = particleNode.getComponentsInChildren(ParticleSystem2D);
        for (const particleSystem of particleSystems) {
            particleSystem.stopSystem();
            particleSystem.resetSystem();
        }

        this.scheduleOnce(() => {
            if (particleNode.isValid) {
                particleNode.destroy();
            }
        }, this.laneActionParticleLifetime);
    }

    private completeAllSloughRepairs (): void {
        for (let sloughNode of this._sloughNodes) {
            if (sloughNode?.isValid) {
                sloughNode.active = false;
            }
        }

        this._repairedSloughCount = Math.max(this._repairedSloughCount, this.repairableSloughCount);
    }

    private tryEnterScene2 (): void {
        if (this._phase !== 'scene1') {
            return;
        }

        let openedAllLanes = this._openedLanes >= this.getLaneTotal();
        let reachedManualDispatchTarget = this._manualDispatchCount >= this.manualDispatchesToAuto;
        if (!openedAllLanes && !reachedManualDispatchTarget) {
            return;
        }

        this.enterScene2();
    }

    @property(AnimationClip)
    public clipAsset:AnimationClip  = null;

    private loadHandHint (): void {
        // assetManager.loadAny(FoodTruckPlayableController.HAND_CLIP_UUID, (clipError: Error | null, clipAsset: AnimationClip) => {
        //     if (clipError || !clipAsset || !this.node?.isValid) {
        //         return;
        //     }
        //
        //     this._handHintClip = clipAsset;
        //     this.tryCreateHandHint();
        // });

            this._handHintClip = this.clipAsset;
            this.tryCreateHandHint();
    }

    @property(AudioClip)
    public clip:AudioClip  = null;

    private loadEngineStartAudio (): void {
        // assetManager.loadAny(FoodTruckPlayableController.ENGINE_START_AUDIO_UUID, (error: Error | null, clip: AudioClip) => {
        //     if (error || !clip || !this.node?.isValid) {
        //         return;
        //     }
        //
        //     this._engineStartAudio = clip;
        // });

        this._engineStartAudio = this.clip;
    }

    @property(AudioClip)
    public rankUpclip:AudioClip  = null;

    private loadRankupAudio (): void {
        // assetManager.loadAny(FoodTruckPlayableController.RANKUP_AUDIO_UUID, (error: Error | null, clip: AudioClip) => {
        //     if (error || !clip || !this.node?.isValid) {
        //         return;
        //     }
        //
        //     this._rankupAudio = clip;
        // });

            this._rankupAudio = this.rankUpclip;
    }

    @property(AudioClip)
    public r1ankUpclip:AudioClip  = null;

    private loadCarHornAudio (): void {
        // assetManager.loadAny(FoodTruckPlayableController.CAR_HORN_AUDIO_UUID, (error: Error | null, clip: AudioClip) => {
        //     if (error || !clip || !this.node?.isValid) {
        //         return;
        //     }
        //
        //     this._carHornAudio = clip;
        //     this.refreshHornPrompt();
        // });

            this._carHornAudio = this.r1ankUpclip;
            this.refreshHornPrompt();
    }

    private playEngineStartAudio (): void {
        if (!this._engineStartAudio || !this.node?.isValid) {
            return;
        }

        let source = this._engineAudioSource ?? this.node.getComponent(AudioSource) ?? this.node.addComponent(AudioSource);
        this._engineAudioSource = source;
        source.playOneShot(this._engineStartAudio, 1);
    }

    private playRankupAudio (): void {
        if (!this._rankupAudio || !this.node?.isValid) {
            return;
        }

        let source = this._engineAudioSource ?? this.node.getComponent(AudioSource) ?? this.node.addComponent(AudioSource);
        this._engineAudioSource = source;
        source.playOneShot(this._rankupAudio, 0.9);
    }

    private playHornPromptIfNeeded = (): void => {
        if (!this.shouldPromptDispatchHorn() || !this._carHornAudio || !this.node?.isValid) {
            this.refreshHornPrompt();
            return;
        }

        let source = this._engineAudioSource ?? this.node.getComponent(AudioSource) ?? this.node.addComponent(AudioSource);
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

    private applyMoneyIconFrame (sprite: Sprite | null): void {
        if (!sprite || !sprite.isValid || !this._moneyIconFrame) {
            return;
        }

        sprite.spriteFrame = this._moneyIconFrame;
    }

    private tryCreateHandHint (): void {
        if (this._handHintReady || !this._overlayRoot?.isValid || !this._handHintClip || !this._handFrameA || !this._handFrameB) {
            return;
        }

        let root = new Node('HandHint');
        this._overlayRoot.addChild(root);
        root.layer = Layers.Enum.UI_2D;
        root.addComponent(UITransform).setContentSize(180, 190);
        root.setScale(0.6, 0.6, 1);
        root.active = false;

        let frameA = this.createHandFrameNode(root, 'tile000', this._handFrameA);
        frameA.active = true;
        let frameB = this.createHandFrameNode(root, 'tile001', this._handFrameB);
        frameB.active = false;

        let animation = root.addComponent(Animation);
        animation.defaultClip = this._handHintClip;
        animation.playOnLoad = false;
        animation.addClip(this._handHintClip, this._handHintClip.name);

        this._handHintRoot = root;
        this._handHintAnimation = animation;
        this._handHintReady = true;
        this.showHandHintForCurrentTarget();
    }

    private createHandFrameNode (parent: Node, name: string, frame: SpriteFrame): Node {
        let node = new Node(name);
        parent.addChild(node);
        node.layer = Layers.Enum.UI_2D;
        node.addComponent(UITransform).setContentSize(180, 190);
        let sprite = node.addComponent(Sprite);
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

        let target = this.getPreferredHandHintTarget();
        if (!target) {
            this.hideHandHint();
            return;
        }

        this._handHintTarget = target;
        let handScale = this._handHintRoot.getScale();
        let targetPosition = target.position.clone().add(new Vec3(
            this.handHintOffset.x * handScale.x,
            this.handHintOffset.y * handScale.y,
            this.handHintOffset.z,
        ));
        this._handHintRoot.setPosition(targetPosition.x + 145.9, targetPosition.y, targetPosition.z);
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
        let candidates = [
            this._removeBarrierButton,
            this._dispatchButton,
            this._openLaneButton,
        ];

        for (let button of candidates) {
            if (!button || !button.isValid || !button.activeInHierarchy) {
                continue;
            }

            if (button === this._removeBarrierButton && !this.canOpenNextRoute()) {
                continue;
            }

            if (button === this._dispatchButton && !this.canDispatchMoreCars(true)) {
                continue;
            }

            if (button === this._openLaneButton && !this.canRepairNextSlough()) {
                continue;
            }

            return button;
        }

        return null;
    }

    private getDispatchCooldown (): number {
        let reduction = this._openedLanes * this.cooldownReductionPerOpenedLane;
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

    private getUpgradeStepCost (purchaseCount: number): number {
        const index = Math.max(0, Math.min(purchaseCount, this.upgradeStepCosts.length - 1));
        return this.upgradeStepCosts[index];
    }

    private getRemoveBarrierCost (): number {
        return this.getUpgradeStepCost(this._openedLanes);
    }

    private getOpenLaneCost (): number {
        return this.getUpgradeStepCost(this._repairedSloughCount);
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
        this.animateMoneyLabel(true);
        return true;
    }

    private refreshUiState (): void {
        const removeBarrierCost = this.getRemoveBarrierCost();
        const openLaneCost = this.getOpenLaneCost();
        let removeBarrierFull = this._openedLanes >= this.getLaneTotal();
        let openLaneFull = this._repairedSloughCount >= this.repairableSloughCount;
        let repairVisible = this._phase === 'scene1';
        let removeBarrierVisible = this._phase !== 'ending' && (this._phase === 'scene1' || removeBarrierFull);
        let dispatchVisible = this._phase === 'scene2' || (this._phase === 'scene1' && this._openedLanes > 0);
        let openLaneVisible = this._phase !== 'ending' && (this.hasUnlockedOpenLaneButton() || openLaneFull);
        let canRepair = this.canRepairNextSlough() && this.canAfford(openLaneCost);
        let canOpenRoute = this.canOpenNextRoute() && this.canAfford(removeBarrierCost);
        let canDispatch = this._phase !== 'ending'
            && this._openedLanes > 0;

        if (this._removeBarrierButton) {
            this._removeBarrierButton.active = removeBarrierVisible;
        }
        if (this._removeBarrierLabel) {
            this._removeBarrierLabel.string = removeBarrierFull
                ? 'Full'
                : `${removeBarrierCost}`;
        }
        if (this._removeBarrierCostIcon?.node) {
            this._removeBarrierCostIcon.node.active = removeBarrierVisible && !removeBarrierFull;
        }
        this.setButtonLockedVisual(this._removeBarrierButton, canOpenRoute || removeBarrierFull);
        if (canOpenRoute) {
            this.startRemoveBarrierPulse();
        } else {
            this.stopRemoveBarrierPulse();
        }

        if (this._dispatchButton) {
            this._dispatchButton.active = dispatchVisible;
        }
        this.setButtonLockedVisual(this._dispatchButton, canDispatch);
        if (this._dispatchCostIcon?.node) {
            this._dispatchCostIcon.node.active = dispatchVisible;
        }

        if (this._openLaneButton) {
            this._openLaneButton.active = openLaneVisible;
        }

        if (this._openLaneLabel) {
            this._openLaneLabel.string = openLaneVisible
                ? openLaneFull
                    ? 'Full'
                    : `${openLaneCost}`
                : 'Full';
        }
        this.setButtonLockedVisual(this._openLaneButton, canRepair || openLaneFull);
        if (this._openLaneCostIcon?.node) {
            this._openLaneCostIcon.node.active = openLaneVisible && !openLaneFull;
        }

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
        this._dispatchLabel.string = this.dispatchCarCost > 0
            ? `Send Cars\n${this.dispatchCarCost}`
            : 'Send Cars\nFree';
    }

    private refreshMoneyLabel (): void {
        if (this._moneyLabel) {
            this._moneyLabel.string = `${this._money}`;
        }
    }

    private animateMoneyLabel (isSpend: boolean): void {
        if (!this._moneyLabel?.node?.isValid) {
            return;
        }

        let labelNode = this._moneyLabel.node;
        let baseScale = new Vec3(1, 1, 1);
        let baseColor = new Color(41, 134, 54, 255);
        let flashColor = isSpend ? new Color(220, 76, 76, 255) : new Color(74, 185, 92, 255);

        Tween.stopAllByTarget(labelNode);
        // this._moneyLabel.color = flashColor;
        labelNode.setScale(baseScale);
        tween(labelNode)
            .to(0.12, { scale: new Vec3(1.18, 1.18, 1) }, { easing: 'sineOut' })
            .to(0.16, { scale: baseScale }, { easing: 'sineIn' })
            .call(() => {
                if (this._moneyLabel) {
                    // this._moneyLabel.color = baseColor;
                }
            })
            .start();
    }

    private addMoney (amount: number): void {
        let gained = Math.max(0, Math.floor(amount));
        this._money += gained;
        this.addEndingProgress(gained);
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
        let laneStep = this.getLaneSlotStep(lane);
        while (lane.queueSlots.length < targetSize) {
            let slotIndex = lane.queueSlots.length;
            lane.queueSlots.push(new Vec3(
                lane.queueSlots[0].x + laneStep.x * slotIndex,
                lane.queueSlots[0].y + laneStep.y * slotIndex,
                lane.queueSlots[0].z + laneStep.z * slotIndex,
            ));
        }

        while (lane.queueCars.length < targetSize) {
            let car = this.spawnCarForLane(lane);
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

        let car = instantiate(lane.templateCar);
        car.active = true;
        this._worldRoot.addChild(car);

        let slotIndex = lane.queueCars.length;
        let slot = lane.queueSlots[slotIndex];
        if (slot) {
            car.setPosition(slot);
        } else {
            let laneStep = this.getLaneSlotStep(lane);
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
            let car = lane.queueCars[i];
            let target = lane.queueSlots[i];
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

        let targetIndex = lane.queueCars.length;
        let targetSlot = lane.queueSlots[targetIndex];
        if (!targetSlot) {
            car.destroy();
            return;
        }

        let laneStep = this.getLaneSlotStep(lane);
        let recycleFrom = new Vec3(
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

        let bigger = new Vec3(this._catScale.x * 1.15, this._catScale.y * 1.15, this._catScale.z);
        let skeletalAnimation = this._catNode.getComponent(SkeletalAnimation);
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

        let worldPosition = car.getWorldPosition(new Vec3());
        worldPosition.y += 1.8;
        this._serviceProgressWorldPosition = worldPosition;
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

        let state = { value: 0 };
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
                this.playBurgerBurstAtProgress();
                if (this._serviceProgressNode?.isValid) {
                    this._serviceProgressNode.active = false;
                }
                this._serviceProgressWorldPosition = null;
            })
            .start();
    }

    private playBurgerBurstAtProgress (): void {
        if (!this._overlayRoot?.isValid || !this._serviceProgressNode?.isValid || !this._burgerIconFrame) {
            return;
        }

        let origin = this._serviceProgressNode.position.clone();
        let bursts = [
            { offset: new Vec3(-40, 76, 0), scale: 0.16, delay: 0 },
            { offset: new Vec3(0, 108, 0), scale: 0.2, delay: 0.04 },
            { offset: new Vec3(42, 78, 0), scale: 0.16, delay: 0.08 },
            { offset: new Vec3(-14, 128, 0), scale: 0.13, delay: 0.12 },
        ];

        for (let i = 0; i < bursts.length; i++) {
            let burst = bursts[i];
            let burgerNode = new Node(`BurgerBurst_${i}`);
            this._overlayRoot.addChild(burgerNode);
            burgerNode.layer = Layers.Enum.UI_2D;
            burgerNode.addComponent(UITransform).setContentSize(100, 104);
            let opacity = burgerNode.addComponent(UIOpacity);
            opacity.opacity = 0;
            burgerNode.setPosition(origin.x, origin.y + 12, 0);
            burgerNode.setScale(burst.scale, burst.scale, 1);

            let sprite = burgerNode.addComponent(Sprite);
            sprite.spriteFrame = this._burgerIconFrame;

            tween(opacity)
                .delay(burst.delay)
                .to(0.08, { opacity: 255 })
                .to(0.2, { opacity: 0 })
                .start();

            tween(burgerNode)
                .delay(burst.delay)
                .to(0.42, {
                    position: new Vec3(origin.x + burst.offset.x, origin.y + burst.offset.y, 0),
                    scale: new Vec3(burst.scale * 1.2, burst.scale * 1.2, 1),
                }, { easing: 'sineOut' })
                .call(() => burgerNode.destroy())
                .start();
        }
    }

    private updateServiceProgressPosition (): void {
        if (!this._serviceProgressNode || !this._serviceProgressWorldPosition) {
            return;
        }

        let camera = this._mainCameraNode?.getComponent(Camera);
        if (!camera || !this._overlayRoot?.isValid) {
            return;
        }

        let uiPosition = new Vec3();
        camera.convertToUINode(this._serviceProgressWorldPosition, this._overlayRoot, uiPosition);
        this._serviceProgressNode.setPosition(uiPosition.x - 20, uiPosition.y - 140, 0);
    }

    private drawServiceProgress (graphics: Graphics, progress: number): void {
        let clamped = Math.max(0, Math.min(1, progress));
        let radius = 14;
        let startAngle = Math.PI * 0.5;
        let endAngle = startAngle - Math.PI * 2 * clamped;

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

        let first = lane.queueSlots[0];
        let second = lane.queueSlots[1];
        return Math.abs(second.z - first.z) > Math.abs(second.y - first.y);
    }

    private getLaneSlotStep (lane: LaneData): Vec3 {
        if (lane.queueSlots.length < 2) {
            return this.isDepthLane(lane)
                ? new Vec3(0, 0, this._laneTemplateSpacing)
                : new Vec3(0, this._laneTemplateSpacing, 0);
        }

        let first = lane.queueSlots[0];
        let second = lane.queueSlots[1];
        return new Vec3(second.x - first.x, second.y - first.y, second.z - first.z);
    }

    private getLaneForwardStep (lane: LaneData): Vec3 {
        let backStep = this.getLaneSlotStep(lane);
        let length = Math.sqrt(backStep.x * backStep.x + backStep.y * backStep.y + backStep.z * backStep.z);
        if (length <= 0.0001) {
            return this.isDepthLane(lane) ? new Vec3(0, 0, -1) : new Vec3(0, -1, 0);
        }

        return new Vec3(-backStep.x / length, -backStep.y / length, -backStep.z / length);
    }

    private getLaneRouteTargets (lane: LaneData, frontSlot: Vec3): { sPoint: Vec3; rPoint: Vec3 } {
        let sPoint = lane.sPoint
            ? lane.sPoint.clone()
            : new Vec3(frontSlot.x + 2, frontSlot.y, frontSlot.z);
        let rPoint = lane.rPoint
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
        let queueForward = this.normalizeVec3(this.getLaneForwardStep(lane), new Vec3(1, 0, 0));
        let roadForward = this.normalizeVec3(
            new Vec3(rPoint.x - sPoint.x, rPoint.y - sPoint.y, rPoint.z - sPoint.z),
            new Vec3(1, 0, 0),
        );
        let radius = Math.max(0.9, Math.min(2.1, Vec3.distance(start, sPoint) * 0.28));
        let exitPoint = new Vec3(
            rPoint.x + roadForward.x * 1.6,
            rPoint.y + roadForward.y * 1.6,
            rPoint.z + roadForward.z * 1.6,
        );

        let approachPoints = this.sampleCubicBezierPoints(
            start,
            this.addScaled(start, queueForward, radius),
            this.addScaled(sPoint, roadForward, -radius * 0.65),
            sPoint,
            10,
        );
        let departurePoints = this.sampleCubicBezierPoints(
            sPoint,
            this.addScaled(sPoint, roadForward, radius * 0.45),
            this.addScaled(rPoint, roadForward, -radius * 0.5),
            rPoint,
            12,
        );
        let exitPoints = this.sampleCubicBezierPoints(
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
        let scene = this.node.scene;
        if (!scene || !this._worldRoot) {
            return null;
        }

        let marker = this.findNodeByName(scene, name);
        if (!marker) {
            return null;
        }

        let worldPos = marker.getWorldPosition(new Vec3());
        return this._worldRoot.inverseTransformPoint(new Vec3(), worldPos);
    }

    private parseLandId (name: string, fallback: number): number {
        let match = name.match(/^Land(\d+)$/i);
        if (!match) {
            return fallback;
        }

        return Number.parseInt(match[1], 10) || fallback;
    }

    private faceCarAlong (car: Node, from: Vec3, to: Vec3): void {
        if (!car || !car.isValid) {
            return;
        }

        let yaw = this.getTweenYaw(car, from, to);
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
        let yaw = this.getTweenYaw(car, from, to);
        let props: { position: Vec3; eulerAngles?: Vec3 } = {
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
            let from = points[i - 1];
            let to = points[i];
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
        let points: Vec3[] = [p0.clone()];
        for (let i = 1; i <= segments; i++) {
            let t = i / segments;
            let inv = 1 - t;
            let inv2 = inv * inv;
            let inv3 = inv2 * inv;
            let t2 = t * t;
            let t3 = t2 * t;
            points.push(new Vec3(
                inv3 * p0.x + 3 * inv2 * t * p1.x + 3 * inv * t2 * p2.x + t3 * p3.x,
                inv3 * p0.y + 3 * inv2 * t * p1.y + 3 * inv * t2 * p2.y + t3 * p3.y,
                inv3 * p0.z + 3 * inv2 * t * p1.z + 3 * inv * t2 * p2.z + t3 * p3.z,
            ));
        }

        return points;
    }

    private normalizeVec3 (value: Vec3, fallback: Vec3): Vec3 {
        let length = Math.sqrt(value.x * value.x + value.y * value.y + value.z * value.z);
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
        let current = car.position.clone();
        let yaw = this.getTweenYaw(car, current, target);
        let props: { position: Vec3; eulerAngles?: Vec3 } = {
            position: target.clone(),
        };
        if (yaw !== null) {
            props.eulerAngles = new Vec3(0, yaw, 0);
        }

        return tween(car).to(this.getTravelDuration(current, target, 11.5, minDuration), props, { easing: 'quadOut' });
    }

    private getYawDegrees (from: Vec3, to: Vec3): number | null {
        let dx = to.x - from.x;
        let dz = to.z - from.z;
        if (Math.abs(dx) < 0.0001 && Math.abs(dz) < 0.0001) {
            return null;
        }

        return Math.atan2(dx, dz) * 180 / Math.PI + 180;
    }

    private getTweenYaw (car: Node, from: Vec3, to: Vec3): number | null {
        let targetYaw = this.getYawDegrees(from, to);
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
        let dx = to.x - from.x;
        let dy = to.y - from.y;
        let dz = to.z - from.z;
        let distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        return Math.max(minDuration, distance / Math.max(0.01, speed));
    }

    private attachButtonPressFeedback (buttonNode: Node): void {
        let opacity = buttonNode.getComponent(UIOpacity) ?? buttonNode.addComponent(UIOpacity);
        let pressedOffset = 4;
        let pressedOpacityDelta = 35;
        let isPressed = false;
        let restPosition = buttonNode.position.clone();
        let restOpacity = opacity.opacity;

        let restoreState = (): void => {
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

        let opacity = button.getComponent(UIOpacity) ?? button.addComponent(UIOpacity);
        opacity.opacity = enabled ? 255 : 120;
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
        let label = node.getComponent(Label);
        if (label) {
            label.font = this._uiFont;
        }

        for (let child of node.children) {
            this.applyUiFontToNode(child);
        }
    }

    private startRemoveBarrierPulse (): void {
        if (!this._removeBarrierButton || this._removeBarrierPulse) {
            return;
        }
        this._removeBarrierButton.setScale(1.2, 1.2, 1.2);
        this._removeBarrierPulse = tween(this._removeBarrierButton)
            .repeatForever(
                tween()
                    .to(0.35, { scale: new Vec3(1.3, 1.3, 1) })
                    .to(0.35, { scale: new Vec3(1.2, 1.2, 1) }),
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
        this._removeBarrierButton.setScale(1.2, 1.2,1);
    }

    private findNodeByName (root: Node, name: string): Node | null {
        if (root.name === name) {
            return root;
        }

        for (let child of root.children) {
            let found = this.findNodeByName(child, name);
            if (found) {
                return found;
            }
        }

        return null;
    }

    private findCanvasController (root: Node): FoodTruckPlayableController | null {
        let canvas = root.getComponent(Canvas);
        let controller = root.getComponent(FoodTruckPlayableController);
        if (canvas && controller) {
            return controller;
        }

        for (let child of root.children) {
            let found = this.findCanvasController(child);
            if (found) {
                return found;
            }
        }

        return null;
    }

    private resolveCanvasNode (): Node | null {
        let selfCanvas = this.node.getComponent(Canvas);
        if (selfCanvas) {
            return this.node;
        }

        if (this.node.getChildByName('Level')) {
            return this.node;
        }

        let parent = this.node.parent;
        if (parent?.getComponent(Canvas)) {
            return parent;
        }
        if (parent && parent.getChildByName('Level')) {
            return parent;
        }

        return null;
    }
    private getLaneTotal (): number {
        return this._lanes.length > 0 ? this._lanes.length : this.laneCount;
    }
}
