import { EventTarget } from 'cc';

export enum EasyControllerEvent {
    MOVEMENT = 'movement',
    MOVEMENT_STOP = 'movement-stop',
    BUTTON = 'button',
}

type EventHandler = (...args: unknown[]) => void;

class EasyControllerBridge {
    private readonly eventTarget = new EventTarget();

    public on (event: EasyControllerEvent | string, callback: EventHandler, target?: unknown): void {
        this.eventTarget.on(event, callback, target);
    }

    public off (event: EasyControllerEvent | string, callback?: EventHandler, target?: unknown): void {
        this.eventTarget.off(event, callback, target);
    }

    public emit (event: EasyControllerEvent | string, ...args: unknown[]): void {
        this.eventTarget.emit(event, ...args);
    }
}

export const EasyController = new EasyControllerBridge();
