/*
 * CE QUE LE TERRAIN MESURE, ET DE QUEL COTE EST LA RUE.
 *
 * VENU D EDIFIABLE, ou il tourne en production depuis le 2026-09-06, et porte
 * ici a la ligne pres : avec `lambert.ts`, c est le second morceau du composant
 * de plan partage, et l extraction doit etre une SUPPRESSION, pas une
 * reecriture. Ce qui suit est le raisonnement mesure la-bas, garde tel quel
 * parce que c est lui qui vaut, pas le code.
 *
 * Ce module ne lit rien : il recoit des geometries et rend des NOMBRES. C est
 * ce qui le rend testable, et ce qui rend le dessin secondaire.
 *
 * TROUVER LA RUE A COUTE TROIS MESURES, ET LES DEUX PREMIERES SONT FAUSSES.
 *
 * 1. LA DISTANCE A L AXE DE CHAUSSEE NE SEPARE RIEN. Sur dix parcelles, 95
 *    cotes, la distribution va de 2,3 m a 196 m SANS CREUX : une petite
 *    parcelle a tous ses cotes pres d une voie, une grande n en a aucun. Un
 *    seuil pose la-dessus aurait dessine des reculs faux.
 *
 * 2. « UN COTE NON PARTAGE DONNE SUR LE DOMAINE PUBLIC » RATE LES LOTISSEMENTS.
 *    Le cadastre pave le plan : un cote partage avec une autre parcelle est une
 *    limite separative, ce qui semblait decisif. Mais une voie de lotissement
 *    APPARTIENT a l association qui la gere, donc elle porte un numero de
 *    parcelle. Vu en DESSINANT la parcelle AD 101 a Muret : ses huit cotes
 *    sortaient « separative » alors que la rue longe son cote nord a 3,6 m.
 *    Trouve a l oeil, jamais en relisant le code.
 *
 * 3. CE QUI TRANCHE EST LE COTE OU SE TROUVE LA VOIE. Une voie DEVANT un cote
 *    est une facade sur rue ; la meme voie derriere ne l est pas. On pousse
 *    donc chaque point du cote de 50 cm vers l exterieur et de 50 cm vers
 *    l interieur, et on ne retient la voie que si elle est plus proche du point
 *    du dehors. Une fois ce filtre pose, la distribution se coupe : 25 cotes
 *    entre 2 et 6 m, un creux a 6-8 m, puis la longue traine.
 *
 * LE SEUIL SE DERIVE DE LA CHAUSSEE ELLE-MEME, pas d une constante. La BD TOPO
 * donne `largeur_de_chaussee` et rend l AXE : une limite qui longe la rue est
 * donc a une demi-largeur, plus le trottoir et l accotement. D ou
 * `largeur / 2 + MARGE_DE_BORD`, ce qui tombe sur le creux mesure.
 *
 * ET CE MODULE NE REND PAS UN VERDICT JURIDIQUE. Il rend une mesure, avec sa
 * distance, pour que le lecteur puisse la contredire en regardant son terrain.
 */

import {
	aire,
	auContour,
	aLaLigne,
	distance,
	echantillonner,
	estHoraire,
	normaleSortante,
	type PointL93
} from './lambert.ts';

/** Ce qu'un cote de parcelle donne sur. Trois etats, comme partout ici. */
export type NatureDeLimite = 'sur-voie' | 'separative' | 'indeterminee';

export interface Voie {
	/** L'axe de la chaussee, une ou plusieurs polylignes. */
	readonly lignes: readonly (readonly PointL93[])[];
	/** La largeur de chaussee declaree par la BD TOPO, ou `null`. */
	readonly largeur: number | null;
	readonly nom: string | null;
}

