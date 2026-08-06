export type Direction = -1 | 1;

const LOCOMOTION_ACTION_PATTERN = /(?:walk|run|trot|move|ride|fly|charge|dash|bounce|leap|行走|奔跑|移动|骑行|驾驶|飞行|冲刺|弹跳|跳跃)/i;

export function isLocomotionAction(actionId: string, actionName = ""): boolean {
  return LOCOMOTION_ACTION_PATTERN.test(`${actionId} ${actionName}`);
}
