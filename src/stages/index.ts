import type { StageData } from '../engine/types';
import { classicStage } from './classic';
import { reactorStage } from './reactor';
import { ringStage } from './ring';
import { sandboxStage } from './sandbox';
import { skyholdStage } from './skyhold';
import { stormStage } from './storm';
import { templeStage } from './temple';
import { wreckStage } from './wreck';
import { hollowStage } from './hollow';
import { frostfangStage } from './frostfang';
import { stormrunnerStage } from './stormrunner';
import { targetsStage } from './targets';
import { launchStage } from './launch';

/** Every stage by id, including the dev sandbox used by training. */
export const STAGES: Record<string, StageData> = {
  [ringStage.id]: ringStage,
  [classicStage.id]: classicStage,
  [reactorStage.id]: reactorStage,
  [stormStage.id]: stormStage,
  [skyholdStage.id]: skyholdStage,
  [templeStage.id]: templeStage,
  [wreckStage.id]: wreckStage,
  [hollowStage.id]: hollowStage,
  [frostfangStage.id]: frostfangStage,
  [stormrunnerStage.id]: stormrunnerStage,
  [targetsStage.id]: targetsStage,
  [launchStage.id]: launchStage,
  [sandboxStage.id]: sandboxStage,
};
/** Stages offered in Stage Select (the sandbox is training-only). */
export const STAGE_LIST: StageData[] = [classicStage, ringStage, reactorStage, stormStage, templeStage, wreckStage, hollowStage, frostfangStage, stormrunnerStage, skyholdStage];