export interface Cote {
	/** Le rang du cote dans l'anneau : il sert d'ancre a l'ecran. */
	readonly rang: number;
	readonly a: PointL93;
	readonly b: PointL93;
	readonly longueur: number;
	/** La normale unitaire qui sort de la parcelle. */
	readonly dehors: PointL93;
	readonly nature: NatureDeLimite;
	/** La distance mediane a l'axe de la voie qui est DEVANT, ou `null`. */
	readonly aLAxe: number | null;
	/** Le nom de cette voie, quand la BD TOPO en donne un. */
	readonly voie: string | null;
	/** La part du cote que longe une parcelle voisine, de 0 a 1. */
	readonly partagee: number;
}

/**
 * Ce qu'on ajoute a la demi-chaussee pour atteindre la limite de propriete.
 *
 * Trottoir, accotement, fosse. Quatre metres couvre le creux mesure le
 * 2026-09-06 entre les cotes qui longent la rue (2 a 6 m de l'axe) et les
 * autres (8 m et au-dela). A rederiver si le corpus change de nature : une
 * mesure faite sur douze parcelles d'une seule commune n'est pas une loi.
 */
export const MARGE_DE_BORD = 4;

/** La largeur retenue quand la BD TOPO n'en declare pas : une voie communale. */
export const LARGEUR_PAR_DEFAUT = 5;

/** Un cote plus court que ca ne se cote pas : le chiffre serait illisible. */
export const COTE_MINIMALE = 1.2;

/** La part d'un cote qu'une voisine doit longer pour en faire une separative. */
const PART_SEPARATIVE = 0.7;

/** Deux parcelles voisines partagent le meme trait, a la tolerance du plan. */
const TOLERANCE_DE_TRAIT = 0.5;

/**
 * De combien on pousse un point pour savoir de quel cote de la limite on est.
 *
 * Assez pour que le classement ne depende pas du bruit du trait cadastral,
 * assez peu pour ne pas traverser un cote court. Elle ne sert QU'AU TEST : la
 * distance affichee, elle, se mesure depuis la limite.
 */
const SONDE = 0.5;

const mediane = (v: readonly number[]): number => {
	const t = [...v].sort((x, y) => x - y);
	return t[Math.floor(t.length / 2)] ?? Infinity;
};

const auxLignes = (p: PointL93, lignes: readonly (readonly PointL93[])[]): number => {
	let d = Infinity;
	for (const l of lignes) d = Math.min(d, aLaLigne(p, l));
	return d;
};

/**
 * La voie qui est DEVANT ce cote, et a quelle distance.
 *
 * Le test du dehors est ce qui separe une facade sur rue d'un fond de parcelle
 * qui tourne le dos a la meme rue. Sans lui, une parcelle d'angle voyait sa
 * limite arriere classee sur voie.
 */
function voieDevant(
	a: PointL93,
	b: PointL93,
	dehors: PointL93,
	voies: readonly Voie[]
): { distance: number; voie: Voie } | null {
	const points = echantillonner(a, b);
	let meilleure: { distance: number; voie: Voie } | null = null;
	for (const v of voies) {
		const auDehors = mediane(
			points.map((p) => auxLignes([p[0] + dehors[0] * SONDE, p[1] + dehors[1] * SONDE], v.lignes))
		);
		const auDedans = mediane(
			points.map((p) => auxLignes([p[0] - dehors[0] * SONDE, p[1] - dehors[1] * SONDE], v.lignes))
		);
		if (auDehors >= auDedans) continue;
		/*
		 * LA DISTANCE RENDUE SE MESURE DEPUIS LA LIMITE, PAS DEPUIS LA SONDE.
		 *
		 * Les deux points pousses servent a savoir DE QUEL COTE est la voie ; les
		 * garder pour le chiffre le biaisait de la longueur de la sonde. Trouve
		 * par le test : une rue posee a 5,00 m de la limite s'affichait a 4,50 m,
		 * et c'est un nombre que le lecteur va comparer a son metre.
		 */
		const depuisLaLimite = mediane(points.map((p) => auxLignes(p, v.lignes)));
		if (meilleure === null || depuisLaLimite < meilleure.distance) {
			meilleure = { distance: depuisLaLimite, voie: v };
		}
	}
	return meilleure;
}

