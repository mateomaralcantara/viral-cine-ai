import type {
  Character,
  CharacterBibleEntry,
  FilmPlan,
  FilmScene,
  FilmShot,
  ProjectInput,
  RealMotionPlan,
  RealMotionShotSpec
} from '@/lib/domain/schemas';
import { FIFTEEN_DAYS_SCORE_V5 } from '@/lib/production-presets/fifteen-days-score-v5';

export const FIFTEEN_DAYS_INPUT_V5: ProjectInput = {
  title: '15 DÍAS',
  premise:
    'Elena, una madre abandonada por su esposo y separada temporalmente de sus hijos, cae en la indigencia. Una mujer que vivió una historia semejante descubre que Elena escribe en un cuaderno y le muestra una vía para publicar su historia en Libroseller. Durante quince días Elena reconstruye disciplina, voz y propósito. Meses después recupera estabilidad, dignidad y a sus hijos. La historia evita promesas de riqueza instantánea: el verdadero triunfo es recuperar su vida.',
  durationMinutes: 12,
  genre: 'Drama contemporáneo de superación',
  audience: 'Público adulto y familiar de habla hispana',
  visualStyle:
    'Cine dramático contemporáneo realista, actuaciones íntimas, cámara orgánica, luz natural, transición progresiva de tonos fríos a cálidos, movimiento humano creíble y continuidad facial estricta',
  language: 'es',
  aspectRatio: '16:9',
  budgetUsd: 45,
  burnSubtitles: false,
  generateMusic: true
};

const IDS = {
  elena: 'char-v5-elena-0001',
  raul: 'char-v5-raul-0002',
  mariana: 'char-v5-mariana-0003',
  sofia: 'char-v5-sofia-0004',
  mateo: 'char-v5-mateo-0005'
} as const;

export const FIFTEEN_DAYS_CHARACTERS_V5: Character[] = [
  {
    id: IDS.elena,
    name: 'Elena',
    role: 'Protagonista',
    age: 36,
    appearance:
      'Mujer latina de 36 años, rostro ovalado reconocible, ojos marrón oscuro expresivos, cejas naturales, nariz recta, labios definidos, piel trigueña cálida, cabello castaño oscuro ondulado hasta los hombros, complexión media y postura inicialmente contenida.',
    wardrobe:
      'Antes de la caída usa ropa cotidiana sobria en crema, azul profundo y terracota; durante la calle conserva una chaqueta gris desgastada y camiseta azul apagada; en la reconstrucción adopta prendas limpias y sencillas; al final viste sastrería elegante azul petróleo sin lujo ostentoso.',
    personality:
      'Protectora, inteligente, sensible, disciplinada cuando recupera propósito; no se presenta como víctima pasiva sino como una mujer temporalmente desbordada.',
    voiceInstructions:
      'Español latino natural, voz femenina adulta cálida, íntima, respiración emocional realista, sin tono publicitario ni teatralidad excesiva.',
    voiceProvider: 'elevenlabs',
    imagePrompt:
      'Retrato cinematográfico realista de Elena, mujer latina de 36 años, identidad facial consistente, luz natural suave, textura de piel real, expresión vulnerable pero inteligente, sin glamour artificial.'
  },
  {
    id: IDS.raul,
    name: 'Raúl',
    role: 'Esposo de Elena',
    age: 40,
    appearance:
      'Hombre latino de 40 años, rostro rectangular, ojos oscuros, cabello negro corto ligeramente ondulado, barba de un día muy discreta, complexión media, presencia inicialmente segura y controlada.',
    wardrobe:
      'Al inicio camisa azul grisácea, pantalón oscuro y reloj sencillo; en su caída la misma paleta se deteriora: camisa gastada, chaqueta usada, zapatos vencidos, sin convertirlo en caricatura.',
    personality:
      'Evasivo, orgulloso, capaz de racionalizar decisiones dañinas; su caída se muestra como consecuencia y no como castigo celebratorio.',
    voiceInstructions:
      'Español latino masculino adulto, tono contenido, seguro al inicio y progresivamente quebrado; nunca voz de villano caricaturesco.',
    voiceProvider: 'elevenlabs',
    imagePrompt:
      'Retrato cinematográfico realista de Raúl, hombre latino de 40 años, cabello oscuro corto, rasgos consistentes, expresión contenida, luz dramática natural, sin estilización de villano.'
  },
  {
    id: IDS.mariana,
    name: 'Mariana',
    role: 'Mentora',
    age: 48,
    appearance:
      'Mujer latina de 48 años, rostro sereno y memorable, ojos oscuros atentos, cabello negro con discretas hebras grises, recogido bajo, postura elegante y segura.',
    wardrobe:
      'Vestuario profesional sobrio y funcional: blusa marfil, pantalón oscuro, abrigo ligero arena, accesorios mínimos.',
    personality:
      'Directa, empática, observadora, nunca condescendiente; transmite que conoce el dolor porque lo atravesó.',
    voiceInstructions:
      'Voz femenina madura, calmada, clara y cálida; autoridad tranquila, pausas naturales, sin tono de gurú.',
    voiceProvider: 'elevenlabs',
    imagePrompt:
      'Retrato cinematográfico realista de Mariana, mujer latina de 48 años, presencia serena, elegancia sobria, luz natural suave, identidad facial estable.'
  },
  {
    id: IDS.sofia,
    name: 'Sofía',
    role: 'Hija mayor',
    age: 10,
    appearance:
      'Niña latina de 10 años, cabello castaño oscuro largo y lacio, ojos grandes marrones, rostro infantil natural y expresivo, complexión delgada.',
    wardrobe:
      'Ropa infantil cotidiana y modesta en tonos azul claro, mostaza suave y blanco; continuidad estricta por escena.',
    personality:
      'Sensible, observadora y muy unida a su madre; expresa emoción con naturalidad y pocas palabras.',
    voiceInstructions:
      'Voz infantil natural, clara y espontánea; evitar interpretación adulta o melodramática.',
    voiceProvider: 'elevenlabs',
    imagePrompt:
      'Retrato cinematográfico realista y respetuoso de una niña latina de 10 años llamada Sofía, expresión natural, ropa infantil cotidiana, luz suave.'
  },
  {
    id: IDS.mateo,
    name: 'Mateo',
    role: 'Hijo menor',
    age: 7,
    appearance:
      'Niño latino de 7 años, cabello oscuro corto y rizado, ojos marrones, mejillas suaves, rostro infantil reconocible y expresivo.',
    wardrobe:
      'Ropa infantil cómoda en tonos verde oliva suave, beige y azul; continuidad estricta por escena.',
    personality:
      'Afectuoso, directo y espontáneo; su pregunta final debe sentirse simple y auténtica.',
    voiceInstructions:
      'Voz infantil natural, pequeña, cálida y espontánea; frases cortas y sin dramatización forzada.',
    voiceProvider: 'elevenlabs',
    imagePrompt:
      'Retrato cinematográfico realista y respetuoso de un niño latino de 7 años llamado Mateo, cabello oscuro rizado, expresión natural, luz suave.'
  }
];

