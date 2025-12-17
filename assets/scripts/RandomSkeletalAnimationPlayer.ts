import { _decorator, Component, SkeletalAnimation, AnimationClip } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('RandomSkeletalAnimationByClip')
export class RandomSkeletalAnimationByClip extends Component {

    @property([SkeletalAnimation])
    skeletalAnims: SkeletalAnimation[] = [];

    @property([AnimationClip])
    clips: AnimationClip[] = [];

    @property
    randomSpeed: boolean = false;

    private _lastIndex = -1;
    private _playing = false;

    start () {
        if (!this.skeletalAnims.length || !this.clips.length) return;
        this.playRandom();
    }

    private playRandom () {
        if (this._playing) return;
        this._playing = true;

        const index = this.getRandomIndex();
        const clip = this.clips[index];

        let speed = 1;
        if (this.randomSpeed) {
            speed = 0.8 + Math.random() * 0.4;
        }

        for (const anim of this.skeletalAnims) {
            if (!anim) continue;

            anim.addClip(clip);
            anim.play(clip.name);

            const state = anim.getState(clip.name);
            if (state) {
                state.speed = speed;
            }
        }

        const realDuration = clip.duration / speed;
        this._lastIndex = index;

        this.scheduleOnce(() => {
            this._playing = false;
            this.playRandom();
        }, realDuration);
    }

    private getRandomIndex (): number {
        if (this.clips.length <= 1) return 0;

        let i = this._lastIndex;
        while (i === this._lastIndex) {
            i = Math.floor(Math.random() * this.clips.length);
        }
        return i;
    }

    onDestroy () {
        this.unscheduleAllCallbacks();
    }
}
