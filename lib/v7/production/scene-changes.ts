/**
 * Marca de «la escena cambió»: cualquier decisión del autor sobre una toma (devolver al montaje, quitar,
 * volver a una versión, su material…) la actualiza, y la escena en verde se vuelve a montar sola.
 */
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { v7FilmRoot } from '@/lib/v7/storage/film-store';

const changeFile = (filmId: string, sceneLabel: string) => path.join(v7FilmRoot(filmId), 'harness', `${sceneLabel.toLowerCase()}-cambios.txt`);

export async function touchSceneChange(filmId: string, shotOrScene: string, why = '') {
  const scene = shotOrScene.slice(0, 3).toUpperCase();
  if (!/^E\d{2}$/.test(scene)) return;
  const file = changeFile(filmId, scene);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, new Date().toISOString() + (why ? ' ' + why : '') + '\n');
}

export async function sceneChangedAt(filmId: string, sceneLabel: string) {
  return stat(changeFile(filmId, sceneLabel)).then((x) => x.mtimeMs, () => 0);
}
