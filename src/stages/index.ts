import type { StageData } from '../engine/types';
import { classicStage } from './classic';
import { reactorStage } from './reactor';
import { ringStage } from './ring';
import { sandboxStage } from './sandbox';
import { skyholdStage } from './skyhold';
import { stormStage } from './storm';
import { templeStage } from './temple';

/** Every stage by id, including the dev sandbox used by training. */
export const STAGES: Record<string, StageData> = {
  [ringStage.id]: ringStage,
  [classicStage.id]: classicStage,
  [reactorStage.id]: reactorStage,
  [stormStage.id]: stormStage,
  [skyholdStage.id]: skyholdStage,
  [templeStage.id]: templeStage,
  [sandboxStage.id]: sandboxStage,
};
/** Stages offered in Stage Select (the sandbox is training-only). */
export const STAGE_LIST: StageData[] = [classicStage, ringStage, reactorStage, stormStage, templeStage, skyholdStage];
