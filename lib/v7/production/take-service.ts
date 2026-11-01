import { randomUUID } from 'node:crypto';
import { ShotSchema, type Shot } from '@/lib/v7/domain/shot';
import { TakeSchema, type Take } from '@/lib/v7/domain/take';

export type NewTakeInput = Omit<Take, 'id' | 'shotId' | 'version' | 'createdAt'> & {
  id?: string;
  createdAt?: string;
};

export function appendTake(shot: Shot, input: NewTakeInput): Shot {
  const version = Math.max(0, ...shot.takes.map((take) => take.version)) + 1;
  const take = TakeSchema.parse({
    ...input,
    id: input.id || randomUUID(),
    shotId: shot.id,
    version,
    createdAt: input.createdAt || new Date().toISOString()
  });
  return ShotSchema.parse({
    ...shot,
    takes: [...shot.takes, take]
  });
}

export function selectTake(shot: Shot, takeId: string): Shot {
  const take = shot.takes.find((candidate) => candidate.id === takeId);
  if (!take) throw new Error('Take inexistente: ' + takeId);
  if (!['approved', 'succeeded'].includes(take.status)) {
    throw new Error('Solo un Take aprobado o completado puede seleccionarse.');
  }
  return ShotSchema.parse({ ...shot, selectedTakeId: takeId });
}

export function selectedTake(shot: Shot) {
  return shot.takes.find((take) => take.id === shot.selectedTakeId);
}
