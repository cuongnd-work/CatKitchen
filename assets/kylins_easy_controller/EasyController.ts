import { EventTarget } from 'cc';

export enum EasyControllerEvent {
    MOVEMENT = 'movement',
    MOVEMENT_STOP = 'movement-stop',
    BUTTON = 'button',
}

type Callback = (...args: unknown[]) => void;

class EasyControllerBus {
    private readonly eventTarget = new EventTarget();

    public on(eventName: EasyControllerEvent | string, callback: Callback, target?: unknown): void {
        this.eventTarget.on(eventName, callback, target);
    }

    public off(eventName: EasyControllerEvent | string, callback?: Callback, target?: unknown): void {
        this.eventTarget.off(eventName, callback, target);
    }

    public emit(eventName: EasyControllerEvent | string, ...args: unknown[]): void {
        this.eventTarget.emit(eventName, ...args);
    }
}

export const EasyController = new EasyControllerBus();