export const FIFTEEN_DAYS_CHARACTER_BIBLE_V5: CharacterBibleEntry[] = [
  {
    characterId: IDS.elena,
    name: 'Elena',
    identityLock:
      'La misma mujer latina de 36 años en toda la película. Mantener estructura ósea, distancia entre ojos, nariz, boca, color de piel, línea mandibular y cabello base. La transformación ocurre por cansancio, peinado, vestuario, postura e iluminación; nunca cambiando de actriz, edad o rasgos.',
    immutableTraits: [
      '36 años durante toda la historia',
      'ojos marrón oscuro',
      'piel trigueña cálida',
      'rostro ovalado',
      'cabello castaño oscuro ondulado',
      'misma estructura facial en todos los estados'
    ],
    forbiddenDrift: [
      'cambiar de actriz',
      'rejuvenecer o envejecer más de forma visible',
      'cambiar color de ojos o piel',
      'convertir la indigencia en suciedad extrema caricaturesca',
      'glamour de moda durante la etapa de calle'
    ],
    states: [
      {
        id: 'elena-a-home',
        label: 'Antes de la caída',
        narrativeStage: 'Vida familiar justo antes de la ruptura.',
        appearance: 'Cabello cuidado, piel natural, ojeras mínimas, rostro descansado.',
        wardrobe: 'Blusa crema, pantalón oscuro, chaqueta terracota ligera.',
        physicalCondition: 'Salud estable, postura erguida.',
        performanceNotes: 'Contención emocional; la incredulidad aparece antes que el llanto.'
      },
      {
        id: 'elena-b-street',
        label: 'Calle',
        narrativeStage: 'Después de perder vivienda y separación de sus hijos.',
        appearance: 'Mismo rostro; cabello menos cuidado, ojeras, labios secos y cansancio visible sin deformar identidad.',
        wardrobe: 'Chaqueta gris desgastada, camiseta azul apagada, pantalón oscuro repetido, mochila.',
        physicalCondition: 'Fatiga, hombros algo cerrados, pasos más lentos.',
        performanceNotes: 'Evitar victimismo exagerado; habla poco, observa mucho.'
      },
      {
        id: 'elena-c-rebuild',
        label: 'Reconstrucción',
        narrativeStage: 'Durante los quince días escribiendo y publicando.',
        appearance: 'Mismo rostro; mejora gradual del cabello, sueño y postura.',
        wardrobe: 'Ropa sencilla limpia: blusa azul apagada, jeans oscuros, suéter neutro.',
        physicalCondition: 'Recupera energía de manera progresiva.',
        performanceNotes: 'Concentración, pequeños gestos de orgullo y miedo a fracasar.'
      },
      {
        id: 'elena-d-restored',
        label: 'Vida recuperada',
        narrativeStage: 'Meses después, con estabilidad y sus hijos de vuelta.',
        appearance: 'Mismo rostro y edad; cabello cuidado, mirada segura, maquillaje mínimo.',
        wardrobe: 'Sastrería azul petróleo y marfil, elegante sin ostentación.',
        physicalCondition: 'Postura abierta y segura.',
        performanceNotes: 'Serenidad. La fuerza no se interpreta como arrogancia.'
      }
    ]
  },
  {
    characterId: IDS.raul,
    name: 'Raúl',
    identityLock:
      'El mismo hombre latino de 40 años desde la ruptura hasta su caída. Mantener estructura facial, cabello oscuro, altura aparente y proporciones. El deterioro se expresa con vestuario, barba, fatiga y postura, no cambiando de identidad.',
    immutableTraits: [
      '40 años',
      'rostro rectangular',
      'cabello negro corto',
      'ojos oscuros',
      'complexión media'
    ],
    forbiddenDrift: [
      'cambiar de actor',
      'barba larga repentina',
      'aspecto de villano estereotípico',
      'envejecimiento extremo'
    ],
    states: [
      {
        id: 'raul-a-control',
        label: 'Control',
        narrativeStage: 'Ruptura y proceso inicial.',
        appearance: 'Aseado, cabello cuidado, barba apenas visible.',
        wardrobe: 'Camisa azul grisácea, pantalón oscuro, reloj sencillo.',
        physicalCondition: 'Seguro y estable.',
        performanceNotes: 'Evita mirar a Elena cuando sabe que está dañándola.'
      },
      {
        id: 'raul-b-fall',
        label: 'Caída',
        narrativeStage: 'Meses después, sin estabilidad.',
        appearance: 'Mismo rostro; barba de varios días, ojeras, cabello sin arreglar.',
        wardrobe: 'Chaqueta usada, camisa gastada, zapatos deteriorados.',
        physicalCondition: 'Cansancio y pérdida de seguridad corporal.',
        performanceNotes: 'Vergüenza y resistencia a pedir ayuda.'
      }
    ]
  },
  {
    characterId: IDS.mariana,
    name: 'Mariana',
    identityLock:
      'Mujer latina de 48 años con presencia serena y continuidad absoluta. No cambiar peinado base, edad aparente ni estructura facial.',
    immutableTraits: ['48 años', 'cabello oscuro con hebras grises', 'recogido bajo', 'ojos oscuros', 'postura serena'],
    forbiddenDrift: ['glamour ostentoso', 'apariencia de influencer', 'cambio de edad', 'cambio de identidad facial'],
    states: [{
      id: 'mariana-guide',
      label: 'Mentora',
      narrativeStage: 'Encuentro con Elena y acompañamiento.',
      appearance: 'Pulcra, natural, expresión empática.',
      wardrobe: 'Blusa marfil, pantalón oscuro, abrigo arena.',
      physicalCondition: 'Postura relajada y segura.',
      performanceNotes: 'Escucha antes de hablar; nunca vende una promesa.'
    }]
  },
  {
    characterId: IDS.sofia,
    name: 'Sofía',
    identityLock:
      'Niña de 10 años con identidad facial estable. La producción debe evitar cualquier estilización adulta.',
    immutableTraits: ['10 años', 'cabello castaño oscuro largo', 'ojos marrones', 'rostro infantil natural'],
    forbiddenDrift: ['maquillaje adulto', 'cambio de edad', 'ropa adulta', 'cambio de identidad'],
    states: [{
      id: 'sofia-main',
      label: 'Sofía',
      narrativeStage: 'Separación y reencuentro.',
      appearance: 'Natural, cabello largo y lacio.',
      wardrobe: 'Ropa infantil cotidiana azul claro y blanco.',
      physicalCondition: 'Salud normal.',
      performanceNotes: 'Emoción contenida; en el reencuentro corre de forma espontánea.'
    }]
  },
  {
    characterId: IDS.mateo,
    name: 'Mateo',
    identityLock:
      'Niño de 7 años con identidad estable, rostro infantil natural y cabello oscuro rizado.',
    immutableTraits: ['7 años', 'cabello oscuro rizado', 'ojos marrones', 'rostro infantil'],
    forbiddenDrift: ['cambio de edad', 'ropa adulta', 'rasgos adolescentes', 'cambio de identidad'],
    states: [{
      id: 'mateo-main',
      label: 'Mateo',
      narrativeStage: 'Separación y reencuentro.',
      appearance: 'Natural, cabello corto rizado.',
      wardrobe: 'Ropa infantil verde oliva suave, beige y azul.',
      physicalCondition: 'Salud normal.',
      performanceNotes: 'Directo y espontáneo; la frase “¿De verdad?” se dice sin teatralidad.'
    }]
  }
];

