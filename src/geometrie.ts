/*
 * La lecture d'une geometrie GeoJSON, faite UNE fois.
 *
 * Trois sources rendent des polygones a ce site - le cadastre, le bati, le
 * zonage - et chacune melange `Polygon` et `MultiPolygon` pour une meme couche.
 * Une deuxieme copie de cette lecture est exactement l'endroit ou l'une des
 * trois cessera un jour de gerer les trous, ou de filtrer les anneaux trop
 * courts, sans que personne ne s'en apercoive.
 */

/** Un anneau ferme, en degres, dans l'ordre GeoJSON `[longitude, latitude]`. */
export type Anneau = readonly (readonly [number, number])[];

/** Un contour complet : son anneau exterieur, et ses trous s'il en a. */
export type Contour = readonly Anneau[];

interface Geometrie {
	type?: unknown;
	coordinates?: unknown;
}

/**
 * Les anneaux d'une geometrie, `Polygon` ou `MultiPolygon`.
 *
 * Les anneaux interieurs sont GARDES : une parcelle peut porter un trou, et le
 * dessiner plein la ferait deborder sur sa voisine. Un anneau de moins de trois
 * sommets est ecarte, parce qu'il ne dessine rien et fait un chemin SVG qui ne
 * ferme pas.
 */
export function anneauxDe(geometrie: Geometrie | null | undefined): Contour {
	const c = geometrie?.coordinates;
	if (!Array.isArray(c)) return [];
	const plats = geometrie?.type === 'MultiPolygon' ? c.flat() : c;
	return (plats as unknown[])
		.filter((anneau): anneau is unknown[] => Array.isArray(anneau))
		.map((anneau) =>
			anneau.filter(
				(p): p is [number, number] =>
					Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number'
			)
		)
		.filter((anneau) => anneau.length >= 3);
}

/** Un degre de latitude, en metres. La longitude se corrige par `kx`. */
const METRES_PAR_DEGRE = 111_320;

/**
 * Le point tombe-t-il DANS le contour ?
 *
 * Regle PAIR-IMPAIR sur tous les anneaux a la fois, et c'est ce que la forme de
 * `Contour` impose : `anneauxDe` aplatit un `MultiPolygon`, donc rien ici ne
 * distingue un anneau exterieur d'un trou. Compter les traversees de tous les
 * anneaux ensemble rend quand meme la bonne reponse - un point dans un trou en
 * traverse un nombre pair et ressort dehors, ce qui est juste.
 */
export function contient(contour: Contour, lon: number, lat: number): boolean {
	let dedans = false;
	for (const anneau of contour) {
		for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i++) {
			const a = anneau[i];
			const b = anneau[j];
			if (a === undefined || b === undefined) continue;
			const traverse = a[1] > lat !== b[1] > lat;
			if (traverse && lon < ((b[0] - a[0]) * (lat - a[1])) / (b[1] - a[1]) + a[0]) dedans = !dedans;
		}
	}
	return dedans;
}

/* La distance d'un point a un segment, dans un plan local en metres. */
function auSegment(
	px: number,
	py: number,
	a: readonly [number, number],
	b: readonly [number, number],
	kx: number
): number {
	const qx = (px - a[0]) * kx;
	const qy = py - a[1];
	const dx = (b[0] - a[0]) * kx;
	const dy = b[1] - a[1];
	const l2 = dx * dx + dy * dy;
	const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, (qx * dx + qy * dy) / l2));
	return Math.hypot(qx - t * dx, qy - t * dy);
}

/**
 * La distance du point au BORD du contour, en metres.
 *
 * C'EST LA MESURE QUI DIT « LA PLUS PROCHE », ET LE CENTRE NE LA REMPLACE PAS.
 * Mesure du 2026-09-06 au 60 rue Pasteur a Vitry : la parcelle E 107 touche
 * l'adresse a 1 m et son centre est a 27 m, la voisine E 185 est a 3 m et son
 * centre a 16 m. Comparer les centres elit donc la PETITE parcelle d'a cote
 * contre celle qui porte le batiment. Sur quatre numeros de cette seule voie,
 * la parcelle servie n'etait pas la plus proche.
 *
 * La longitude est projetee avant la mesure : un degre vaut 73 m a Paris et
 * 111 m a l'equateur, et l'ignorer etire toutes les distances est-ouest.
 */
export function distanceAuBord(contour: Contour, lon: number, lat: number): number {
	const kx = Math.cos((lat * Math.PI) / 180);
	let plusCourt = Infinity;
	for (const anneau of contour) {
		for (let i = 1; i < anneau.length; i++) {
			const a = anneau[i - 1];
			const b = anneau[i];
			if (a === undefined || b === undefined) continue;
			plusCourt = Math.min(plusCourt, auSegment(lon, lat, a, b, kx));
		}
	}
	return plusCourt * METRES_PAR_DEGRE;
}

/** Le centre d'un contour, moyenne de ses sommets. Suffisant pour une distance. */
export function centreDe(contour: Contour): { lon: number; lat: number } | null {
	const points = contour.flat();
	if (points.length === 0) return null;
	const somme = points.reduce((s, [lon, lat]) => ({ lon: s.lon + lon, lat: s.lat + lat }), {
		lon: 0,
		lat: 0
	});
	return { lon: somme.lon / points.length, lat: somme.lat / points.length };
}
