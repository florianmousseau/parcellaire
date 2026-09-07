/*
 * CE QUE LE PLAN MONTRE : UN CENTRE ET UN NIVEAU, ET LES DEUX SONT DANS L'URL.
 *
 * ============================================================================
 * POURQUOI ZOOMER PAR L'ADRESSE PLUTOT QUE PAR LE NAVIGATEUR
 * ============================================================================
 *
 * Agrandir en JavaScript est facile : on change le `viewBox` et c'est fini.
 * Mais l'image de fond a ete demandee POUR UN CADRE, a une taille donnee ;
 * l'etirer rend une photo floue et un plan IGN illisible, et deplacer au-dela
 * du cadre ne montre rien, puisque rien n'a ete charge dehors. Un plan qui
 * grossit en perdant sa finesse n'est pas un plan qu'on agrandit.
 *
 * Le zoom passe donc par le SERVEUR : chaque niveau redemande le fond a sa
 * resolution, et les parcelles du nouveau cadre. Ce qui coute un aller-retour
 * rapporte trois choses qu'aucune carte glissante ne donne - chaque vue a une
 * ADRESSE, donc un retour arriere, un signet et un partage ; la page marche
 * sans une ligne de JavaScript ; et le fond est toujours net.
 *
 * ============================================================================
 * LES NIVEAUX SONT UNE ECHELLE, PAS UNE PUISSANCE DE DEUX
 * ============================================================================
 *
 * Ils se lisent en DEMI-LARGEUR au sol, en metres, parce que c'est ce que le
 * lecteur voit : 25 m montre une maison et ses murs, 800 m montre un quartier.
 * Les pas doublent, ce qui donne au clic la meme sensation qu'une molette, et
 * la borne haute s'arrete la ou le plan cadastral cesse d'etre lisible.
 */

/** Les demi-largeurs offertes, en metres, du plus large au plus serre. */
export const NIVEAUX: readonly number[] = [1600, 800, 400, 200, 100, 50, 25];

const METRES_PAR_DEGRE_LAT = 111_320;

export interface Vue {
	readonly lon: number;
	readonly lat: number;
	/** Le rang dans `NIVEAUX`. */
	readonly niveau: number;
}

const borne = (n: number): number => Math.min(NIVEAUX.length - 1, Math.max(0, n));

/**
 * Le niveau qui contient une etendue donnee, en metres.
 *
 * Le plus SERRE des niveaux qui la contient encore : la parcelle doit remplir
 * le cadre, pas s'y perdre. Une etendue plus large que le premier niveau
 * retombe dessus plutot que d'etre coupee.
 */
export function niveauParDefaut(demiLargeurMetres: number): number {
	const rang = NIVEAUX.findLastIndex((m) => m >= demiLargeurMetres);
	return rang === -1 ? 0 : rang;
}

/** La demi-largeur du cadre, en degres de LONGITUDE, a cette latitude. */
export function rayonDegres(niveau: number, lat: number): number {
	const metres = NIVEAUX[borne(niveau)] ?? 200;
	const kx = Math.cos((lat * Math.PI) / 180);
	// Sous les poles kx tend vers zero ; la France n'y va pas, mais une division
	// par zero rendrait un cadre infini plutot qu'une page.
	return metres / (METRES_PAR_DEGRE_LAT * Math.max(kx, 0.1));
}

/**
 * La vue demandee par l'URL, ou celle par defaut.
 *
 * Un parametre illisible ne fait jamais d'erreur : il retombe sur le defaut.
 * `?c=` vient d'un lien recopie a la main aussi souvent que d'un de nos boutons.
 */
export function vueDemandee(params: URLSearchParams, defaut: Vue): Vue {
	const centre = (params.get('c') ?? '').split(',').map(Number);
	const lon = centre[0];
	const lat = centre[1];
	const bonCentre =
		centre.length === 2 &&
		typeof lon === 'number' &&
		typeof lat === 'number' &&
		Number.isFinite(lon) &&
		Number.isFinite(lat) &&
		Math.abs(lon) <= 180 &&
		Math.abs(lat) <= 90;
	/*
	 * UN PARAMETRE ABSENT N'EST PAS UN ZERO, et c'est le defaut qui a ete servi
	 * en premier : `Number(null)` vaut 0, `Number.isInteger(0)` est vrai, et la
	 * page s'ouvrait au niveau le plus LARGE - 1 600 m - au lieu du cadre calcule
	 * sur la parcelle. Il faut donc lire la PRESENCE avant la valeur.
	 */
	const brut = params.get('z');
	const demande = brut === null || brut === '' ? Number.NaN : Number(brut);
	const niveau = Number.isInteger(demande) ? borne(demande) : defaut.niveau;
	return bonCentre ? { lon, lat, niveau } : { ...defaut, niveau };
}

export type Direction = 'nord' | 'sud' | 'est' | 'ouest';

/**
 * La vue deplacee d'un demi-cadre.
 *
 * UN DEMI-CADRE, PAS UN CADRE ENTIER : d'un bond complet, le lecteur perd ce
 * qu'il regardait et ne sait plus ou il est. La moitie garde un recouvrement.
 */
export function deplacee(vue: Vue, vers: Direction): Vue {
	const pas = rayonDegres(vue.niveau, vue.lat);
	if (vers === 'est') return { ...vue, lon: vue.lon + pas };
	if (vers === 'ouest') return { ...vue, lon: vue.lon - pas };
	// Le cadre est plus large que haut : le pas vertical suit cette proportion.
	const vertical = pas * 0.66;
	return vers === 'nord'
		? { ...vue, lat: vue.lat + vertical }
		: { ...vue, lat: vue.lat - vertical };
}

/** La vue d'un cran plus serree (`1`) ou plus large (`-1`). */
export function zoomee(vue: Vue, sens: 1 | -1): Vue {
	return { ...vue, niveau: borne(vue.niveau + sens) };
}

export const auBout = (vue: Vue, sens: 1 | -1): boolean =>
	sens === 1 ? vue.niveau >= NIVEAUX.length - 1 : vue.niveau <= 0;

/**
 * Ce que la vue ajoute a une adresse, ou la chaine vide quand elle est celle
 * par defaut.
 *
 * UNE ADRESSE PAR VUE, ET UNE SEULE : la vue de depart n'ecrit rien, sinon la
 * meme page aurait deux adresses - celle sans parametres et celle qui les
 * repete - et c'est exactement ce qu'une canonique existe pour empecher.
 */
export function enParametres(vue: Vue, defaut: Vue): string {
	const morceaux: string[] = [];
	const memeCentre = Math.abs(vue.lon - defaut.lon) < 1e-7 && Math.abs(vue.lat - defaut.lat) < 1e-7;
	if (!memeCentre) morceaux.push(`c=${vue.lon.toFixed(6)},${vue.lat.toFixed(6)}`);
	if (vue.niveau !== defaut.niveau) morceaux.push(`z=${String(vue.niveau)}`);
	return morceaux.join('&');
}
