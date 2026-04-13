import { _decorator, Component, EventHandler, view } from 'cc';
import {
    OrientationWatcher,
    OrientationState,
    ORIENTATION_CHANGED_EVENT,
} from './OrientationWatcher';

const { ccclass, property } = _decorator;

/**
 * Executes configurable event lists whenever the playable switches orientations.
 * Attach this together with OrientationWatcher on a persistent node.
 */
@ccclass('OrientationActionTrigger')
export class OrientationActionTrigger extends Component {
    private static _instance: OrientationActionTrigger | null = null;
    public static get instance(): OrientationActionTrigger | null {
        return this._instance;
    }

    @property({ type: [EventHandler], tooltip: 'Actions fired when entering landscape.' })
    landscapeActions: EventHandler[] = [];

    @property({ type: [EventHandler], tooltip: 'Actions fired when entering portrait.' })
    portraitActions: EventHandler[] = [];

    private watcher: OrientationWatcher | null = null;
    private initialTriggered = false;
    private pollingWatcher = false;

    onLoad() {
        if (!OrientationActionTrigger._instance) {
            OrientationActionTrigger._instance = this;
        } else if (OrientationActionTrigger._instance !== this) {
            console.warn('[OrientationActionTrigger] duplicate detected, using existing singleton.');
        }

        this.bindWatcher();
        if (!this.watcher) {
            console.warn('[OrientationActionTrigger] Missing OrientationWatcher reference.');
            this.startWatcherPolling();
        }
        this.triggerInitialState();
    }

    private bindWatcher() {
        if (this.watcher || !OrientationWatcher.instance) {
            return;
        }
        this.watcher = OrientationWatcher.instance;
        this.watcher.node.on(ORIENTATION_CHANGED_EVENT, this.onOrientationChanged, this);
    }

    onDestroy() {
        if (OrientationActionTrigger._instance === this) {
            OrientationActionTrigger._instance = null;
        }

        this.watcher?.node.off(ORIENTATION_CHANGED_EVENT, this.onOrientationChanged, this);
        this.stopWatcherPolling();
    }

    /** Allows other scripts/UI buttons to manually trigger the landscape branch. */
    public triggerLandscape() {
        this.trigger('landscape');
    }

    /** Allows other scripts/UI buttons to manually trigger the portrait branch. */
    public triggerPortrait() {
        this.trigger('portrait');
    }

    private onOrientationChanged(state: OrientationState) {
        this.trigger(state);
    }

    private trigger(state: OrientationState) {
        const actions =
            state === 'landscape' ? this.landscapeActions : this.portraitActions;
        if (!actions?.length) {
            return;
        }
        EventHandler.emitEvents(actions);
    }

    private guessOrientation(): OrientationState {
        const size = view.getCanvasSize();
        return size.width >= size.height ? 'landscape' : 'portrait';
    }

    private triggerInitialState() {
        if (this.initialTriggered) {
            return;
        }
        const firstState = this.watcher?.orientation ?? this.guessOrientation();
        if (!firstState) {
            return;
        }
        this.initialTriggered = true;
        this.trigger(firstState);
    }

    private startWatcherPolling() {
        if (this.pollingWatcher) {
            return;
        }
        this.pollingWatcher = true;
        // OrientationWatcher may not exist yet if scripts load out of order; keep checking.
        this.schedule(this.pollForWatcher, 0.1);
    }

    private stopWatcherPolling() {
        if (!this.pollingWatcher) {
            return;
        }
        this.unschedule(this.pollForWatcher);
        this.pollingWatcher = false;
    }

    private pollForWatcher() {
        if (this.watcher) {
            this.stopWatcherPolling();
            return;
        }
        this.bindWatcher();
        if (this.watcher) {
            this.stopWatcherPolling();
            this.triggerInitialState();
        }
    }
}
