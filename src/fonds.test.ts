import { test } from 'node:test';
import assert from 'node:assert/strict';
import { definitionDuFond, fondDemande, FONDS, urlDuFond } from './fonds.ts';

const CADRE = { ouest: 2.3975, sud: 48.7862, est: 2.4025, nord: 48.789 };
const parametres = (url: string) => new URLSearchParams(url.split('?')[1] ?? '');

test('le cadastre n a pas de fond : le dessin se suffit', () => {
	// Et c'est pour ca qu'il est le defaut : aucune requete, il s'imprime.
	assert.equal(urlDuFond('cadastre', CADRE, 960, 540), null);
	assert.equal(definitionDuFond('cadastre').couche, null);
});

test('un mot inconnu retombe sur le cadastre plutot que de casser la page', () => {
	// `?fond=` vient de l'URL : un lien recopie de travers ne doit pas rendre 500.
	assert.equal(fondDemande('satellite'), 'cadastre');
	assert.equal(fondDemande(null), 'cadastre');
	assert.equal(fondDemande(''), 'cadastre');
	assert.equal(fondDemande('photo'), 'photo');
});

test('l image est demandee en CRS:84, longitude d abord', () => {
	/*
	 * En WMS 1.3.0, `EPSG:4326` impose l'ordre latitude-longitude, que la moitie
	 * des exemples du web ecrit a l'envers : l'image sort tournee, et ca ne se
	 * voit qu'a l'oeil.
	 */
	const url = urlDuFond('photo', CADRE, 960, 540);
	assert.ok(url !== null);
	const p = parametres(url);
	assert.equal(p.get('CRS'), 'CRS:84');
	assert.equal(p.get('BBOX'), '2.397500,48.786200,2.402500,48.789000');
});

test('l image est demandee a la taille du viewBox, sinon rien ne se cale', () => {
	// Le fond et les traits partagent le meme repere : au pixel, sans transformation.
	const url = urlDuFond('plan', CADRE, 860, 430);
	assert.ok(url !== null);
	const p = parametres(url);
	assert.equal(p.get('WIDTH'), '860');
	assert.equal(p.get('HEIGHT'), '430');
});

test('la photo part en JPEG, le plan IGN en PNG', () => {
	// Le trait du plan IGN se hache en JPEG ; la photo, elle, y gagne en poids.
	assert.equal(parametres(urlDuFond('photo', CADRE, 100, 100) ?? '').get('FORMAT'), 'image/jpeg');
	assert.equal(parametres(urlDuFond('plan', CADRE, 100, 100) ?? '').get('FORMAT'), 'image/png');
});

test('chaque fond dit ce qu il apporte, et nomme son producteur', () => {
	// Un onglet qui ne dit pas ce qu'il change ne se clique pas, et une image
	// publique se cite : les deux sont des regles du site, pas des ornements.
	for (const f of FONDS) {
		assert.ok(f.nom.length > 0, f.code);
		assert.ok(f.dit.length > 0, f.code);
		assert.ok(f.source.length > 0, f.code);
	}
});
