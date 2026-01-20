import { _decorator, Component, Node, Prefab, Collider, ITriggerEvent, Vec3, macro, tween, TweenEasing } from 'cc';
import { object_pool_manager } from 'db://assets/plugins/playable-foundation/game-foundation/object_pool';
const { ccclass, property } = _decorator;

const EVENT_TRIGGER_ENTER = 'onTriggerEnter';
const EVENT_TRIGGER_EXIT = 'onTriggerExit';

@ccclass('SpawnZone')
export class SpawnZone extends Component {
    @property({ type: Node, tooltip: 'Character node to watch for trigger overlap.' })
    public character: Node | null = null;

    @property({ type: Prefab, tooltip: 'Prefab to spawn every interval while the character stays inside.' })
    public prefabToSpawn: Prefab | null = null;

    @property({ type: Node, tooltip: 'Parent that receives spawned instances (defaults to this node).' })
    public spawnParent: Node | null = null;

    @property({ tooltip: 'Seconds between each spawn.' })
    public spawnInterval = 1;

    @property({ tooltip: 'Delay before the first spawn after the character enters.' })
    public spawnDelayOnEnter = 0;

    @property({ tooltip: 'Number of columns in the ground grid.', min: 1, step: 1 })
    public columns = 4;

    @property({ tooltip: 'Number of rows in the ground grid.', min: 1, step: 1 })
    public rows = 4;

    @property({ tooltip: 'Distance between columns on the X axis.' })
    public horizontalSpacing = 0.5;

    @property({ tooltip: 'Distance between rows on the Z axis.' })
    public depthSpacing = 0.5;

    @property({ tooltip: 'Distance between each stacked layer on the Y axis.' })
    public verticalSpacing = 0.5;

    @property({ tooltip: 'Reset the stacking layout when the character leaves the zone.' })
    public resetStackOnExit = false;

    @property({ type: Node, tooltip: 'Node where prefabs first appear before tweening to the stacked slot.' })
    public startPoint: Node | null = null;

    @property({ type: Vec3, tooltip: 'Initial scale applied at startPoint before tweening to the prefab scale.' })
    public startScale: Vec3 = new Vec3(0.2, 0.2, 0.2);

    @property({ tooltip: 'Seconds the prefab takes to travel from the startPoint to the stacked slot.' })
    public moveDuration = 0.35;

    @property({ tooltip: 'Easing for the travel tween.' })
    public moveEasing: TweenEasing = 'quadOut';

    @property({ tooltip: 'Seconds the prefab takes to grow back to its original scale.' })
    public scaleDuration = 0.35;

    @property({ tooltip: 'Easing for the scale tween.' })
    public scaleEasing: TweenEasing = 'quadOut';

    private _isCharacterInside = false;
    private _isSpawning = false;
    private _spawnPosition: Vec3 = new Vec3();
    private _finalLocalPos: Vec3 = new Vec3();
    private _startLocalPos: Vec3 = new Vec3();
    private _startWorldPos: Vec3 = new Vec3();
    private _spawnCount = 0;
    private _baseWorldPos: Vec3 = new Vec3();
    private _tempStartScale: Vec3 = new Vec3();
    private _targetScale: Vec3 = new Vec3();

    protected onEnable(): void {
        const collider = this.getComponent(Collider);
        if (!collider) {
            console.warn(`[SpawnZone] ${this.node.name} needs a Collider set as a trigger.`);
            return;
        }
        collider.on(EVENT_TRIGGER_ENTER, this.onTriggerEnter, this);
        collider.on(EVENT_TRIGGER_EXIT, this.onTriggerExit, this);
    }

    protected onDisable(): void {
        const collider = this.getComponent(Collider);
        if (collider) {
            collider.off(EVENT_TRIGGER_ENTER, this.onTriggerEnter, this);
            collider.off(EVENT_TRIGGER_EXIT, this.onTriggerExit, this);
        }
        this.stopSpawning();
    }

    private onTriggerEnter(event: ITriggerEvent): void {
        if (!this.character || !event.otherCollider) {
            return;
        }
        if (event.otherCollider.node === this.character) {
            this._isCharacterInside = true;
            this.startSpawning();
        }
    }

    private onTriggerExit(event: ITriggerEvent): void {
        if (!this.character || !event.otherCollider) {
            return;
        }
        if (event.otherCollider.node === this.character) {
            this._isCharacterInside = false;
            this.stopSpawning();
            if (this.resetStackOnExit) {
                this._spawnCount = 0;
            }
        }
    }

    private startSpawning(): void {
        if (this._isSpawning || !this.prefabToSpawn || this.spawnInterval <= 0) {
            return;
        }
        this._isSpawning = true;
        this.schedule(this.spawnPrefab, this.spawnInterval, macro.REPEAT_FOREVER, Math.max(0, this.spawnDelayOnEnter));
    }

    private stopSpawning(): void {
        if (!this._isSpawning) {
            return;
        }
        this._isSpawning = false;
        this.unschedule(this.spawnPrefab);
    }

    private spawnPrefab(): void {
        if (!this._isCharacterInside || !this.prefabToSpawn) {
            return;
        }
        const targetParent = this.spawnParent ?? this.node;
        const spawned = object_pool_manager.instance.Spawn(this.prefabToSpawn, undefined, undefined, targetParent);
        if (!spawned) {
            return;
        }
        spawned.getScale(this._targetScale);
        this._tempStartScale.set(this.startScale);
        spawned.setScale(this._tempStartScale);

        this.computeStackedPosition(this._spawnPosition);
        targetParent.inverseTransformPoint(this._finalLocalPos, this._spawnPosition);

        this.getStartWorldPosition(this._startWorldPos);
        targetParent.inverseTransformPoint(this._startLocalPos, this._startWorldPos);
        spawned.setPosition(this._startLocalPos);

        const finalLocal = new Vec3(this._finalLocalPos.x, this._finalLocalPos.y, this._finalLocalPos.z);
        tween(spawned)
            .to(this.moveDuration, { position: finalLocal }, { easing: this.moveEasing })
            .start();

        const finalScale = new Vec3(this._targetScale.x, this._targetScale.y, this._targetScale.z);
        tween(spawned)
            .to(this.scaleDuration, { scale: finalScale }, { easing: this.scaleEasing })
            .start();
    }

    private computeStackedPosition(out: Vec3): void {
        const columns = Math.max(1, Math.floor(this.columns));
        const rows = Math.max(1, Math.floor(this.rows));
        const perLayer = columns * rows;
        const currentIndex = this._spawnCount;
        const layerIndex = Math.floor(currentIndex / perLayer);
        const cellIndex = currentIndex % perLayer;
        const rowIndex = Math.floor(cellIndex / columns);
        const columnIndex = cellIndex % columns;

        this.node.getWorldPosition(this._baseWorldPos);
        const halfWidth = (columns - 1) * this.horizontalSpacing * 0.5;
        const halfDepth = (rows - 1) * this.depthSpacing * 0.5;

        out.set(
            this._baseWorldPos.x + columnIndex * this.horizontalSpacing - halfWidth,
            this._baseWorldPos.y + layerIndex * this.verticalSpacing,
            this._baseWorldPos.z + rowIndex * this.depthSpacing - halfDepth
        );

        this._spawnCount++;
    }

    private getStartWorldPosition(out: Vec3): void {
        if (this.startPoint) {
            this.startPoint.getWorldPosition(out);
        } else {
            this.node.getWorldPosition(out);
        }
    }
}
