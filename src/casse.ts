/*
 * Les noms propres que les sources ecrivent EN CAPITALES.
 *
 * Le Geoportail rend « PLUI GRAND-ORLY SEINE BIEVRE », la Base Adresse
 * Nationale a rendu « VITRY-SUR-SEINE » avant sa refonte, et le fichier des
 * ventes ecrit « 86 RUE PASTEUR ». Repris tels quels dans une phrase, ces noms
 * CRIENT, et un titre de page qui crie se remarque avant ce qu'il dit.
 *
 * Ce qui rend la regle non triviale : en francais, les particules d'un nom
 * compose ne prennent PAS la majuscule, et elles ne se devinent pas.
 * « Saint-Priest-de-Gimel », jamais « Saint-Priest-De-Gimel ». Le premier mot,
 * lui, la garde toujours, meme si c'est une particule : « Le Havre »,
 * « La Rochelle ».
 */

const PARTICULES = new Set([
	'de',
	'du',
	'des',
	'le',
	'la',
	'les',
	'sur',
	'sous',
	'en',
	'et',
	'aux',
	'au',
	'lez',
	'sainte',
	'saint'
]);

const capitale = (mot: string): string =>
	mot.length === 0 ? mot : mot[0]!.toUpperCase() + mot.slice(1).toLowerCase();

/**
 * Un nom propre ecrit comme on l'ecrit.
 *
 * Un nom qui porte deja des minuscules est rendu tel quel : la source a alors
 * fait le travail, et le refaire abimerait ce qu'elle avait raison d'ecrire
 * (« Coeur de ville », « ZAC des Ardoines »).
 */
export function nomPropre(brut: string): string {
	const nom = brut.trim();
	if (nom === '' || /[a-zà-ÿ]/.test(nom)) return nom;
	const morceaux = nom.toLowerCase().split(/([\s-])/);
	let premier = true;
	return morceaux
		.map((morceau) => {
			if (/^[\s-]$/.test(morceau) || morceau === '') return morceau;
			const garde = premier;
			premier = false;
			// « L'Isle-Adam », « Bourg-d'Oisans » : l'elision porte sa propre regle.
			if (/^[ld]'/.test(morceau)) {
				const tete = morceau.slice(0, 2);
				return (garde ? tete.toUpperCase() : tete) + capitale(morceau.slice(2));
			}
			if (!garde && PARTICULES.has(morceau)) return morceau;
			return capitale(morceau);
		})
		.join('');
}

/**
 * Le nom d'un document d'urbanisme, sans le type qu'il repete.
 *
 * Le Geoportail rend le type d'un cote (`PLUi`) et un titre qui commence
 * souvent par ce meme type (`PLUI GRAND-ORLY SEINE BIEVRE`). Colles, ils
 * donnent « du PLUi PLUI Grand-Orly Seine Bievre ».
 */
export function titreDocument(type: string, titre: string): string {
	const propre = nomPropre(titre);
	const prefixe = type.trim().toLowerCase();
	if (prefixe === '' || !propre.toLowerCase().startsWith(prefixe)) return propre;
	const reste = propre.slice(prefixe.length).replace(/^[\s:-]+/, '');
	return reste === '' ? propre : reste;
}
