import { getOemProductMap } from '@/db/offsets';
import type { OemProductMapRow } from '@/db/types';

const rowsPromise: Promise<OemProductMapRow[]> = getOemProductMap();

void rowsPromise;
