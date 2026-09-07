import test from 'node:test';
import assert from 'node:assert/strict';
import {
	enLambert93,
	aire,
	distance,
	estHoraire,
	normaleSortante,
	dansLAnneau,
	auSegment,
	echantillonner,
	type PointL93,
	type PointWGS84
} from './lambert.ts';

/*
 * LE CONTROLE QUI TRANCHE : LA MEME PARCELLE, PROJETEE PAR L'IGN.
 *
 * Les seize sommets de la parcelle AB 13 a Muret, releves le 2026-09-06 :
 * a gauche ce que l'API du cadastre rend en WGS84, a droite ce que le WFS de la
 * Geoplateforme rend pour la MEME parcelle avec `SRSNAME=EPSG:2154`. Si notre
 * projection est bonne, les deux colonnes se superposent.
 *
 * Un point de reference tire de memoire ne vaut rien : le premier essai en
 * donnait un a 400 m, et c'etait la reference qui etait fausse.
 */
const WGS84: readonly PointWGS84[] = [
	[1.30121019, 43.47467864],
	[1.30123476, 43.47467066],
	[1.30173238, 43.47451143],
	[1.30230566, 43.47432982],
	[1.30264171, 43.47422286],
	[1.30268874, 43.47420794],
	[1.30337715, 43.47398969],
	[1.30330914, 43.47384456],
	[1.30329352, 43.4738129],
	[1.30323888, 43.47383032],
	[1.30263676, 43.47402229],
	[1.30218804, 43.47416635],
	[1.30211966, 43.47418859],
	[1.3012228, 43.47447771],
	[1.30115131, 43.47450062],
	[1.30121019, 43.47467864]
];

const PAR_L_IGN: readonly PointL93[] = [
	[562501.18, 6265433.07],
	[562503.15, 6265432.14],
	[562543.04, 6265413.58],
	[562589, 6265392.4],
	[562615.94, 6265379.93],
	[562619.71, 6265378.19],
	[562674.9, 6265352.74],
	[562669.05, 6265336.73],
	[562667.71, 6265333.24],
	[562663.33, 6265335.27],
	[562615.06, 6265357.65],
	[562579.09, 6265374.44],
	[562573.61, 6265377.03],
	[562501.72, 6265410.72],
	[562495.99, 6265413.39],
	[562501.18, 6265433.07]
];

/** La contenance que le cadastre porte pour cette parcelle. */
const CONTENANCE = 3852;

test("la projection colle a celle de l'IGN, sommet a sommet", () => {
	assert.equal(WGS84.length, PAR_L_IGN.length);
	let pire = 0;
	for (let i = 0; i < WGS84.length; i++) {
		pire = Math.max(pire, distance(enLambert93(WGS84[i]!), PAR_L_IGN[i]!));
	}
	// Cinq millimetres sur seize sommets : l'ecart est celui de l'arrondi a deux
	// decimales des valeurs figees, pas celui de la formule.
	assert.ok(pire < 0.05, `ecart maximal ${pire.toFixed(3)} m`);
});

test('la longitude de reference ne deplace pas le point en X', () => {
	// A 3 degres est, l'angle de convergence est nul : X vaut exactement XS.
	const [x] = enLambert93([3, 46.5]);
	assert.ok(Math.abs(x - 700000) < 0.001, String(x));
});

test("l'aire calculee ne s'accorde pas avec la contenance du cadastre", () => {
	/*
	 * CE N'EST PAS UN DEFAUT DE CE MODULE, ET C'EST LE POINT.
	 *
	 * La geometrie du plan cadastral et la contenance portee par le meme
	 * cadastre sont deux nombres differents. Mesure du 2026-09-06 sur cinq
	 * parcelles : ecart absolu median 0,34 %, maximum 0,88 %. Le plan est un
	 * dessin, la contenance est une valeur fiscale, et aucun des deux n'est un
	 * bornage. La page le dit au lecteur au lieu de choisir pour lui.
	 */
	const calculee = aire(WGS84.map(enLambert93));
	const ecart = Math.abs(calculee - CONTENANCE) / CONTENANCE;
	assert.ok(ecart > 0.001, "l'ecart a disparu : la mesure a change");
	assert.ok(ecart < 0.02, `ecart de ${(ecart * 100).toFixed(2)} %, hors de la fourchette mesuree`);
});

test('le sens de parcours donne une normale qui sort', () => {
	const carre: PointL93[] = [
		[0, 0],
		[10, 0],
		[10, 10],
		[0, 10],
		[0, 0]
	];
	// Ce carre est parcouru dans le sens TRIGONOMETRIQUE (Y monte).
	assert.equal(estHoraire(carre), false);
	const n = normaleSortante(carre[0]!, carre[1]!, estHoraire(carre));
	// Le cote du bas : sa normale sortante pointe vers le bas, donc Y negatif.
	assert.ok(n[1] < -0.99, JSON.stringify(n));
	// Et le point pousse dans cette direction sort bien de l'anneau.
	assert.equal(dansLAnneau([5, -0.5], carre), false);
	assert.equal(dansLAnneau([5, 0.5], carre), true);
});

test("l'aire d'un carre de dix metres fait cent metres carres", () => {
	const carre: PointL93[] = [
		[0, 0],
		[10, 0],
		[10, 10],
		[0, 10],
		[0, 0]
	];
	assert.equal(aire(carre), 100);
	// Parcouru a l'envers, elle ne devient pas negative.
	assert.equal(aire([...carre].reverse()), 100);
});

test('la distance a un segment se mesure a ses bouts, pas a sa droite', () => {
	const a: PointL93 = [0, 0];
	const b: PointL93 = [10, 0];
	assert.equal(auSegment([5, 3], a, b), 3);
	// Au-dela du bout, c'est la distance au BOUT : une droite infinie dirait 3.
	assert.equal(auSegment([14, 3], a, b), 5);
});

test("l'echantillonnage garde les deux bouts et respecte son pas", () => {
	const pts = echantillonner([0, 0], [10, 0], 1.5);
	assert.deepEqual(pts[0], [0, 0]);
	assert.deepEqual(pts[pts.length - 1], [10, 0]);
	for (let i = 1; i < pts.length; i++) {
		assert.ok(distance(pts[i - 1]!, pts[i]!) <= 1.5 + 1e-9);
	}
});
