export { Gender } from './types';

import { Gender, Player } from './types';

export const APP_VERSION = '3.3.5';

export const INITIAL_PLAYERS: Player[] = [];

export const SKILL_WEIGHTS = {
  setting: 0.3,
  attacking: 0.3,
  defense: 0.2,
  serving: 0.2
};

export const SESSION_START_TIME = "18:30";
export const SESSION_END_TIME = "22:00";
export const AVG_MATCH_DURATION_MINS = 13;
