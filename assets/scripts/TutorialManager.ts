import { _decorator, Component, Node } from 'cc';
import { TutorialStep } from './TutorialStep';
import { TargetArrow } from './TargetArrow';

const { ccclass, property } = _decorator;

@ccclass('TutorialManager')
export class TutorialManager extends Component {
    @property({ type: Node, tooltip: 'Character node shared by all tutorial steps (optional).' })
    public character: Node | null = null;

    @property({ type: [TutorialStep], tooltip: 'Ordered list of tutorial steps to run.' })
    public steps: TutorialStep[] = [];

    @property({ tooltip: 'Start the tutorial automatically when the scene loads.' })
    public autoStart = true;

    @property({ type: TargetArrow, tooltip: 'Arrow anchored on the character that points to the active step.' })
    public characterArrow: TargetArrow | null = null;

    private _started = false;
    private _activeStep: TutorialStep | null = null;

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
            if (step) {
                step.manager = this;
                step.setStepActive(false);
            }
        });
        this.clearCharacterArrow();
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

    public onStepActivated (step: TutorialStep): void {
        this._activeStep = step;
        this.setCharacterArrowTarget(step);
    }

    public onStepCompleted (step: TutorialStep): void {
        if (this._activeStep === step && !step.nextStep) {
            this.completeTutorial();
        }
    }

    public clearCharacterArrow (): void {
        this._activeStep = null;
        this.setCharacterArrowTarget(null);
    }

    public completeTutorial (): void {
        this.clearCharacterArrow();
        this._started = false;
    }

    private setCharacterArrowTarget (step: TutorialStep | null): void {
        if (!this.characterArrow) {
            return;
        }
        if (step) {
            const targetNode = step.navigationTarget ?? step.highlightArrow ?? step.node;
            this.characterArrow.target = targetNode;
            this.characterArrow.node.active = !!targetNode;
        } else {
            this.characterArrow.target = null;
            this.characterArrow.node.active = false;
        }
    }
}