const providerOrder = ['veo', 'fal-video', 'runway', 'seedance'] as const;

function motion(input: Omit<RealMotionShotSpec, 'version' | 'allowStillFallbackFinal' | 'preferredProviders'>): RealMotionShotSpec {
  return {
    version: '5.0-real-motion-v1',
    allowStillFallbackFinal: false,
    preferredProviders: [...providerOrder],
    ...input
  };
}

export const FIFTEEN_DAYS_PILOT_SHOTS_V5: FilmShot[] = [
  {
    id: 'pilot-15d-01',
    order: 1,
    title: 'La moneda',
    durationSeconds: 6,
    visualPrompt:
      'Amanecer urbano realista después de lluvia. Elena, exactamente la misma mujer del FACE MASTER y BODY MASTER, está ya agachada junto al bordillo mojado en estado Calle. Una sola moneda metálica es claramente visible en primer término. Elena NO camina y NO tiene las manos en los bolsillos. Su mano derecha entra en cuadro, pinza la moneda entre pulgar e índice y la levanta; la moneda permanece visible durante la acción. Elena viste la chaqueta gris desgastada y ropa de calle definida en su estado, sin maquillaje glamuroso, sin pose de moda y sin embellecimiento. Mientras guarda la moneda en la palma, se incorpora lentamente con cansancio real. Mantener exactamente rostro, edad aparente, tono de piel, cabello y proporciones del Identity Lock.',
    camera: 'Comenzar muy bajo con la moneda nítida en primer término y Elena agachada parcialmente visible detrás. Seguir la mano al recogerla y realizar un único tilt/dolly ascendente lento hasta un plano medio parcial de Elena al incorporarse. Sin cortes, sin travelling frontal, sin zoom artificial y sin cambiar de eje.',
    spokenText: '',
    dialogueLines: [],
    motionSpec: motion({
      intention: 'Hacer inequívoca la acción narrativa de encontrar y recoger la moneda, preservando exactamente la identidad de Elena.',
      startState: 'Fotograma inicial: moneda grande y claramente legible junto al bordillo mojado; Elena ya está agachada detrás, rostro parcialmente visible en tres cuartos y coherente con FACE MASTER.',
      endState: 'Elena queda medio incorporada con la moneda visible en la palma durante un instante antes de cerrar la mano; su identidad sigue siendo exactamente la referencia maestra.',
      bodyMotion: 'Una sola acción física: mano derecha alcanza la moneda, pulgar e índice la pinzan, codo y hombro acompañan, Elena transfiere peso de piernas y torso y se incorpora lentamente. Prohibido caminar, meter ambas manos en bolsillos o hacer gestos de pasarela.',
      environmentMotion: 'Gotas residuales y reflejos de tráfico distante muy sutiles; el entorno nunca compite con la moneda ni con la mano.',
      cameraMotion: 'Seguimiento corto de la mano y ascenso vertical suave sincronizado con la incorporación de Elena; movimiento físico continuo y estable, sin cortes.',
      shotClass: 'hero',
      minMotionScore: 8,
      minIdentityScore: 9,
      minContinuityScore: 8,
      minAnatomyScore: 9,
      minCameraScore: 8
    }),
    mode: 'video',
    characterIds: [IDS.elena],
    characterStateIds: { [IDS.elena]: 'elena-b-street' },
    status: 'pending',
    pipelineVersion: '5.0-real-motion-pilot'
  },
  {
    id: 'pilot-15d-02',
    order: 2,
    title: 'La mesa detrás del cristal',
    durationSeconds: 6,
    visualPrompt:
      'Elena en la acera observa a través de una ventana a una familia cenando en un apartamento cálido. Ella permanece afuera, nunca invade el interior. Contraste de temperatura de color.',
    camera: 'Travelling lateral lento que mantiene a Elena en primer término y la familia desenfocada detrás del cristal, sin cortes.',
    spokenText: 'Hace seis meses yo también tenía una mesa.',
    speakerId: 'narrator',
    dialogueLines: [{
      id: 'pilot-15d-02-line',
      speakerId: 'narrator',
      text: 'Hace seis meses yo también tenía una mesa.',
      emotion: 'íntima y contenida',
      startSeconds: 0
    }],
    motionSpec: motion({
      intention: 'Crear el primer golpe emocional por contraste, no por explicación.',
      startState: 'Elena camina junto a la ventana sin mirar directamente al interior.',
      endState: 'Se detiene, observa la mesa familiar y baja apenas la mirada.',
      bodyMotion: 'Paso lento, detención natural, respiración visible sutil y microexpresión de pérdida.',
      environmentMotion: 'Familia se mueve suavemente al fondo, vapor de comida, reflejos de calle sobre el cristal.',
      cameraMotion: 'Travelling lateral continuo con profundidad y reflejos, sin zoom artificial.',
      shotClass: 'hero',
      minMotionScore: 8,
      minIdentityScore: 9,
      minContinuityScore: 9,
      minAnatomyScore: 8,
      minCameraScore: 9
    }),
    mode: 'video',
    characterIds: [IDS.elena],
    characterStateIds: { [IDS.elena]: 'elena-b-street' },
    status: 'pending',
    pipelineVersion: '5.0-real-motion-pilot'
  },
  {
    id: 'pilot-15d-03',
    order: 3,
    title: 'Seis meses antes',
    durationSeconds: 6,
    visualPrompt:
      'Interior doméstico seis meses antes. Elena en estado hogar ordena una mesa familiar sencilla al final de la tarde; la casa está vivida, no perfecta.',
    camera: 'Dolly-in muy lento desde plano general doméstico hasta plano medio de Elena, sin cortes.',
    spokenText: '',
    dialogueLines: [],
    motionSpec: motion({
      intention: 'Demostrar visualmente la vida que Elena perdió.',
      startState: 'Elena coloca platos mientras se escucha vida familiar fuera de cuadro.',
      endState: 'Elena mira hacia el pasillo al notar una tensión que aún no entiende.',
      bodyMotion: 'Movimiento cotidiano de manos, giro de cabeza, pausa pequeña y respiración.',
      environmentMotion: 'Cortina suave, luz de tarde, actividad doméstica fuera de foco.',
      cameraMotion: 'Dolly-in natural, sin aceleración ni cambio de eje.',
      shotClass: 'standard',
      minMotionScore: 8,
      minIdentityScore: 9,
      minContinuityScore: 9,
      minAnatomyScore: 8,
      minCameraScore: 8
    }),
    mode: 'video',
    characterIds: [IDS.elena],
    characterStateIds: { [IDS.elena]: 'elena-a-home' },
    status: 'pending',
    pipelineVersion: '5.0-real-motion-pilot'
  },
  {
    id: 'pilot-15d-04',
    order: 4,
    title: 'La maleta',
    durationSeconds: 6,
    visualPrompt:
      'Dormitorio realista. Raúl guarda ropa en una maleta abierta mientras Elena permanece cerca de la puerta. Ambos mantienen distancia física; tensión silenciosa.',
    camera: 'Plano medio a dos con desplazamiento lateral mínimo que conserva el eje entre Elena y Raúl, sin cortes.',
    spokenText: '¿Adónde vas?',
    speakerId: IDS.elena,
    dialogueLines: [{
      id: 'pilot-15d-04-line',
      speakerId: IDS.elena,
      text: '¿Adónde vas?',
      emotion: 'confundida, intentando mantener control',
      startSeconds: 1
    }],
    motionSpec: motion({
      intention: 'Iniciar la ruptura con acción física concreta y silencio incómodo.',
      startState: 'Raúl dobla una camisa sin mirar a Elena; Elena permanece inmóvil en la puerta.',
      endState: 'Raúl detiene las manos un instante pero todavía no la mira.',
      bodyMotion: 'Raúl dobla una prenda y la coloca en la maleta; Elena da un paso corto y habla.',
      environmentMotion: 'Tela de ropa, luz de habitación y cortina apenas móvil.',
      cameraMotion: 'Microdesplazamiento lateral estable manteniendo ambos cuerpos legibles.',
      shotClass: 'dialogue',
      minMotionScore: 8,
      minIdentityScore: 9,
      minContinuityScore: 9,
      minAnatomyScore: 9,
      minCameraScore: 8
    }),
    mode: 'video',
    characterIds: [IDS.elena, IDS.raul],
    characterStateIds: { [IDS.elena]: 'elena-a-home', [IDS.raul]: 'raul-a-control' },
    status: 'pending',
    pipelineVersion: '5.0-real-motion-pilot'
  },
  {
    id: 'pilot-15d-05',
    order: 5,
    title: 'Esto se terminó',
    durationSeconds: 6,
    visualPrompt:
      'Mismo dormitorio, continuidad exacta. Raúl finalmente mira a Elena; no hay gritos ni gestos teatrales.',
    camera: 'Plano medio cerrado sobre Raúl con Elena desenfocada en borde de cuadro, leve push-in, sin cortes.',
    spokenText: 'Esto se terminó, Elena.',
    speakerId: IDS.raul,
    dialogueLines: [{
      id: 'pilot-15d-05-line',
      speakerId: IDS.raul,
      text: 'Esto se terminó, Elena.',
      emotion: 'frío y evitativo, no agresivo',
      startSeconds: 1
    }],
    motionSpec: motion({
      intention: 'Hacer que la ruptura duela por contención.',
      startState: 'Raúl termina de guardar la prenda y evita el contacto visual.',
      endState: 'Levanta la vista, pronuncia la frase y vuelve a mirar la maleta.',
      bodyMotion: 'Movimiento mínimo de manos, mirada breve y tensión mandibular natural.',
      environmentMotion: 'Fondo doméstico vivo pero discreto; ninguna acción secundaria compite.',
      cameraMotion: 'Push-in de pocos centímetros, estable y continuo.',
      shotClass: 'dialogue',
      minMotionScore: 7.5,
      minIdentityScore: 9,
      minContinuityScore: 9,
      minAnatomyScore: 8,
      minCameraScore: 8
    }),
    mode: 'video',
    characterIds: [IDS.raul, IDS.elena],
    characterStateIds: { [IDS.raul]: 'raul-a-control', [IDS.elena]: 'elena-a-home' },
    status: 'pending',
    pipelineVersion: '5.0-real-motion-pilot'
  },
  {
    id: 'pilot-15d-06',
    order: 6,
    title: 'El mensaje',
    durationSeconds: 5,
    visualPrompt:
      'Primer plano narrativo del teléfono de Raúl encendiéndose sobre la cama; Elena alcanza a leer un mensaje breve de Vanessa sin tocar el dispositivo. Evitar texto ilegible generado: la interfaz del mensaje se añadirá en postproducción.',
    camera: 'Acercamiento corto y estable desde la reacción de Elena hacia el teléfono, sin cortes.',
    spokenText: '',
    dialogueLines: [],
    motionSpec: motion({
      intention: 'Revelar la infidelidad a través de la reacción de Elena y no depender de texto generado.',
      startState: 'Teléfono oscuro junto a la maleta; Elena mira hacia abajo.',
      endState: 'La pantalla se ilumina y Elena comprende lo que significa.',
      bodyMotion: 'Microreacción facial de Elena, mirada baja y respiración suspendida; manos se mantienen naturales.',
      environmentMotion: 'Pantalla ilumina sutilmente la tela; cortina se mueve apenas.',
      cameraMotion: 'Desplazamiento corto hacia el teléfono manteniendo parte del rostro de Elena en profundidad.',
      shotClass: 'transition',
      minMotionScore: 7,
      minIdentityScore: 9,
      minContinuityScore: 9,
      minAnatomyScore: 9,
      minCameraScore: 8
    }),
    mode: 'video',
    characterIds: [IDS.elena, IDS.raul],
    characterStateIds: { [IDS.elena]: 'elena-a-home', [IDS.raul]: 'raul-a-control' },
    status: 'pending',
    pipelineVersion: '5.0-real-motion-pilot'
  },
  {
    id: 'pilot-15d-07',
    order: 7,
    title: 'Hay otra mujer',
    durationSeconds: 5,
    visualPrompt:
      'Primer plano emocional de Elena en el mismo dormitorio. Sus ojos permanecen húmedos pero todavía no llora abiertamente.',
    camera: 'Primer plano fijo con respiración humana sutil; fondo y eje iguales a la toma anterior, sin cortes internos.',
    spokenText: 'Hay otra mujer.',
    speakerId: IDS.elena,
    dialogueLines: [{
      id: 'pilot-15d-07-line',
      speakerId: IDS.elena,
      text: 'Hay otra mujer.',
      emotion: 'certeza dolorosa, voz baja',
      startSeconds: 1
    }],
    motionSpec: motion({
      intention: 'Mostrar el instante exacto en que la sospecha se convierte en certeza.',
      startState: 'Elena mira el teléfono fuera de cuadro.',
      endState: 'Levanta la mirada hacia Raúl y sostiene el silencio después de hablar.',
      bodyMotion: 'Movimiento ocular, inspiración corta, labios articulan una frase breve y mandíbula se tensa.',
      environmentMotion: 'Fondo doméstico muy sutil, sin personajes entrando.',
      cameraMotion: 'Cámara casi fija con deriva orgánica mínima.',
      shotClass: 'dialogue',
      minMotionScore: 7,
      minIdentityScore: 9.5,
      minContinuityScore: 9,
      minAnatomyScore: 9,
      minCameraScore: 8
    }),
    mode: 'video',
    characterIds: [IDS.elena],
    characterStateIds: { [IDS.elena]: 'elena-a-home' },
    status: 'pending',
    pipelineVersion: '5.0-real-motion-pilot'
  },
  {
    id: 'pilot-15d-08',
    order: 8,
    title: 'Antes del llanto',
    durationSeconds: 5,
    visualPrompt:
      'Mismo rostro de Elena. Silencio después de la confirmación implícita de Raúl. Elena contiene el llanto; no cae ninguna lágrima exagerada.',
    camera: 'Primerísimo primer plano lento y estable, sin cortar, terminando en los ojos de Elena.',
    spokenText: '',
    dialogueLines: [],
    motionSpec: motion({
      intention: 'Cerrar el piloto demostrando actuación facial real y continuidad absoluta.',
      startState: 'Elena sostiene la mirada hacia Raúl fuera de campo.',
      endState: 'Parpadea, contiene el aire y baja apenas la mirada antes del corte.',
      bodyMotion: 'Microexpresiones, respiración, parpadeo y tensión de labios; ningún gesto grande.',
      environmentMotion: 'Luz de habitación estable y fondo suavemente vivo.',
      cameraMotion: 'Push-in extremadamente lento y físico, sin zoom digital aparente.',
      shotClass: 'hero',
      minMotionScore: 7,
      minIdentityScore: 9.5,
      minContinuityScore: 9.5,
      minAnatomyScore: 9,
      minCameraScore: 9
    }),
    mode: 'video',
    characterIds: [IDS.elena],
    characterStateIds: { [IDS.elena]: 'elena-a-home' },
    status: 'pending',
    pipelineVersion: '5.0-real-motion-pilot'
  }
];

