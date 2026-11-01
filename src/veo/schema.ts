export const SHEETS = ['Plantilla', 'Partidos', 'Datos por partido', 'Equipo', 'Resumen temporada', 'Instrucciones'] as const;
export const ROSTER_HEADERS = 'Nº|Jugador (apodo)|Nombre completo|Posición habitual|Grupo|Año nac.|Cumpleaños|Elegible prima portería a cero|Notas'.split('|');
export const MATCH_HEADERS = 'Jornada|Fecha|Local / Visitante|Rival|Goles Inspire|Goles rival|Marcador (Inspire-rival)|Resultado|Portería a cero|Campo|Acta FCF|Entrenador|MVP (según datos)|Motivo MVP|Notas|Se cobran primas'.split('|');
export const PLAYER_HEADERS = 'Jornada|Rival|Nº|Jugador|Pos. habitual|Grupo|Perfil Veo usado|Convocado|Titular|Min FCF|Min Veo|Min usados|Jugó|Goles|Asistencias|Amarillas|Rojas|Distancia (km)|Vel. media (km/h)|Vel. máx (km/h)|Sprints|Carreras alta intensidad|Eventos totales|Tiros|Ocasiones|Entradas|Córners|Lanz. de falta|Saques de banda|Faltas cometidas|Penaltis|Saques de puerta|Pases|Pases exitosos|Pases fallidos|% pase|Regates|Intercepciones|Recuperaciones|Duelos|Paradas|Índice rendimiento|Elegible P0|P0 equipo|Cobra P0|P0 previas|€ Portería 0|Goles previos|€ Goles|Asist. previas|€ Asistencias|€ Total partido|Notas'.split('|');
export const TEAM_PAIRS = [
  ['F', 'G', 'Goles (acta)', 'goals'], ['H', 'I', 'Tiros', 'shots'],
  ['J', 'K', 'Intentos totales', 'attempts'], ['L', 'M', 'Conversión', 'conversion'],
  ['N', 'O', 'Posesión', 'possession'], ['P', 'Q', 'Pases', 'passes'],
  ['R', 'S', 'Pases buenos', 'successfulPasses'], ['T', 'U', '% pase', 'passingRate'],
  ['V', 'W', 'Córners', 'corners'], ['X', 'Y', 'Faltas lanzadas', 'freeKicks'],
  ['Z', 'AA', 'Saques de banda', 'throwIns'], ['AB', 'AC', 'Faltas cometidas', 'fouls'],
] as const;
export const SUMMARY_PAIRS = [
  ['J', 'K', 'Goles', 'goals'], ['L', 'M', 'Asistencias', 'assists'],
  ['N', 'O', 'Distancia (km)', 'distanceKm'], ['P', 'Q', 'Sprints', 'sprints'],
  ['R', 'S', 'Carreras alta int.', 'highIntensityRuns'], ['T', 'U', 'Tiros', 'shots'],
  ['V', 'W', 'Ocasiones', 'chances'], ['X', 'Y', 'Entradas', 'tackles'],
  ['Z', 'AA', 'Intercepciones', 'interceptions'], ['AB', 'AC', 'Recuperaciones', 'recoveries'],
  ['AD', 'AE', 'Regates', 'dribbles'], ['AF', 'AG', 'Duelos', 'duels'],
  ['AH', 'AI', 'Paradas', 'saves'], ['AJ', 'AK', 'Pases', 'passes'],
  ['AL', 'AM', 'Faltas cometidas', 'fouls'],
] as const;
export const PLAYER_SOURCE_COLUMNS = ['A', 'C', 'G', 'H', 'I', 'J', 'K', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'AA', 'AB', 'AC', 'AD', 'AE', 'AF', 'AG', 'AH', 'AK', 'AL', 'AM', 'AN', 'AO', 'BA'];
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_SHEET_ROWS = 5000;
export const MAX_SHEET_COLUMNS = 64;

export const METRIC_LABELS: Record<string, string> = {
  goals: 'Goles', assists: 'Asistencias', yellowCards: 'Amarillas', redCards: 'Rojas',
  distanceKm: 'Distancia (km)', averageSpeedKmh: 'Velocidad media (km/h)', maxSpeedKmh: 'Velocidad máxima (km/h)',
  sprints: 'Sprints', highIntensityRuns: 'Carreras de alta intensidad', totalEvents: 'Eventos totales',
  shots: 'Tiros', chances: 'Ocasiones', tackles: 'Entradas', corners: 'Córners',
  freeKicks: 'Lanzamientos de falta', throwIns: 'Saques de banda', fouls: 'Faltas cometidas',
  penalties: 'Penaltis', goalKicks: 'Saques de puerta', passes: 'Pases',
  successfulPasses: 'Pases exitosos', failedPasses: 'Pases fallidos', dribbles: 'Regates',
  interceptions: 'Intercepciones', recoveries: 'Recuperaciones', duels: 'Duelos', saves: 'Paradas',
  attempts: 'Intentos totales', possession: 'Posesión', conversion: 'Conversión', passingRate: 'Precisión de pase',
};

export function normalizeIdentity(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
