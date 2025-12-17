import {
    _decorator,
    AnimationClip,
    Component,
    SkeletalAnimation
} from 'cc';

const { ccclass, property } = _decorator;

@ccclass('RandomSkeletalAnimationByClip')
export class RandomSkeletalAnimationByClip extends Component {

    @property([SkeletalAnimation])
    skeletalAnims: SkeletalAnimation[] = [];

    @property([AnimationClip])
    clips: AnimationClip[] = [];

    @property
    randomSpeed: boolean = false;

    // mỗi skeletal có lastIndex riêng
    private _lastIndexMap = new Map<SkeletalAnimation, number>();

    start () {
        if (!this.skeletalAnims.length || !this.clips.length) return;

        for (const anim of this.skeletalAnims) {
            this.playRandomFor(anim);
        }
    }

    /* ================= CORE ================= */

    private playRandomFor (anim: SkeletalAnimation) {
        if (!anim) return;

        const lastIndex = this._lastIndexMap.get(anim) ?? -1;
        const index = this.getRandomIndex(lastIndex);
        const clip = this.clips[index];

        let speed = 1;
        if (this.randomSpeed) {
            speed = 0.8 + Math.random() * 0.4;
        }

        anim.addClip(clip);
        anim.play(clip.name);

        const state = anim.getState(clip.name);
        if (state) {
            state.speed = speed;
        }

        const realDuration = clip.duration / speed;
        this._lastIndexMap.set(anim, index);

        // ⏱ schedule RIÊNG cho anim này
        this.scheduleOnce(() => {
            this.playRandomFor(anim);
        }, realDuration);
    }

    /* ================= RANDOM ================= */

    private getRandomIndex (lastIndex: number): number {
        if (this.clips.length <= 1) return 0;

        let i = lastIndex;
        while (i === lastIndex) {
            i = Math.floor(Math.random() * this.clips.length);
        }
        return i;
    }

    onDestroy () {
        this.unscheduleAllCallbacks();
        this._lastIndexMap.clear();
    }
}
