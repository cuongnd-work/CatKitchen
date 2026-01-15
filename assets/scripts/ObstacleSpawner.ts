import { _decorator, Component, Prefab, Vec3, instantiate, Node, BoxCollider, RigidBody, MeshRenderer, Material, Color, PrimitiveMesh } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('ObstacleSpawner')
export class ObstacleSpawner extends Component {

    @property(Prefab)
    obstaclePrefab: Prefab | null = null;

    @property({ type: [Vec3] })
    obstaclePositions: Vec3[] = [];

    @property(Vec3)
    colliderSize: Vec3 = new Vec3(2, 2, 2);

    @property
    positionsInWorldSpace: boolean = false;

    @property
    spawnOnLoad: boolean = true;

    @property(Color)
    obstacleColor: Color = new Color(255, 153, 51, 255);

    private _spawned: Node[] = [];
    private _material: Material | null = null;

    start() {
        if (this.spawnOnLoad) {
            this.spawnObstacles();
        }
    }

    spawnObstacles() {
        this.clearObstacles();
        for (let i = 0; i < this.obstaclePositions.length; i++) {
            const pos = this.obstaclePositions[i];
            const node = this._createObstacleNode();
            if (!node) {
                continue;
            }
            if (this.positionsInWorldSpace) {
                node.setWorldPosition(pos);
            }
            else {
                node.setPosition(pos);
            }
            node.parent = this.node;
            this._spawned.push(node);
        }
    }

    clearObstacles() {
        while (this._spawned.length > 0) {
            const node = this._spawned.pop();
            node?.destroy();
        }
    }

    private _createObstacleNode(): Node | null {
        let node: Node;
        if (this.obstaclePrefab) {
            node = instantiate(this.obstaclePrefab);
        }
        else {
            node = new Node('Obstacle');
            this._applyDefaultAppearance(node);
        }

        const collider = node.getComponent(BoxCollider) ?? node.addComponent(BoxCollider);
        collider.size = this.colliderSize.clone();

        const body = node.getComponent(RigidBody) ?? node.addComponent(RigidBody);
        body.type = RigidBody.Type.STATIC;
        body.useGravity = false;

        return node;
    }

    private _applyDefaultAppearance(node: Node) {
        const renderer = node.getComponent(MeshRenderer) ?? node.addComponent(MeshRenderer);
        renderer.mesh = PrimitiveMesh.createBox(this.colliderSize.x, this.colliderSize.y, this.colliderSize.z);
        renderer.material = this._getSharedMaterial();
    }

    private _getSharedMaterial(): Material {
        if (!this._material) {
            const material = new Material();
            material.initialize({
                effectName: 'builtin-standard'
            });
            this._material = material;
        }
        this._material.setProperty('mainColor', this.obstacleColor);
        return this._material;
    }
}
