/*
 * LAMBERT-93 : LA PROJECTION DANS LAQUELLE UN PLAN FRANCAIS SE MESURE.
 *
 * POURQUOI PROJETER PLUTOT QUE MESURER SUR LA SPHERE. Le site sert deja une
 * projection equirectangulaire locale (`carte.ts`) pour DESSINER : elle suffit
 * a poser des traits, elle ne suffit pas a ecrire « 12,36 m » sous un cote. Une
 * cote imprimee est un chiffre que le lecteur va comparer a son metre ruban, et
 * le Lambert-93 (EPSG:2154) est la projection legale francaise - celle dans
 * laquelle le cadastre lui-meme est calcule.
 *
 * CONTROLEE CONTRE L'IGN, PAS CONTRE UNE VALEUR DE MEMOIRE. Premier controle
 * du 2026-09-06 : un point de reference tire de ma tete donnait 400 m d'ecart,
 * ce qui ne prouvait rien puisque la reference elle-meme etait douteuse. Le
 * controle qui tranche est de demander a l'IGN LA MEME PARCELLE en EPSG:2154
 * (`CADASTRALPARCELS.PARCELLAIRE_EXPRESS:parcelle`, `SRSNAME=EPSG:2154`) et de
 * comparer sommet a sommet : 5 mm d'ecart maximum sur les seize sommets de la
 * parcelle AB 13 a Muret. Le test de ce module rejoue ce controle sur des
 * valeurs figees.
 *
 * ET L'AIRE SE CONTROLE PAR UN SECOND CHEMIN. La meme parcelle, calculee sans
 * aucune projection (aire geodesique sur l'ellipsoide), rend 3 882,9 m2 contre
 * 3 884,8 m2 en Lambert-93 : 0,05 % d'ecart entre deux methodes independantes.
 * C'est ce qui permet d'affirmer que l'ecart de 0,85 % avec la contenance
 * cadastrale vient du CADASTRE, et pas de nous.
 *
 *
 * VENU D EDIFIABLE, ou il est en production depuis le 2026-09-06. Les deux
 * sites mesurent la meme chose sur les memes parcelles : ce fichier et
 * `cotes.ts` sont les DEUX premiers morceaux du composant de plan partage, et
 * ils sont volontairement identiques a la ligne pres pour que l extraction soit
 * une suppression, pas une reecriture.
 *
 * Parametres : IGN, notice NTG-71, RGF93 / Lambert-93.
 */

/** Un point en degres decimaux, ordre GeoJSON : longitude puis latitude. */
export type PointWGS84 = readonly [number, number];
/** Un point en metres, Lambert-93. L'axe des Y monte vers le nord. */
export type PointL93 = readonly [number, number];

const E = 0.0818191910428158;
const N = 0.725607765053267;
const C = 11754255.426096;
const XS = 700000.0;
const YS = 12655612.049876;
const LON0 = 3;
const rad = (d: number): number => (d * Math.PI) / 180;

/** Un point WGS84 en Lambert-93, en metres. */
export function enLambert93([lon, lat]: PointWGS84): PointL93 {
	const phi = rad(lat);
	const sin = Math.sin(phi);
	const latIso = Math.log(
		Math.tan(Math.PI / 4 + phi / 2) * ((1 - E * sin) / (1 + E * sin)) ** (E / 2)
	);
	const r = C * Math.exp(-N * latIso);
	const gamma = N * (rad(lon) - rad(LON0));
	return [XS + r * Math.sin(gamma), YS - r * Math.cos(gamma)];
}

/** La distance entre deux points projetes, en metres. */
export const distance = (a: PointL93, b: PointL93): number => Math.hypot(b[0] - a[0], b[1] - a[1]);

/**
 * L'aire d'un anneau ferme, en metres carres, par la formule du lacet.
 *
 * Le signe est jete : l'orientation d'un anneau du cadastre n'est pas garantie,
 * et une aire negative se lirait comme une erreur de lecture.
 */
export function aire(anneau: readonly PointL93[]): number {
	let somme = 0;
	for (let i = 0; i < anneau.length - 1; i++) {
		const a = anneau[i] as PointL93;
		const b = anneau[i + 1] as PointL93;
		somme += a[0] * b[1] - b[0] * a[1];
	}
	return Math.abs(somme) / 2;
}

/**
 * Vrai quand l'anneau est parcouru dans le sens des aiguilles d'une montre,
 * dans un repere ou Y monte.
 *
 * CE N'EST PAS UN DETAIL DE STYLE : c'est ce qui donne la normale SORTANTE d'un
 * cote, donc de quel cote poser une cote et de quel cote chercher la rue.
 * Pose a l'envers le 2026-09-06, les cotes se dessinaient A L'INTERIEUR de la
 * parcelle, par-dessus le bati.
 */
export function estHoraire(anneau: readonly PointL93[]): boolean {
	let somme = 0;
	for (let i = 0; i < anneau.length - 1; i++) {
		const a = anneau[i] as PointL93;
		const b = anneau[i + 1] as PointL93;
		somme += (b[0] - a[0]) * (b[1] + a[1]);
	}
	return somme > 0;
}

/** La normale sortante du cote `a -> b`, unitaire, pour un anneau donne. */
export function normaleSortante(a: PointL93, b: PointL93, horaire: boolean): PointL93 {
	const l = distance(a, b);
	if (l === 0) return [0, 0];
	const ux = (b[0] - a[0]) / l;
	const uy = (b[1] - a[1]) / l;
	return horaire ? [-uy, ux] : [uy, -ux];
}

/** La distance d'un point au segment `[a, b]`, en metres. */
export function auSegment(p: PointL93, a: PointL93, b: PointL93): number {
	const dx = b[0] - a[0];
	const dy = b[1] - a[1];
	const l2 = dx * dx + dy * dy;
	const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
	return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** La distance d'un point a une polyligne ouverte. */
export function aLaLigne(p: PointL93, ligne: readonly PointL93[]): number {
	let d = Infinity;
	for (let i = 0; i < ligne.length - 1; i++) {
		d = Math.min(d, auSegment(p, ligne[i] as PointL93, ligne[i + 1] as PointL93));
	}
	return d;
}

/** La distance d'un point au CONTOUR d'un anneau ferme (pas a son interieur). */
export const auContour = (p: PointL93, anneau: readonly PointL93[]): number => aLaLigne(p, anneau);

/** Un point est-il dans l'anneau : lancer de rayon vers la droite. */
export function dansLAnneau(p: PointL93, anneau: readonly PointL93[]): boolean {
	let dedans = false;
	for (let i = 0, j = anneau.length - 2; i < anneau.length - 1; j = i++) {
		const [xi, yi] = anneau[i] as PointL93;
		const [xj, yj] = anneau[j] as PointL93;
		if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi)
			dedans = !dedans;
	}
	return dedans;
}

/** Les points d'echantillonnage d'un segment, un tous les `pas` metres au plus. */
export function echantillonner(a: PointL93, b: PointL93, pas = 1.5): PointL93[] {
	const n = Math.max(2, Math.ceil(distance(a, b) / pas));
	const pts: PointL93[] = [];
	for (let i = 0; i <= n; i++) {
		const t = i / n;
		pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
	}
	return pts;
}
