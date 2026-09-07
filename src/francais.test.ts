import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aLaCommune, deLaCommune, duDepartement, versLeCap } from './francais.ts';

test("l'article d'une commune se lit dans son nom", () => {
	assert.equal(deLaCommune('Nantes'), 'de Nantes');
	assert.equal(deLaCommune('Arras'), "d'Arras");
	assert.equal(deLaCommune('Le Mans'), 'du Mans');
	assert.equal(deLaCommune('La Rochelle'), 'de la Rochelle');
	assert.equal(deLaCommune("Les Sables-d'Olonne"), "des Sables-d'Olonne");
	assert.equal(deLaCommune("L'Isle-Adam"), "de l'Isle-Adam");
	assert.equal(aLaCommune('Le Mans'), 'au Mans');
	assert.equal(versLeCap('nord'), 'vers le nord');
});

/*
 * LES DEUX CONTROLES QUI COMPARENT CETTE TABLE AU PAYS REEL VIVENT CHEZ LE
 * CONSOMMATEUR, PAS ICI.
 *
 * « Chaque departement servi porte son article, et aucun de plus » demande la
 * liste des departements REELLEMENT servis. Elle est generee depuis l'API Geo
 * de l'Etat et vit dans le site, pas dans ce paquet : un paquet qui embarquerait
 * sa propre copie de cette liste mesurerait sa table contre elle-meme.
 *
 * Voir `src/lib/articles-des-departements.test.ts` chez aucadastre.
 */

test('les quatre formes attendues, sur les cas qui les distinguent', () => {
	// Masculin, feminin, pluriel, elision : les quatre, et un nom sans article.
	assert.equal(duDepartement('59'), 'du Nord');
	assert.equal(duDepartement('53'), 'de la Mayenne');
	assert.equal(duDepartement('78'), 'des Yvelines');
	assert.equal(duDepartement('01'), "de l'Ain");
	assert.equal(duDepartement('75'), 'de Paris');
	// L'Aisne est feminine et l'Allier masculin : seule une table peut le savoir.
	assert.equal(duDepartement('02'), "de l'Aisne");
	assert.equal(duDepartement('03'), "de l'Allier");
	// La Reunion garde sa majuscule, elle fait partie du nom.
	assert.equal(duDepartement('974'), 'de La Réunion');
	// Un code inconnu se tait plutot que de rendre « de undefined ».
	assert.equal(duDepartement('99'), '');
});
