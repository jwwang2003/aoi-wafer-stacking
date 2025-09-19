import { Stepper, StepperProps } from '@mantine/core';
import { ReactNode, useEffect, useRef } from 'react';

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
    const stepperRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const el = stepperRef.current;
        if (!el) return;

        // All tabbables inside stepper
        const focusables = el.querySelectorAll<HTMLElement>(
            'a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );

        // store previous tabindex to restore later if needed
        const prev: Array<[HTMLElement, string | null]> = [];
        focusables.forEach((node) => {
            prev.push([node, node.getAttribute('tabindex')]);
            node.setAttribute('tabindex', '-1');
        });

        return () => {
            // restore
            prev.forEach(([node, value]) => {
                if (value === null) node.removeAttribute('tabindex');
                else node.setAttribute('tabindex', value);
            });
        };
    }, []);

    return (
        <Stepper ref={stepperRef} active={active} onStepClick={onStepClick}>
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
