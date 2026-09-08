import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	communeDuCadastre,
	communeMere,
	estUnArrondissement,
	nomDeLaCommune
} from './arrondissements.ts';
/*
 * LES 45 ARRONDISSEMENTS, ET LE 404 QU'ILS RENDAIENT TOUS.
 *
 * Le plan cadastral ne connait ni « 75102 », ni « 69382 », ni « 13202 » : il
 * range leurs parcelles sous Paris, Lyon et Marseille. Une parcelle du 2e
 * arrondissement demandee sous son propre code rendait zero trait, donc null,
 * donc une page en 404 - `75102000AI0057`, le 15 rue du Croissant, le
 * 2026-09-08.
 */
test('une parcelle de Paris, Lyon ou Marseille se demande sous sa ville', () => {
	assert.equal(communeDuCadastre('75102'), '75056');
	assert.equal(communeDuCadastre('69382'), '69123');
	assert.equal(communeDuCadastre('13202'), '13055');
});

test('partout ailleurs le code de l identifiant est le bon', () => {
	assert.equal(communeDuCadastre('94081'), '94081');
	assert.equal(communeDuCadastre('2A004'), '2A004');
	// Les trois villes elles-memes ne sont pas des arrondissements.
	assert.equal(communeDuCadastre('75056'), '75056');
	assert.equal(communeDuCadastre('69123'), '69123');
	assert.equal(communeDuCadastre('13055'), '13055');
	// Et les codes qui bordent les plages restent intacts : 69390 est
	// Villeurbanne dans une autre serie, pas un dixieme arrondissement.
	assert.equal(communeDuCadastre('75121'), '75121');
	assert.equal(communeDuCadastre('69390'), '69390');
	assert.equal(communeDuCadastre('13200'), '13200');
	assert.equal(communeDuCadastre('13217'), '13217');
});

test('le nom de l arrondissement se calcule, l API rend celui de la ville', () => {
	// L'API rend « Paris » pour les vingt : sans ce calcul, le fil d'Ariane et
	// le titre de la page perdent l'arrondissement.
	assert.equal(nomDeLaCommune('75102', 'Paris'), 'Paris 2e Arrondissement');
	assert.equal(nomDeLaCommune('69381', 'Lyon'), 'Lyon 1er Arrondissement');
	assert.equal(nomDeLaCommune('13216', 'Marseille'), 'Marseille 16e Arrondissement');
	assert.equal(nomDeLaCommune('75120', 'Paris'), 'Paris 20e Arrondissement');
});

test('ailleurs, le nom rendu par la source passe tel quel', () => {
	assert.equal(nomDeLaCommune('94081', 'Vitry-sur-Seine'), 'Vitry-sur-Seine');
	assert.equal(nomDeLaCommune('75056', 'Paris'), 'Paris');
	assert.equal(nomDeLaCommune('2A004', 'Ajaccio'), 'Ajaccio');
});

test('la question se pose aussi toute seule', () => {
	assert.equal(estUnArrondissement('75102'), true);
	assert.equal(estUnArrondissement('13216'), true);
	assert.equal(estUnArrondissement('75056'), false);
	assert.equal(estUnArrondissement('94081'), false);
	assert.equal(estUnArrondissement('2A004'), false);
});

test('la commune mere se lit pour toute source qui ignore les arrondissements', () => {
	/*
	 * Mesure du 2026-09-08 sur Georisques : `gaspar/catnat?code_insee=75102`
	 * rend ZERO arrete, `75056` en rend vingt - et la meme API repond a `75102`
	 * pour la sismicite et le radon, ou `75056` rend zero. Le code se choisit
	 * donc source par source, ce qui est exactement pourquoi cette fonction
	 * existe a cote de `communeDuCadastre` plutot que de s'appeler comme elle.
	 */
	assert.equal(communeMere('75102'), '75056');
	assert.equal(communeMere('69383'), '69123');
	assert.equal(communeMere('13208'), '13055');
	assert.equal(communeMere('94081'), '94081');
	assert.equal(communeMere('2A004'), '2A004');
});
