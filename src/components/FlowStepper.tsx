import { Stepper, StepperProps } from '@mantine/core';
import { ReactNode } from 'react';

interface StepItem {
    label: string;
    description: string;
}

interface FlowStepperProps extends StepperProps {
    active: number;
    onStepClick?: (index: number) => void;
    steps: StepItem[];
    children: ReactNode;
}

export default function FlowStepper({
    active,
    onStepClick,
    steps,
    children,
}: FlowStepperProps) {
    return (
        <Stepper active={active} onStepClick={onStepClick}>
            {steps.map((step, index) => (
                <Stepper.Step
                    key={index}
                    label={step.label}
                    description={step.description}
                />
            ))}
            {children && false}
        </Stepper>
    );
}