export const FIFTEEN_DAYS_REAL_MOTION_V5: RealMotionPlan = {
  version: '5.0-real-motion-v1',
  finalMode: 'real-motion',
  allowStillFallbackFinal: false,
  providerOrder: [...providerOrder],
  circuitBreaker: {
    failureThreshold: 3,
    cooldownSeconds: 900
  },
  pilotShotIds: FIFTEEN_DAYS_PILOT_SHOTS_V5.map((shot) => shot.id),
  characterBible: FIFTEEN_DAYS_CHARACTER_BIBLE_V5,
  qualityRule:
    'Una toma FINAL solo puede marcarse lista si proviene de video generativo temporal real y supera motion, identidad, continuidad, anatomía y cámara. FFmpeg still-motion se permite para preview, nunca para FINAL.'
};

const sceneDefs: Array<{
  title: string;
  durationSeconds: number;
  summary: string;
  narration: string;
  dialogue: string;
  characterIds: string[];
}> = [
  {
    title: 'La ruptura',
    durationSeconds: 45,
    summary: 'Desde una imagen de indigencia regresamos seis meses atrás al instante en que Raúl abandona a Elena.',
    narration: 'Hace seis meses yo también tenía una mesa.',
    dialogue: 'Elena: ¿Adónde vas?\nRaúl: Esto se terminó, Elena.\nElena: Hay otra mujer.',
    characterIds: [IDS.elena, IDS.raul]
  },
  {
    title: 'La separación',
    durationSeconds: 45,
    summary: 'Elena pierde temporalmente la convivencia con sus hijos mientras su situación económica se desmorona.',
    narration: '',
    dialogue: '',
    characterIds: [IDS.elena, IDS.raul, IDS.sofia, IDS.mateo]
  },
  {
    title: 'Primera noche',
    durationSeconds: 55,
    summary: 'Elena duerme por primera vez en la calle y comprende la profundidad de su caída.',
    narration: 'Pensé que lo peor era perder a mi esposo. Después perdí mi casa. Y después, a mis hijos.',
    dialogue: '',
    characterIds: [IDS.elena]
  },
  {
    title: 'La primera página',
    durationSeconds: 45,
    summary: 'En un parque Elena comienza a escribir en un cuaderno: Día 1 sin mis hijos.',
    narration: '',
    dialogue: '',
    characterIds: [IDS.elena]
  },
  {
    title: 'Alguien se detuvo',
    durationSeconds: 60,
    summary: 'Mariana observa a Elena escribir y reconoce en ella la mirada que ella misma tuvo años atrás.',
    narration: '',
    dialogue: 'Mariana: Si todavía estás escribiendo, todavía no llegaste al final.',
    characterIds: [IDS.elena, IDS.mariana]
  },
  {
    title: 'La historia de Mariana',
    durationSeconds: 50,
    summary: 'Mariana revela que también vivió en la calle y reconstruyó su vida contando lo que le ocurrió.',
    narration: '',
    dialogue: '',
    characterIds: [IDS.elena, IDS.mariana]
  },
  {
    title: 'La propuesta',
    durationSeconds: 50,
    summary: 'Mariana le propone a Elena quince días de disciplina para convertir su cuaderno en una obra publicable.',
    narration: '',
    dialogue: 'Mariana: No para hacerte rica. Para demostrarte que todavía puedes construir algo con lo que te queda.',
    characterIds: [IDS.elena, IDS.mariana]
  },
  {
    title: 'Quince días',
    durationSeconds: 80,
    summary: 'Elena escribe, corrige, publica en Libroseller y recibe su primera venta antes de que su historia encuentre lectores.',
    narration: '',
    dialogue: '',
    characterIds: [IDS.elena, IDS.mariana]
  },
  {
    title: 'Dignidad',
    durationSeconds: 55,
    summary: 'Meses después Elena vive de su trabajo creativo, habla ante público y ha reconstruido estabilidad.',
    narration: '',
    dialogue: 'Elena: Cuando alguien intenta quitarte todo, todavía te queda tu historia.',
    characterIds: [IDS.elena]
  },
  {
    title: 'Lo que queda',
    durationSeconds: 45,
    summary: 'La vida de Raúl se ha deteriorado; su caída se observa sin convertirla en una celebración.',
    narration: '',
    dialogue: '',
    characterIds: [IDS.raul]
  },
  {
    title: 'De verdad',
    durationSeconds: 60,
    summary: 'Elena recupera estabilidad familiar y sus hijos vuelven a casa.',
    narration: '',
    dialogue: 'Mateo: ¿Esta es nuestra casa?\nElena: Sí.\nMateo: ¿De verdad?\nElena: De verdad.',
    characterIds: [IDS.elena, IDS.sofia, IDS.mateo]
  },
  {
    title: 'Segunda página',
    durationSeconds: 60,
    summary: 'Raúl pide ayuda. Elena no vuelve con él, pero decide no repetir la indiferencia que ella sufrió.',
    narration: '',
    dialogue: 'Raúl: Necesito ayuda.\nElena: Yo también la necesité. Y alguien decidió detenerse.',
    characterIds: [IDS.elena, IDS.raul]
  },
  {
    title: 'Ese capítulo sí',
    durationSeconds: 70,
    summary: 'En su oficina, Elena guarda el cuaderno original, sale con sus hijos y cierra un capítulo sin cerrar su historia.',
    narration: '',
    dialogue: 'Sofía: Mami, ¿ya terminaste?\nElena: Ese capítulo sí.',
    characterIds: [IDS.elena, IDS.sofia, IDS.mateo]
  }
];

