/* config.js — constantes de la interfaz (los parámetros de reglas viven en la base, no aquí). */
const CONFIG = {
  VERSION: '1.1.0-fase2',
  MERCADOS: ['1X2', 'doble oportunidad', 'goles', 'BTTS', 'córners', 'tiros', 'otro'],
  FUENTES: ['análisis propio', 'Claude', 'tipster', 'intuición'],
  EMOCIONES: ['tranquilo', 'aburrido', 'tras pérdida', 'otro'],
  ESTADOS: ['pendiente', 'ganada', 'perdida', 'anulada', 'cashout'],
  MESES: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
  MESES_LARGOS: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
  TIEMPO_DESHACER_MS: 6000,
};
