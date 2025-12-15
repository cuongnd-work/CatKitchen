import { _decorator, Component, Node, Prefab, Vec3, tween, randomRange } from 'cc';
import { object_pool_manager } from "db://assets/plugins/playable-foundation/game-foundation/object_pool";
const { ccclass, property } = _decorator;

@ccclass('CoinThrowEffect')
export class CoinThrowEffect extends Component {

    @property(Prefab)
    coinPrefab: Prefab = null!;

    @property
    minCoins = 2;

    @property
    maxCoins = 5;

    @property
    throwHeight = 120;

    @property
    throwDuration = 0.4;

    // 👉 mỗi lần enable node
    onEnable () {
        this.spawnCoins();
    }

    private spawnCoins () {
        const count = Math.floor(randomRange(this.minCoins, this.maxCoins + 1));

        for (let i = 0; i < count; i++) {
            this.spawnSingleCoin();
        }
    }

    private spawnSingleCoin () {
        if (!this.coinPrefab) return;

        const coin = object_pool_manager.instance.Spawn(this.coinPrefab);
        this.node.addChild(coin);

        const startPos = new Vec3(randomRange(-20, 20), 0, 0);
        const peakPos = new Vec3(
            startPos.x + randomRange(-20, 20),
            this.throwHeight + randomRange(20, 50),
            0
        );
        const endPos = new Vec3(
            startPos.x + randomRange(-30, 30),
            0,
            0
        );

        coin.setPosition(startPos);

        tween(coin)
            .to(this.throwDuration, { position: peakPos }, { easing: 'quadOut' })
            .to(this.throwDuration, { position: endPos }, { easing: 'quadIn' })
            .call(() => {
                object_pool_manager.instance.Recycle(coin);
            })
            .start();
    }
}
