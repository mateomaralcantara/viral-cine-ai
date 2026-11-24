/**
 * AÑADIR TOMAS A UNA ESCENA (por ejemplo, planos del guion que el desglose se saltó).
 * Las tomas nuevas se añaden al FINAL de la escena (E01-P05, E01-P06…): las que ya tienen video
 * conservan su número y su trabajo. Gratis: solo cambia el guion de producción.
 */
import { readV7FilmBundle, saveV7FilmBundle } from '@/lib/v7/storage/film-store';
import { indexedScenes } from './scene-approval-board';
import { characterKeyFromId } from './character-identity';
import { touchSceneChange } from './scene-changes';

export type NewShotInput = {
  title: string; camera: string; description: string;
  /** Clave del personaje que habla (o vacío si no habla nadie). */
  speaker?: string; line?: string; onCamera?: boolean; seconds?: 4 | 6 | 8;
};

const LIMPIO = 'Sin subtítulos ni texto en pantalla.';

export async function addShotToScene(filmId: string, sceneLabel: string, input: NewShotInput) {
  const stored = await readV7FilmBundle(filmId);
  const film = stored.film;
  const sc = indexedScenes(film).find((s) => s.label === sceneLabel);
  if (!sc) throw new Error('No existe la escena ' + sceneLabel);
  const title = input.title.trim().slice(0, 120);
  const description = input.description.trim().replace(/\.$/, '');
  if (title.length < 2) throw new Error('Pon un título a la toma.');
  if (description.length < 15) throw new Error('Describe lo que se ve en la toma (al menos una frase).');
  const seconds = ([4, 6, 8] as const).includes(input.seconds as 4) ? input.seconds! : 6;
  const camera = (input.camera || 'Plano medio').trim().replace(/\.$/, '');
  const line = (input.line ?? '').trim();
  const speakerChar = input.speaker ? film.characters.find((c) => characterKeyFromId(c.id) === input.speaker) : undefined;
  const narrator = film.characters.find((c) => characterKeyFromId(c.id) === 'narrador') ?? film.characters[0];
  const onCamera = Boolean(line && speakerChar && input.onCamera !== false && !/sin imagen/i.test(speakerChar.appearance));

  // Aspecto fijo de los personajes que se nombran, vestuario y lugar de la escena (como el resto de tomas).
  const meta = (sc.scene.metadata ?? {}) as Record<string, unknown>;
  const location = typeof meta.location === 'string' && meta.location ? meta.location : '';
  const costume = typeof meta.costume === 'string' ? meta.costume : '';
  const plain = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const named = film.characters.filter((c) => !/sin imagen/i.test(c.appearance) && plain(description + ' ' + (onCamera ? speakerChar!.name : '')).includes(plain(c.name.split(/\s+/)[0])));
  const looks = named.map((c) => `${c.name}: ${c.appearance}.`).join(' ');
  // El vestuario de la escena es el del protagonista: solo se añade si aparece.
  const wardrobe = costume && film.characters[0] && named.some((c) => c.id === film.characters[0].id) ? ` Vestuario: ${costume.replace(/\.$/, '')}.` : '';
  const style = film.visualStyle ? film.visualStyle.replace(/\.?$/, '.') : 'Cine dramático fotorrealista, formato 16:9.';
  const base = `${camera}. ${location ? 'En ' + location + ', ' : ''}${description}. ${looks}${wardrobe}`.replace(/\s+/g, ' ').trim();
  const prompt = onCamera
    ? `${base} ${speakerChar!.name} dice en español: «${line}». ${style} ${LIMPIO}`
    : `${base} Bocas cerradas. ${style} ${LIMPIO}`;

  const scene = sc.scene;
  const order = scene.shots.length + 1;
  const shot = {
    id: scene.id + '-shot-' + String(order).padStart(2, '0') + '-extra-' + Date.now().toString(36),
    sceneId: scene.id, order, title, intention: scene.summary, durationSeconds: seconds,
    visualPrompt: prompt, camera, spokenText: line,
    speakerId: (speakerChar ?? narrator).id,
    characterIds: [...new Set([...scene.characterIds, ...named.map((c) => c.id), ...(speakerChar ? [speakerChar.id] : [])])],
    strategy: 'cinematic-video-candidate',
    metadata: { curatedPrompt: true, voiceOver: !onCamera && !!line, onCameraDialogue: onCamera, providerCalls: 0, lipsyncStatus: onCamera ? 'native-veo' : 'not-needed', addedByAuthor: true },
    takes: []
  };
  (scene.shots as unknown as typeof shot[]).push(shot);
  scene.durationSeconds += seconds;
  // Las escenas siguientes se desplazan en el tiempo (el orden del episodio no cambia).
  for (const other of indexedScenes(film)) if (other.scene.timeIndex > scene.timeIndex) other.scene.timeIndex += seconds;
  await saveV7FilmBundle({ ...stored, savedAt: undefined });
  await touchSceneChange(filmId, sceneLabel, 'toma añadida');
  return { label: `${sceneLabel}-P${String(order).padStart(2, '0')}`, onCamera, seconds };
}