function scene(index: number, def: (typeof sceneDefs)[number]): FilmScene {
  return {
    id: 'scene-15d-' + String(index + 1).padStart(2, '0'),
    order: index + 1,
    act: index < 4 ? 1 : index < 9 ? 2 : 3,
    title: def.title,
    durationSeconds: def.durationSeconds,
    summary: def.summary,
    narration: def.narration,
    dialogue: def.dialogue,
    dialogueTurns: [],
    visualPrompt:
      FIFTEEN_DAYS_INPUT_V5.visualStyle + '. ' + def.summary +
      ' Movimiento temporal auténtico, actuación corporal creíble, continuidad de identidad y vestuario, sin texto incrustado ni montaje interno.',
    negativePrompt:
      'still image, frozen person, slideshow, poster pose, morphing face, identity drift, deformed hands, duplicated people, artificial glamour, text artifacts, watermark',
    camera: 'Una sola toma continua con movimiento físico de cámara motivado por la acción.',
    soundDesign: 'Ambiente diegético realista con respiración, pasos, habitación o ciudad según localización.',
    transition: index === sceneDefs.length - 1 ? 'fade to black' : 'corte motivado por acción o sonido',
    mode: 'ai-video',
    characterIds: def.characterIds,
    shots: index === 0 ? FIFTEEN_DAYS_PILOT_SHOTS_V5 : [],
    status: 'pending'
  };
}

