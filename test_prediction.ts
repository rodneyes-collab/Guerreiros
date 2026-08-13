
import { calculatePredictedMatches } from './utils/teamLogic';
import { SESSION_START_TIME, SESSION_END_TIME, AVG_MATCH_DURATION_MINS } from './constants';

const currentTimeStr = "19:00";
const todayMatchesCount = 0;
const firstMatchStartTimeStr = SESSION_START_TIME;

function test(totalPlayers: number) {
  const predicted = calculatePredictedMatches(
    currentTimeStr,
    SESSION_END_TIME,
    AVG_MATCH_DURATION_MINS,
    totalPlayers,
    undefined,
    todayMatchesCount,
    undefined,
    firstMatchStartTimeStr
  );
  console.log(`Players: ${totalPlayers}, Predicted matches: ${predicted}`);
}

test(20);
test(18);
test(15);
test(12);
test(10);
test(8);
