import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parcelleDeclaree, parcellesDesAutresNumeros, type Numero } from './ban.ts';

/*
 * LA BAN ECRIT SES PARCELLES DANS LA FORME DES FICHIERS FONCIERS -
 * « 490353   AD0526 » : code departement, code direction, code commune,
 * prefixe de section, section, numero. Reconstruire le code INSEE depuis la
 * tete demande de savoir ou couper le departement, et la coupe n'est pas la
 * meme en metropole et outre-mer : c'est l'erreur que le premier releve du
 * 2026-09-07 a faite, et elle rendait un identifiant qui ne retombait sur
 * aucune parcelle. On lit donc la QUEUE, et l'INSEE vient de la commune de la
 * page.
 */

test('la queue porte le prefixe, la section et le numero', () => {
	assert.equal(parcelleDeclaree('490353   AD0526', '49353'), '49353000AD0526');
	assert.equal(parcelleDeclaree('940810   AB0123', '94081'), '94081000AB0123');
});

test('un prefixe de commune fusionnee est garde tel quel', () => {
	assert.equal(parcelleDeclaree('313950026AB0931', '31395'), '31395026AB0931');
});

test('une forme qui n est pas une reference ne rend rien', () => {
	assert.equal(parcelleDeclaree('', '49353'), null);
	assert.equal(parcelleDeclaree('AD0526', '49353'), null);
	assert.equal(parcelleDeclaree(42, '49353'), null);
	assert.equal(parcelleDeclaree('490353   AD05', '49353'), null);
	// Sans commune, on ne fabrique pas d'identifiant.
	assert.equal(parcelleDeclaree('490353   AD0526', ''), null);
});

/*
 * CE QUE LES VOISINS DECLARENT. Rue de Letanduere a Angers, les 199 numeros
 * portent chacun UNE parcelle declaree : DM 0304 au 126, DM 0145 au 128.
 */
const numeroDe = (id: string, numero: number, parcelles: string[]): Numero => ({
	id,
	numero,
	suffixe: '',
	codePostal: '49000',
	point: { lon: -0.554296, lat: 47.458147 },
	parcelles
});
const VOIE = [
	numeroDe('49007_4790_00126', 126, ['49007000DM0304']),
	numeroDe('49007_4790_00128', 128, ['49007000DM0145']),
	numeroDe('49007_4790_00130', 130, ['49007000DM0147'])
];

test('les parcelles des autres numeros excluent celles du numero vise', () => {
	assert.deepEqual(parcellesDesAutresNumeros(VOIE, '49007_4790_00128').toSorted(), [
		'49007000DM0147',
		'49007000DM0304'
	]);
});

test('un numero absent de la voie ne coupe rien', () => {
	// Sinon une adresse inconnue de la BAN verrait TOUTE la voie comme voisine
	// et perdrait ses secondaires sans qu aucune declaration le dise.
	assert.deepEqual(parcellesDesAutresNumeros(VOIE, '49007_4790_09999'), []);
});
