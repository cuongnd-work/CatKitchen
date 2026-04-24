import { _decorator, Component, screen, view } from 'cc';

const { ccclass } = _decorator;

export type OrientationState = 'portrait' | 'landscape';
export const ORIENTATION_CHANGED_EVENT = 'orientation-changed';

/**
 * Emits `orientation-changed` whenever the playable swaps between portrait and landscape.
 * Attach this to a persistent node to keep tracking across scenes.
 */
@ccclass('OrientationWatcher')
export class OrientationWatcher extends Component {
    private static _instance: OrientationWatcher | null = null;

    public static get instance(): OrientationWatcher | null {
        return this._instance;
    }

    public static resolveOrientation (): OrientationState {
        return this._instance?.orientation ?? this.detectOrientation() ?? 'portrait';
    }

    private currentState: OrientationState | null = null;
    private mediaQuery: MediaQueryList | null = null;

    private readonly updateOrientation = () => {
        const nextState = this.calculateOrientation();
        if (nextState && nextState !== this.currentState) {
            this.currentState = nextState;
            console.log(`[OrientationWatcher] ${nextState}`);
            this.node.emit(ORIENTATION_CHANGED_EVENT, nextState);
        }
    };

    public get orientation(): OrientationState | null {
        return this.currentState;
    }

    onLoad() {
        if (OrientationWatcher._instance && OrientationWatcher._instance !== this) {
            console.warn('[OrientationWatcher] duplicate detected, destroying new instance.');
            this.destroy();
            return;
        }
        OrientationWatcher._instance = this;

        this.updateOrientation();
        view.on('canvas-resize', this.updateOrientation, this);

        const globalScreen = typeof screen === 'undefined' ? null : screen;
        if (globalScreen?.orientation?.addEventListener) {
            globalScreen.orientation.addEventListener('change', this.updateOrientation);
        }

        if (typeof window !== 'undefined') {
            window.addEventListener('resize', this.updateOrientation);

            if (window.matchMedia) {
                this.mediaQuery = window.matchMedia('(orientation: portrait)');
                if (this.mediaQuery.addEventListener) {
                    this.mediaQuery.addEventListener('change', this.updateOrientation);
                }
            }
        }
    }

    onDestroy() {
        if (OrientationWatcher._instance === this) {
            OrientationWatcher._instance = null;
        }

        view.off('canvas-resize', this.updateOrientation, this);

        const globalScreen = typeof screen === 'undefined' ? null : screen;
        if (globalScreen?.orientation?.removeEventListener) {
            globalScreen.orientation.removeEventListener('change', this.updateOrientation);
        }

        if (typeof window !== 'undefined') {
            window.removeEventListener('resize', this.updateOrientation);

            if (this.mediaQuery?.removeEventListener) {
                this.mediaQuery.removeEventListener('change', this.updateOrientation);
            }
        }
    }

    private calculateOrientation(): OrientationState | null {
        return OrientationWatcher.detectOrientation();
    }

    private static detectOrientation (): OrientationState | null {
        try {
            const windowSize = screen.windowSize;
            if (windowSize.width > 0 && windowSize.height > 0) {
                return windowSize.width >= windowSize.height ? 'landscape' : 'portrait';
            }
        } catch {
            // ignore and fall back to canvas sizing
        }

        try {
            const size = view.getCanvasSize();
            if (size.width > 0 && size.height > 0) {
                return size.width >= size.height ? 'landscape' : 'portrait';
            }
        } catch {
            // ignore and fall back to DOM sizing
        }

        if (typeof window !== 'undefined') {
            return window.innerWidth >= window.innerHeight ? 'landscape' : 'portrait';
        }

        return null;
    }
}
