/* Typen voor de proefbestandsbouwer. Het script zelf is gewoon JavaScript —
   het draait ook los met node — maar de tests importeren het, en dan wil
   TypeScript weten wat eruit komt. */
export function maakXlsx(rijen: Array<Array<string | number>>): Uint8Array;
export function zip(bestanden: Array<{ naam: string; inhoud: string }>): Uint8Array;
export function blad(rijen: Array<Array<string | number>>): { sheet: string; shared: string };
export const RAPPORT_05: Array<Array<string | number>>;