/** La part du cote que longe au moins une parcelle voisine. */
function partPartagee(
	a: PointL93,
	b: PointL93,
	voisines: readonly (readonly PointL93[])[]
): number {
	if (voisines.length === 0) return 0;
	const points = echantillonner(a, b);
	const touches = points.filter(
		(p) => Math.min(...voisines.map((v) => auContour(p, v))) <= TOLERANCE_DE_TRAIT
	).length;
	return touches / points.length;
}

/**
 * Les cotes de la parcelle, mesures et classes.
 *
 * Les cotes de moins de `COTE_MINIMALE` sont ecartes : ce sont les biseaux
 * d'angle du plan cadastral, ils ne portent pas de regle et leur cote se
 * chevaucherait avec ses voisines.
 */
export function cotesDeLaParcelle(
	anneau: readonly PointL93[],
	voies: readonly Voie[],
	voisines: readonly (readonly PointL93[])[]
): readonly Cote[] {
	const horaire = estHoraire(anneau);
	const cotes: Cote[] = [];
	for (let i = 0; i < anneau.length - 1; i++) {
		const a = anneau[i] as PointL93;
		const b = anneau[i + 1] as PointL93;
		const longueur = distance(a, b);
		if (longueur < COTE_MINIMALE) continue;
		const dehors = normaleSortante(a, b, horaire);
		const devant = voieDevant(a, b, dehors, voies);
		const partagee = partPartagee(a, b, voisines);
		const seuil = (devant?.voie.largeur ?? LARGEUR_PAR_DEFAUT) / 2 + MARGE_DE_BORD;

		let nature: NatureDeLimite;
		if (devant !== null && devant.distance <= seuil) nature = 'sur-voie';
		else if (partagee >= PART_SEPARATIVE) nature = 'separative';
		else nature = 'indeterminee';

		cotes.push({
			rang: i,
			a,
			b,
			longueur,
			dehors,
			nature,
			aLAxe: devant?.distance ?? null,
			voie: devant?.voie.nom ?? null,
			partagee
		});
	}
	return cotes;
}

/** Ce que le contour d'une parcelle mesure, une fois ses cotes poses. */
export interface Mesures {
	readonly cotes: readonly Cote[];
	/** La somme des cotes retenus, en metres. */
	readonly perimetre: number;
	/** L'aire du contour cadastral, en metres carres. */
	readonly aire: number;
	/**
	 * L'ECART AVEC LA CONTENANCE, ET POURQUOI IL SE PUBLIE.
	 *
	 * La contenance est une surface FISCALE, arrondie, parfois vieille de
	 * decennies ; l'aire du contour est mesuree sur le trait d'aujourd'hui. Les
	 * deux different, et c'est la question que le public pose tous les jours.
	 * L'afficher vaut mieux que choisir laquelle des deux on cache.
	 */
	readonly ecart: number | null;
	readonly surVoie: number;
	readonly separatives: number;
	readonly indeterminees: number;
}

/**
 * Les mesures du contour, cotes compris.
 *
 * `contenance` est celle du cadastre, en metres carres, ou `null` quand la
 * source ne l'a pas donnee.
 */
export function mesurerLeContour(
	anneau: readonly PointL93[],
	voies: readonly Voie[],
	voisines: readonly (readonly PointL93[])[],
	contenance: number | null
): Mesures {
	const cotes = cotesDeLaParcelle(anneau, voies, voisines);
	const surface = Math.round(aire(anneau));
	return {
		cotes,
		perimetre: Number(cotes.reduce((n, c) => n + c.longueur, 0).toFixed(1)),
		aire: surface,
		ecart: contenance === null ? null : surface - contenance,
		surVoie: cotes.filter((c) => c.nature === 'sur-voie').length,
		separatives: cotes.filter((c) => c.nature === 'separative').length,
		indeterminees: cotes.filter((c) => c.nature === 'indeterminee').length
	};
}
