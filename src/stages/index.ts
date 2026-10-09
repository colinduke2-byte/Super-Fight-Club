import type { StageData } from '../engine/types';
import { sandboxStage } from './sandbox';

export const STAGES: Record<string, StageData> = {
  [sandboxStage.id]: sandboxStage,
};
export const STAGE_LIST: StageData[] = Object.values(STAGES);