export function buildFifteenDaysPilotPlanV5(): FilmPlan {
  return {
    logline:
      'Tras perder hogar y convivencia con sus hijos, una mujer transforma un cuaderno escrito en la calle en el primer paso para recuperar su voz, su estabilidad y su familia.',
    synopsis:
      'Elena es abandonada por Raúl y, en una cadena de pérdidas, termina viviendo en la calle mientras sus hijos permanecen con su padre. Cuando Mariana descubre que Elena sigue escribiendo, le propone quince días de disciplina para convertir esa historia en un libro y publicarla en Libroseller. La primera venta no la vuelve rica: le demuestra que todavía puede construir. Meses después, Elena ha recuperado estabilidad y puede volver a recibir a sus hijos. La caída posterior de Raúl no se presenta como venganza; Elena cierra la historia eligiendo dignidad y compasión.',
    creativeDirection:
      'Drama contemporáneo realista. La cámara pasa de inestabilidad contenida y tonos fríos a movimientos más estables y luz cálida. La transformación de Elena ocurre sin cambiar de identidad facial. La película no usa still-motion como asset final. El éxito económico nunca supera emocionalmente al reencuentro familiar.',
    musicPrompt: FIFTEEN_DAYS_SCORE_V5.objective,
    musicPlan: FIFTEEN_DAYS_SCORE_V5,
    realMotion: FIFTEEN_DAYS_REAL_MOTION_V5,
    characters: FIFTEEN_DAYS_CHARACTERS_V5,
    scenes: sceneDefs.map((def, index) => scene(index, def))
  };
}

export function fifteenDaysPilotSummary() {
  return {
    title: FIFTEEN_DAYS_INPUT_V5.title,
    characters: FIFTEEN_DAYS_CHARACTER_BIBLE_V5.length,
    pilotShots: FIFTEEN_DAYS_PILOT_SHOTS_V5.length,
    realMotionOnly: true,
    providerOrder: [...providerOrder],
    emotionalCues: FIFTEEN_DAYS_SCORE_V5.cues.length
  };
}
