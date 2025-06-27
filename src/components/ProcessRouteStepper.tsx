import { useState } from 'react';
import { Stepper, Button, Group } from '@mantine/core';

const processSteps = [
  { label: '衬底', description: 'Substrate', content: '当前步骤：衬底工艺' },
  { label: 'CP1', description: '第一道晶圆测试', content: '当前步骤：CP1 测试' },
  { label: 'CP2', description: '第二道晶圆测试', content: '当前步骤：CP2 测试' },
  { label: 'WLBI', description: '晶圆级光学检测', content: '当前步骤：WLBI 检测' },
  { label: 'CP3', description: '第三道晶圆测试', content: '当前步骤：CP3 测试' },
  { label: 'AOI', description: '自动光学检测', content: '当前步骤：AOI 检测' },
];

export default function ProcessRouteStepper({ demoMode = false }: { demoMode?: boolean }) {
  const [active, setActive] = useState(0);

  const nextStep = () => setActive((current) => (current < processSteps.length ? current + 1 : current));
  const prevStep = () => setActive((current) => (current > 0 ? current - 1 : current));

  return (
    <>
      <Stepper
        active={demoMode ? -1 : active}
        onStepClick={!demoMode ? setActive : undefined}
        allowNextStepsSelect={!demoMode}
      >
        {processSteps.map((step, index) => (
          <Stepper.Step
            key={index}
            label={step.label}
            description={step.description}
          >
            {!demoMode && step.content}
          </Stepper.Step>
        ))}
        <Stepper.Completed>
          {!demoMode && '工艺流程已完成！如需查看详情，请点击上方步骤。'}
        </Stepper.Completed>
      </Stepper>

      {!demoMode && (
        <Group justify="center" mt="xl">
          <Button variant="default" onClick={prevStep} disabled={active === 0}>
            上一步
          </Button>
          <Button onClick={nextStep} disabled={active > processSteps.length - 1}>
            下一步
          </Button>
        </Group>
      )}
    </>
  );
}