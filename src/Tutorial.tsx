import { useState, useEffect } from "react";

export interface TutorialStep {
  id: string;
  title: string;
  description: string;
  highlight?: string;
  position?: "top" | "bottom" | "left" | "right" | "center";
}

interface TutorialProps {
  steps: TutorialStep[];
  onClose: () => void;
  onComplete?: () => void;
}

export default function Tutorial({ steps, onClose, onComplete }: TutorialProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const step = steps[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === steps.length - 1;

  const handleNext = () => {
    if (isLastStep) {
      handleClose();
      onComplete?.();
    } else {
      setCurrentStep((s) => s + 1);
    }
  };

  const handlePrev = () => {
    if (!isFirstStep) {
      setCurrentStep((s) => s - 1);
    }
  };

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 200);
  };

  const getPositionClass = () => {
    switch (step.position) {
      case "top":
        return "tutorial-card-top";
      case "bottom":
        return "tutorial-card-bottom";
      case "left":
        return "tutorial-card-left";
      case "right":
        return "tutorial-card-right";
      default:
        return "tutorial-card-center";
    }
  };

  return (
    <div className={"tutorial-overlay" + (isVisible ? " visible" : "")}>
      {step.highlight && <div className="tutorial-highlight" data-highlight={step.highlight} />}
      
      <div className={"tutorial-card " + getPositionClass()}>
        <button className="tutorial-close" onClick={handleClose} aria-label="关闭">
          ×
        </button>
        
        <div className="tutorial-step-indicator">
          {steps.map((_, i) => (
            <span
              key={i}
              className={"tutorial-dot" + (i === currentStep ? " active" : "")}
            />
          ))}
        </div>

        <h3 className="tutorial-title">{step.title}</h3>
        <p className="tutorial-description">{step.description}</p>

        <div className="tutorial-actions">
          {!isFirstStep ? (
            <button className="tutorial-btn tutorial-btn-secondary" onClick={handlePrev}>
              上一步
            </button>
          ) : (
            <button className="tutorial-btn tutorial-btn-skip" onClick={handleClose}>
              跳过
            </button>
          )}
          <button className="tutorial-btn tutorial-btn-primary" onClick={handleNext}>
            {isLastStep ? "开始游戏" : "下一步"}
          </button>
        </div>

        <div className="tutorial-step-count">
          {currentStep + 1} / {steps.length}
        </div>
      </div>
    </div>
  );
}
