/**
 * Por dónde nos escribe alguien que perdió su código.
 *
 * **Está vacío a propósito. Poné acá tu Discord o tu correo.** Mientras siga
 * vacío, el bloque de "¿perdiste tu código?" no se muestra: prometer un canal
 * que no existe es peor que no mencionarlo — la persona escribiría al vacío y
 * se quedaría esperando.
 *
 * El sitio nunca tuvo un contacto público porque el flujo va al revés: la
 * persona deja el suyo al pedir la ficha y nosotros le escribimos. Recuperar el
 * código es el primer caso en que hace falta la dirección contraria.
 *
 * Va acá y no en una variable de entorno porque es texto público que se lee en
 * la página, no un secreto: en un env sería un valor más que se puede olvidar
 * de configurar en un deploy y que rompería la página en silencio.
 */
export const SITE_CONTACT = "";
