import test from 'node:test';
import assert from 'node:assert/strict';
import {
	cotesDeLaParcelle,
	mesurerLeContour,
	LARGEUR_PAR_DEFAUT,
	MARGE_DE_BORD,
	type Cote,
	type Voie
} from './cotes.ts';
import type { PointL93 } from './lambert.ts';

/*
 * UNE PARCELLE D'ESSAI, POSEE A LA MAIN, EN METRES.
 *
 * Vingt metres sur trente, coins a l'origine. Une rue court le long du cote
 * SUD, a 5 m sous lui - soit la demi-chaussee plus un trottoir, comme dans la
 * vraie vie. Une parcelle voisine colle au cote NORD. Les cotes est et ouest ne
 * touchent rien : ce sont les indeterminees.
 *
 * Portee d'edifiable avec le module : deux sites qui mesurent la meme chose
 * doivent echouer aux memes endroits.
 */
const PARCELLE: PointL93[] = [
	[0, 0],
	[20, 0],
	[20, 30],
	[0, 30],
	[0, 0]
];

const RUE: Voie = {
	lignes: [
		[
			[-30, -5],
			[60, -5]
		]
	],
	largeur: 5,
	nom: 'rue de la Mesure'
};

/** La voisine colle au nord : son bord sud est le bord nord de la parcelle. */
const VOISINE: PointL93[] = [
	[0, 30],
	[20, 30],
	[20, 50],
	[0, 50],
	[0, 30]
];

const par = (cotes: readonly Cote[], rang: number): Cote => {
	const c = cotes.find((x) => x.rang === rang);
	assert.ok(c !== undefined, `côté ${String(rang)} absent`);
	return c;
};

test('la rue devant un côté en fait une limite sur voie', () => {
	const cotes = cotesDeLaParcelle(PARCELLE, [RUE], [VOISINE]);
	const sud = par(cotes, 0);
	assert.equal(sud.nature, 'sur-voie');
	assert.equal(sud.voie, 'rue de la Mesure');
	assert.ok(sud.aLAxe !== null && Math.abs(sud.aLAxe - 5) < 0.01, String(sud.aLAxe));
});

test('la MEME rue derrière un côté n en fait pas une façade', () => {
	/*
	 * C'est le test qui a fait tout le module. Le cote NORD est a 35 m de l'axe,
	 * donc loin ; mais meme rapproche, la rue reste DERRIERE lui. Sans le test du
	 * dehors, une parcelle d'angle voyait sa limite arriere classee sur voie.
	 */
	const nord = par(cotesDeLaParcelle(PARCELLE, [RUE], [VOISINE]), 2);
	assert.notEqual(nord.nature, 'sur-voie');
	assert.equal(nord.aLAxe, null, 'aucune voie ne doit être trouvée devant');
});

test('un côté que longe une parcelle voisine est une séparative', () => {
	const nord = par(cotesDeLaParcelle(PARCELLE, [RUE], [VOISINE]), 2);
	assert.equal(nord.nature, 'separative');
	assert.equal(nord.partagee, 1);
});

test('un côté qui ne touche ni voie ni parcelle reste indéterminé', () => {
	const cotes = cotesDeLaParcelle(PARCELLE, [RUE], [VOISINE]);
	for (const rang of [1, 3]) {
		assert.equal(par(cotes, rang).nature, 'indeterminee', `côté ${String(rang)}`);
	}
});

test('le seuil vient de la largeur de chaussée, pas d une constante', () => {
	// Une voie large repousse la limite de propriete : le meme cote, a la meme
	// distance, bascule selon ce que la BD TOPO declare.
	const loin: Voie = {
		...RUE,
		lignes: [
			[
				[-30, -8],
				[60, -8]
			]
		],
		largeur: 5
	};
	// 8 m > 5/2 + 4 = 6,5 : pas sur voie.
	assert.notEqual(par(cotesDeLaParcelle(PARCELLE, [loin], []), 0).nature, 'sur-voie');
	// Avec une chaussee de 10 m, le seuil monte a 9 m : le meme cote passe.
	const large: Voie = { ...loin, largeur: 10 };
	assert.equal(par(cotesDeLaParcelle(PARCELLE, [large], []), 0).nature, 'sur-voie');
});

test('une largeur absente prend la valeur par défaut, et rien d autre', () => {
	// Le seuil vaut alors 5/2 + 4 = 6,5 m : une voie a 6 m passe, a 7 m non.
	const sans = (y: number): Voie => ({
		lignes: [
			[
				[-30, y],
				[60, y]
			]
		],
		largeur: null,
		nom: null
	});
	assert.equal(LARGEUR_PAR_DEFAUT / 2 + MARGE_DE_BORD, 6.5);
	assert.equal(par(cotesDeLaParcelle(PARCELLE, [sans(-6)], []), 0).nature, 'sur-voie');
	assert.notEqual(par(cotesDeLaParcelle(PARCELLE, [sans(-7)], []), 0).nature, 'sur-voie');
});

test('les biseaux d angle ne se cotent pas', () => {
	// Un cote d'un metre porte un chiffre illisible qui chevauche ses voisins :
	// le plan cadastral en pave les coins, et ils ne portent aucune regle.
	const biseautee: PointL93[] = [
		[0, 0],
		[20, 0],
		[20, 29.3],
		[19.3, 30],
		[0, 30],
		[0, 0]
	];
	const cotes = cotesDeLaParcelle(biseautee, [], []);
	// Le biseau mesure 0,99 m, sous le seuil ; les quatre vrais cotes restent.
	assert.equal(cotes.length, 4, 'le biseau doit sortir');
	assert.ok(cotes.every((c) => c.longueur >= 1.2));
	// Et un biseau de 1,4 m, lui, se cote : le seuil separe, il ne rabote pas.
	const franc: PointL93[] = [
		[0, 0],
		[20, 0],
		[20, 29],
		[19, 30],
		[0, 30],
		[0, 0]
	];
	assert.equal(cotesDeLaParcelle(franc, [], []).length, 5);
});

test('le contour rend son périmètre, son aire et son écart au cadastre', () => {
	/*
	 * 20 x 30 : 100 m de tour, 600 m2. La contenance FISCALE, elle, est arrondie
	 * et parfois vieille de decennies - l'ecart est la question que le public
	 * pose tous les jours, et on le publie plutot que de choisir un des deux.
	 */
	const m = mesurerLeContour(PARCELLE, [RUE], [VOISINE], 590);
	assert.equal(m.perimetre, 100);
	assert.equal(m.aire, 600);
	assert.equal(m.ecart, 10);
	assert.equal(m.surVoie, 1);
	assert.equal(m.separatives, 1);
	assert.equal(m.indeterminees, 2);
});

test('sans contenance connue, aucun écart n est invente', () => {
	// Une source muette ne se remplace pas par un zero : le zero se lirait comme
	// « le cadastre et la mesure tombent d'accord ».
	assert.equal(mesurerLeContour(PARCELLE, [], [], null).ecart, null);
});
