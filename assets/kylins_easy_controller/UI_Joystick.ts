import { EasyController, EasyControllerEvent } from 'db://assets/kylins_easy_controller/EasyController';

export class UI_Joystick {
    private static externalInteractionRefs = 0;

    public static beginExternalInteraction(): void {
        this.externalInteractionRefs++;
    }

    public static endExternalInteraction(): void {
        this.externalInteractionRefs = Math.max(0, this.externalInteractionRefs - 1);
    }

    public static isExternalInteractionActive(): boolean {
        return this.externalInteractionRefs > 0;
    }

    public static emitMovement(degree: number, offset: number): void {
        if (this.isExternalInteractionActive()) {
            return;
        }

        EasyController.emit(EasyControllerEvent.MOVEMENT, degree, offset);
    }

    public static emitMovementStop(): void {
        EasyController.emit(EasyControllerEvent.MOVEMENT_STOP);
    }

    public static emitButton(buttonName: string): void {
        if (this.isExternalInteractionActive()) {
            return;
        }

        EasyController.emit(EasyControllerEvent.BUTTON, buttonName);
    }
}
