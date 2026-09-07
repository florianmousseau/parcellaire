import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nomPropre, titreDocument } from './casse.ts';

test('un nom en capitales cesse de crier', () => {
	assert.equal(nomPropre('VITRY-SUR-SEINE'), 'Vitry-sur-Seine');
	assert.equal(nomPropre('GRAND-ORLY SEINE BIEVRE'), 'Grand-Orly Seine Bievre');
	assert.equal(nomPropre('AIGNES'), 'Aignes');
});

test('la particule en tete garde sa majuscule', () => {
	assert.equal(nomPropre('LE HAVRE'), 'Le Havre');
	assert.equal(nomPropre('LA SALVETAT-LAURAGAIS'), 'La Salvetat-Lauragais');
	assert.equal(nomPropre('SAINT-PRIEST-DE-GIMEL'), 'Saint-Priest-de-Gimel');
});

test('l elision porte sa propre regle', () => {
	assert.equal(nomPropre("L'ISLE-ADAM"), "L'Isle-Adam");
	assert.equal(nomPropre("BOURG-D'OISANS"), "Bourg-d'Oisans");
});

test('un nom deja mis en forme par la source passe intact', () => {
	// Refaire la casse ici abimerait ce que la source avait raison d'ecrire.
	assert.equal(nomPropre('Coeur de ville'), 'Coeur de ville');
	assert.equal(nomPropre('ZAC des Ardoines'), 'ZAC des Ardoines');
	assert.equal(nomPropre(''), '');
});

test('le titre d un document perd le type qu il repete', () => {
	// Cas reel : le Geoportail rend les deux, et colles ils se redisent.
	assert.equal(titreDocument('PLUi', 'PLUI GRAND-ORLY SEINE BIEVRE'), 'Grand-Orly Seine Bievre');
	// La particule reste en bas de casse : « du PLU de Muret » se lit tout seul.
	assert.equal(titreDocument('PLU', 'PLU DE MURET'), 'de Muret');
});

test('un titre qui ne repete pas le type reste entier', () => {
	assert.equal(titreDocument('PLUi', 'METROPOLE DE LYON'), 'Metropole de Lyon');
	assert.equal(titreDocument('', 'MURET'), 'Muret');
});

test('un titre reduit au type seul se garde plutot que de disparaitre', () => {
	assert.equal(titreDocument('PLU', 'PLU'), 'Plu');
});
