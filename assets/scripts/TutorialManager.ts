import { _decorator, Component, Node } from 'cc';
import { TutorialStep } from './TutorialStep';

const { ccclass, property } = _decorator;

@ccclass('TutorialManager')
export class TutorialManager extends Component {
    @property({ type: Node, tooltip: 'Character node shared by all tutorial steps (optional).' })
    public character: Node | null = null;

    @property({ type: [TutorialStep], tooltip: 'Ordered list of tutorial steps to run.' })
    public steps: TutorialStep[] = [];

    @property({ tooltip: 'Start the tutorial automatically when the scene loads.' })
    public autoStart = true;

    private _started = false;

    protected onEnable (): void {
        if (this.autoStart) {
            this.startTutorial();
        } else {
            this.resetSteps();
        }
    }

    public startTutorial (): void {
        if (this._started) {
            return;
        }
        this._started = true;
        this.resetSteps();
        if (this.steps.length > 0) {
            this.setupStepChain();
            this.steps[0].setStepActive(true);
        }
    }

    private resetSteps (): void {
        this.steps.forEach((step) => {
            if (step && this.character && !step.character) {
                step.character = this.character;
            }
            step?.setStepActive(false);
        });
    }

    private setupStepChain (): void {
        for (let i = 0; i < this.steps.length - 1; i++) {
            const current = this.steps[i];
            const next = this.steps[i + 1];
            if (current) {
                current.nextStep = next;
            }
        }
    }
}
