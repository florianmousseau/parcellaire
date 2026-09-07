import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decouperIdentifiant, sectionLisible } from './cadastre.ts';

test('un identifiant cadastral se decoupe en quatre', () => {
	assert.deepEqual(decouperIdentifiant('94081000BQ0134'), {
		insee: '94081',
		prefixe: '000',
		section: 'BQ',
		numero: '0134'
	});
});

test('une commune fusionnee porte un prefixe non nul', () => {
	assert.equal(decouperIdentifiant('31395123AB0001')?.prefixe, '123');
});

test('la Corse passe, ses codes portent une lettre', () => {
	assert.equal(decouperIdentifiant('2A004000AB0001')?.insee, '2A004');
});

test('ce qui n est pas un identifiant rend null', () => {
	// La longueur ne suffit pas : chaque morceau a sa forme.
	assert.equal(decouperIdentifiant('94081000BQ013'), null);
	assert.equal(decouperIdentifiant('94081000BQ01345'), null);
	assert.equal(decouperIdentifiant('94081000bq0134'), null);
	assert.equal(decouperIdentifiant(''), null);
	assert.equal(decouperIdentifiant('../../etc/passwd'), null);
});

test('une section a une lettre perd son zero de comblement', () => {
	// La source rend toujours deux signes : la section E arrive en `0E`, et
	// « 0E 185 » ne s'ecrit sur aucun plan.
	assert.equal(sectionLisible('0E'), 'E');
	assert.equal(sectionLisible('0A'), 'A');
	assert.equal(sectionLisible('AB'), 'AB');
	assert.equal(sectionLisible('ZC'), 'ZC');
	assert.equal(sectionLisible('BQ'), 'BQ');
});
