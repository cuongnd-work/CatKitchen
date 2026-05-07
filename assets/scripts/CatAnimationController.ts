import { _decorator, AnimationClip, AnimationState, Component, Node, SkeletalAnimation } from 'cc';
import { OrderPopup } from 'db://assets/scripts/OrderPopup';
const { ccclass, property } = _decorator;

@ccclass('CatAnimationController')
export class CatAnimationController extends Component {
    @property(SkeletalAnimation)
    private animation: SkeletalAnimation = null!;

    @property(OrderPopup)
    public orderPopup: OrderPopup = null;

    private _currentAnimationName = '';

    protected onLoad (): void {
        this.resolveAnimation();
        this.resolveOrderPopup();
    }

    public sellTargetPopup: OrderPopup | null = null;

    private resolveOrderPopup (): OrderPopup | null {
        if (!this.orderPopup) {
            this.orderPopup = this.getComponentInChildren(OrderPopup);
        }

        return this.orderPopup;
    }

    public doIdle(){
        this.playAnimation('Dung');
    }

    public doWalk(){
        this.playWalkAngry(1);
    }

    public doBedo(){
        this.playAnimation('Bedo');
    }

    public doDoing(){
        this.playAnimation('Doing');
    }

    public playWalkAngry (speed = 1, preferredClip: AnimationClip | null = null): void {
        if (preferredClip && this.playClip(preferredClip, speed, true)) {
            return;
        }

        if (this.tryPlayState('Walk_Angry', speed, true)) {
            return;
        }

        if (this.tryPlayState('Walk_Angry.animation', speed, true)) {
            return;
        }

        this.playAnimation('Walk_Angry', speed, true, ['walk_angry', 'walk', 'run']);
    }

    public playClip (clip: AnimationClip | null, speed = 1, loop = false): boolean {
        if (!clip) {
            return false;
        }

        const anim = this.resolveAnimation();
        if (!anim) {
            return false;
        }

        if (!anim.getState(clip.name)) {
            anim.addClip(clip);
        }

        if (this._currentAnimationName === clip.name && this.isStateCurrentlyPlaying(anim, clip.name)) {
            const currentState = anim.getState(clip.name);
            return this.applyStateOptions(currentState, speed, loop);
        }

        anim.crossFade(clip.name, 0.12);
        const state = anim.getState(clip.name);
        this._currentAnimationName = clip.name;
        return this.applyStateOptions(state, speed, loop);
    }

    public getSkeletalAnimation (): SkeletalAnimation | null {
        return this.resolveAnimation();
    }

    public setModelVisible (visible: boolean): void {
        const modelNode = this.resolveAnimation()?.node;
        if (!modelNode || !modelNode.isValid) {
            return;
        }

        modelNode.active = visible;
    }

    public playAnimation (clipName: string, speed = 1, loop = false, fallbackKeywords: string[] = []): void {
        const anim = this.resolveAnimation();
        if (!anim || !clipName) {
            return;
        }

        const resolvedClipName = this.resolveClipName(clipName, fallbackKeywords);
        if (this._currentAnimationName === resolvedClipName && this.isStateCurrentlyPlaying(anim, resolvedClipName)) {
            const currentState = anim.getState(resolvedClipName);
            this.applyStateOptions(currentState, speed, loop);
            return;
        }

        anim.crossFade(resolvedClipName, 0.12);
        const state = anim.getState(resolvedClipName);
        this._currentAnimationName = resolvedClipName;
        this.applyStateOptions(state, speed, loop);
    }

    private tryPlayState (stateName: string, speed = 1, loop = false): boolean {
        const anim = this.resolveAnimation();
        if (!anim || !stateName) {
            return false;
        }

        if (!anim.getState(stateName)) {
            return false;
        }

        if (this._currentAnimationName === stateName && this.isStateCurrentlyPlaying(anim, stateName)) {
            const currentState = anim.getState(stateName);
            return this.applyStateOptions(currentState, speed, loop);
        }

        anim.crossFade(stateName, 0.12);
        const state = anim.getState(stateName);
        this._currentAnimationName = stateName;
        return this.applyStateOptions(state, speed, loop);
    }

    private applyStateOptions (state: AnimationState | null, speed = 1, loop = false): boolean {
        if (!state) {
            return false;
        }

        state.speed = speed;
        if (loop) {
            // Cocos 3.8.7 runtime can expose WrapMode inconsistently in Preview.
            // Use numeric loop mode directly to avoid "reading 'Loop'" crashes.
            (state as unknown as { wrapMode: number }).wrapMode = 2;
            state.repeatCount = Number.POSITIVE_INFINITY;
        }

        return true;
    }

    private resolveAnimation (): SkeletalAnimation | null {
        if (this.animation && this.animation.isValid) {
            return this.animation;
        }

        const catRoot = this.node.getChildByName('Cat1');
        if (catRoot && catRoot.isValid) {
            this.animation = catRoot.getComponent(SkeletalAnimation) ?? catRoot.getComponentInChildren(SkeletalAnimation);
        }

        if (!this.animation || !this.animation.isValid) {
            this.animation = this.getComponent(SkeletalAnimation) ?? this.getComponentInChildren(SkeletalAnimation);
        }

        return this.animation ?? null;
    }

    private isStateCurrentlyPlaying (anim: SkeletalAnimation, stateName: string): boolean {
        const state = anim.getState(stateName) as (AnimationState & { isPlaying?: boolean }) | null;
        return !!state?.isPlaying;
    }

    private resolveClipName (preferred: string, fallbackKeywords: string[]): string {
        const anim = this.animation;
        if (!anim) {
            return preferred;
        }

        if (anim.getState(preferred)) {
            return preferred;
        }

        const clips = ((anim as unknown as { clips?: AnimationClip[] }).clips ?? []);
        const normalizedKeywords = fallbackKeywords.map((keyword) => keyword.toLowerCase());
        if (normalizedKeywords.length > 0) {
            const matched = clips.find((clip) => {
                const clipName = clip?.name?.toLowerCase?.() ?? '';
                return clipName.length > 0 && normalizedKeywords.some((keyword) => clipName.includes(keyword));
            });
            if (matched?.name) {
                return matched.name;
            }
        }

        const firstClip = clips[0];
        if (firstClip?.name) {
            return firstClip.name;
        }

        return preferred;
    }
}


