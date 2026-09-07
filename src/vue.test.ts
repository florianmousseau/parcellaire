import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	auBout,
	deplacee,
	enParametres,
	NIVEAUX,
	niveauParDefaut,
	rayonDegres,
	vueDemandee,
	zoomee,
	type Vue
} from './vue.ts';

const VITRY: Vue = { lon: 2.399_956, lat: 48.787_579, niveau: 4 };

test('le niveau par défaut est le plus SERRÉ qui contienne encore la parcelle', () => {
	// La parcelle doit remplir le cadre, pas s'y perdre : 30 m tiennent dans 50,
	// pas dans 25.
	assert.equal(NIVEAUX[niveauParDefaut(30)], 50);
	assert.equal(NIVEAUX[niveauParDefaut(90)], 100);
	assert.equal(NIVEAUX[niveauParDefaut(20)], 25);
});

test('une étendue plus large que le premier niveau retombe dessus', () => {
	// Un tènement rural de 4 km ne se coupe pas : il s'ouvre au plus large.
	assert.equal(niveauParDefaut(4000), 0);
	assert.equal(NIVEAUX[niveauParDefaut(4000)], 1600);
});

test('le rayon rend bien la demi-largeur demandée, en mètres', () => {
	// 100 m de demi-largeur a Vitry : le degre de longitude y vaut environ 73 km.
	const rayon = rayonDegres(4, 48.787_579);
	const metres = rayon * 111_320 * Math.cos((48.787_579 * Math.PI) / 180);
	assert.ok(Math.abs(metres - 100) < 0.5, String(metres));
});

test('un paramètre illisible retombe sur la vue par défaut, sans erreur', () => {
	/*
	 * `?c=` arrive d'un lien recopie a la main aussi souvent que d'un de nos
	 * boutons. Une page de plan ne doit pas rendre 500 parce qu'un visiteur a
	 * coupe l'URL au mauvais endroit.
	 */
	for (const brut of ['', 'nawak', '2.4', '999,999', 'a,b']) {
		const v = vueDemandee(new URLSearchParams(`c=${brut}`), VITRY);
		assert.equal(v.lon, VITRY.lon, brut);
		assert.equal(v.lat, VITRY.lat, brut);
	}
});

test('un niveau hors bornes se ramène dans l échelle', () => {
	assert.equal(vueDemandee(new URLSearchParams('z=99'), VITRY).niveau, NIVEAUX.length - 1);
	assert.equal(vueDemandee(new URLSearchParams('z=-5'), VITRY).niveau, 0);
	assert.equal(vueDemandee(new URLSearchParams('z=2.5'), VITRY).niveau, VITRY.niveau);
});

test('sans paramètre, la vue est celle par défaut et non le niveau zéro', () => {
	/*
	 * `Number(null)` vaut 0 et `Number.isInteger(0)` est vrai : la premiere
	 * version ouvrait toutes les pages au niveau le plus LARGE, 1 600 m, au lieu
	 * du cadre calcule sur la parcelle. Un parametre absent n'est pas un zero.
	 */
	assert.deepEqual(vueDemandee(new URLSearchParams(''), VITRY), VITRY);
	assert.deepEqual(vueDemandee(new URLSearchParams('z='), VITRY), VITRY);
	assert.deepEqual(vueDemandee(new URLSearchParams('fond=photo'), VITRY), VITRY);
	// Mais un zero DEMANDE reste un zero.
	assert.equal(vueDemandee(new URLSearchParams('z=0'), VITRY).niveau, 0);
});

test('le centre demandé est lu en longitude puis latitude', () => {
	// L'ordre est celui de GeoJSON, pas celui d'un GPS : inverser tombe dans le
	// golfe de Guinee, et ca ne se voit qu'a l'oeil.
	const v = vueDemandee(new URLSearchParams('c=2.5,48.9&z=3'), VITRY);
	assert.equal(v.lon, 2.5);
	assert.equal(v.lat, 48.9);
	assert.equal(v.niveau, 3);
});

test('un déplacement avance d un DEMI-cadre, pas d un cadre entier', () => {
	// D'un bond complet, le lecteur perd ce qu'il regardait. La moitie garde un
	// recouvrement, donc un repere.
	const pas = rayonDegres(VITRY.niveau, VITRY.lat);
	assert.ok(Math.abs(deplacee(VITRY, 'est').lon - (VITRY.lon + pas)) < 1e-12);
	assert.ok(Math.abs(deplacee(VITRY, 'ouest').lon - (VITRY.lon - pas)) < 1e-12);
	assert.ok(deplacee(VITRY, 'nord').lat > VITRY.lat);
	assert.ok(deplacee(VITRY, 'sud').lat < VITRY.lat);
});

test('les déplacements opposés se rattrapent exactement', () => {
	// Aller puis revenir doit rendre la meme adresse, sinon un aller-retour
	// derive et le lecteur ne retrouve pas sa parcelle.
	const ai = deplacee(deplacee(VITRY, 'est'), 'ouest');
	assert.ok(Math.abs(ai.lon - VITRY.lon) < 1e-12);
});

test('le zoom s arrête aux deux bouts de l échelle', () => {
	const large = { ...VITRY, niveau: 0 };
	const serre = { ...VITRY, niveau: NIVEAUX.length - 1 };
	assert.equal(zoomee(large, -1).niveau, 0);
	assert.equal(zoomee(serre, 1).niveau, NIVEAUX.length - 1);
	assert.equal(auBout(large, -1), true);
	assert.equal(auBout(large, 1), false);
	assert.equal(auBout(serre, 1), true);
});

test('la vue de départ n écrit aucun paramètre', () => {
	/*
	 * Sinon la meme page aurait deux adresses - celle sans parametres et celle
	 * qui les repete - et c'est ce qu'une canonique existe pour empecher.
	 */
	assert.equal(enParametres(VITRY, VITRY), '');
	assert.equal(enParametres(zoomee(VITRY, 1), VITRY), 'z=5');
	assert.match(enParametres(deplacee(VITRY, 'est'), VITRY), /^c=2\.\d+,48\.\d+$/);
});
