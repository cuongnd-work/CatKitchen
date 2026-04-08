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
    private _scheduledCallbacks = new Map<SkeletalAnimation, () => void>();

    start () {
        if (!this.skeletalAnims.length || !this.getAvailableClips().length) return;

        for (const anim of this.skeletalAnims) {
            this.resumeFor(anim);
        }
    }

    /* ================= CORE ================= */

    private playRandomFor (anim: SkeletalAnimation): boolean {
        if (!anim) return false;

        const availableClips = this.getAvailableClips();
        if (!availableClips.length) return false;

        this.clearScheduledFor(anim);

        const lastIndex = this._lastIndexMap.get(anim) ?? -1;
        const index = this.getRandomIndex(lastIndex, availableClips.length);
        const clip = availableClips[index];

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
        const callback = () => {
            this._scheduledCallbacks.delete(anim);
            this.playRandomFor(anim);
        };
        this._scheduledCallbacks.set(anim, callback);
        this.scheduleOnce(callback, realDuration);
        return true;
    }

    public suspendFor (anim: SkeletalAnimation | null): void {
        if (!anim) return;
        this.clearScheduledFor(anim);
    }

    public resumeFor (anim: SkeletalAnimation | null): boolean {
        if (!anim) return false;
        return this.playRandomFor(anim);
    }

    private clearScheduledFor (anim: SkeletalAnimation): void {
        const callback = this._scheduledCallbacks.get(anim);
        if (!callback) return;

        this.unschedule(callback);
        this._scheduledCallbacks.delete(anim);
    }

    /* ================= RANDOM ================= */

    private getRandomIndex (lastIndex: number, count: number): number {
        if (count <= 1) return 0;

        let i = lastIndex;
        while (i === lastIndex) {
            i = Math.floor(Math.random() * count);
        }
        return i;
    }

    private getAvailableClips (): AnimationClip[] {
        const result: AnimationClip[] = [];
        for (let i = 0; i < this.clips.length; i++) {
            const clip = this.clips[i];
            if (!clip || !clip.name) {
                continue;
            }
            result.push(clip);
        }

        return result;
    }

    onDestroy () {
        this.unscheduleAllCallbacks();
        this._lastIndexMap.clear();
        this._scheduledCallbacks.clear();
    }
}
