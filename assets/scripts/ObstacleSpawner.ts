import { _decorator, Component, Prefab, Vec3, instantiate, Node, BoxCollider, RigidBody, MeshRenderer, Material, Color, PrimitiveMesh, Quat } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('ObstacleSpawner')
export class ObstacleSpawner extends Component {

    @property(Prefab)
    obstaclePrefab: Prefab | null = null;

    @property({ type: [Vec3] })
    obstaclePositions: Vec3[] = [];

    @property(Vec3)
    colliderSize: Vec3 = new Vec3(2, 2, 2);

    @property({ type: [Node] })
    boundaryPoints: Node[] = [];

    @property
    closeBoundaryLoop: boolean = true;

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
        this._spawnFromPositions();
        this._spawnBoundarySegments();
    }

    private _spawnFromPositions() {
        for (let i = 0; i < this.obstaclePositions.length; i++) {
            const pos = this.obstaclePositions[i];
            const node = this._createObstacleNode();
            if (!node) {
                continue;
            }
            node.parent = this.node;
            if (this.positionsInWorldSpace) {
                node.setWorldPosition(pos);
            }
            else {
                node.setPosition(pos);
            }
            this._spawned.push(node);
        }
    }

    clearObstacles() {
        while (this._spawned.length > 0) {
            const node = this._spawned.pop();
            node?.destroy();
        }
    }

    private _spawnBoundarySegments() {
        const points = this.boundaryPoints.filter((point) => point && point.isValid) as Node[];
        if (points.length < 2) {
            return;
        }

        const shouldCloseLoop = this.closeBoundaryLoop && points.length > 2;
        const segmentCount = shouldCloseLoop ? points.length : points.length - 1;

        for (let i = 0; i < segmentCount; i++) {
            const currentPoint = points[i];
            const nextPoint = points[(i + 1) % points.length];

            const start = currentPoint.worldPosition.clone();
            const end = nextPoint.worldPosition.clone();
            const length = Vec3.distance(start, end);
            if (length <= 0.01) {
                continue;
            }

            const midPoint = new Vec3();
            Vec3.add(midPoint, start, end);
            Vec3.multiplyScalar(midPoint, midPoint, 0.5);

            const direction = new Vec3();
            Vec3.subtract(direction, end, start);

            const segmentSize = new Vec3(this.colliderSize.x, this.colliderSize.y, length);
            const segment = this._createObstacleNode(segmentSize);
            if (!segment) {
                continue;
            }

            segment.parent = this.node;
            segment.setWorldPosition(midPoint);
            segment.setWorldRotation(this._buildSegmentRotation(direction));
            this._spawned.push(segment);
        }
    }

    private _createObstacleNode(sizeOverride?: Vec3): Node | null {
        let node: Node;
        if (this.obstaclePrefab) {
            node = instantiate(this.obstaclePrefab);
        }
        else {
            node = new Node('Obstacle');
            this._applyDefaultAppearance(node, sizeOverride ?? this.colliderSize);
        }

        const collider = node.getComponent(BoxCollider) ?? node.addComponent(BoxCollider);
        const colliderSize = sizeOverride ?? this.colliderSize;
        collider.size = colliderSize.clone();

        const body = node.getComponent(RigidBody) ?? node.addComponent(RigidBody);
        body.type = RigidBody.Type.STATIC;
        body.useGravity = false;

        return node;
    }

    private _applyDefaultAppearance(node: Node, size: Vec3) {
        const renderer = node.getComponent(MeshRenderer) ?? node.addComponent(MeshRenderer);
        renderer.mesh = PrimitiveMesh.createBox(size.x, size.y, size.z);
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

    private _buildSegmentRotation(direction: Vec3): Quat {
        const projected = new Vec3(direction.x, 0, direction.z);
        const magnitude = Math.sqrt(projected.x * projected.x + projected.z * projected.z);
        if (magnitude <= 0.0001) {
            return new Quat();
        }
        const yaw = Math.atan2(projected.x, projected.z);
        const rotation = new Quat();
        Quat.fromAxisAngle(rotation, Vec3.UP, yaw);
        return rotation;
    }
}
