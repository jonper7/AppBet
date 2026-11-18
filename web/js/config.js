/* config.js — constantes de la interfaz (los parámetros de reglas viven en la base, no aquí). */
const CONFIG = {
  VERSION: '1.4.0',
  MERCADOS: ['1X2', 'doble oportunidad', 'goles', 'BTTS', 'córners', 'tiros', 'otro'],
  // Guía por mercado: opciones de «Selección», si pide línea (con ejemplo) y una ayuda breve
  MERCADOS_GUIA: {
    '1X2': { opciones: ['Local', 'Empate', 'Visitante'], ayuda: 'Quién gana: Local, Empate o Visitante.' },
    'doble oportunidad': { opciones: ['1X', 'X2', '12'], ayuda: '1X = local o empate · X2 = empate o visitante · 12 = no hay empate.' },
    'goles': { opciones: ['Más de', 'Menos de'], linea: '2.5', ayuda: 'Total de goles del partido frente a la línea (ej. Más de 2.5).' },
    'BTTS': { opciones: ['Sí', 'No'], ayuda: '¿Marcan los dos equipos?' },
    'córners': { opciones: ['Más de', 'Menos de'], linea: '9.5', ayuda: 'Total de córners frente a la línea (ej. Más de 9.5).' },
    'tiros': { opciones: ['Más de', 'Menos de'], linea: '8.5', ayuda: 'Total de tiros frente a la línea (ej. Más de 8.5).' },
    'otro': { opciones: null, ayuda: 'Escribe tu apuesta con tus palabras (ej. Haaland marca).' },
  },
  FUENTES: ['análisis propio', 'Claude', 'tipster', 'intuición'],
  EMOCIONES: ['tranquilo', 'aburrido', 'tras pérdida', 'otro'],
  ESTADOS: ['pendiente', 'ganada', 'perdida', 'anulada', 'cashout'],
  MESES: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
  MESES_LARGOS: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
  TIEMPO_DESHACER_MS: 6000,
};
