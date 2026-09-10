/*
 * Les appels sortants, et leur cache d'arete.
 *
 * Une page d'adresse interroge une dizaine de sources. Sans cache, chaque
 * visiteur les paie toutes, et la page met plusieurs secondes. Le cache de
 * Cloudflare est demande par le champ `cf` de `fetch`, qui n'existe pas dans le
 * type standard de `RequestInit` : le cast est ici, une seule fois, plutot que
 * repete dans chaque module de source.
 *
 * Les durees sont choisies sur ce que la source BOUGE, pas sur ce qu'on
 * souhaite : un plan cadastral est mis a jour deux fois par an, un zonage
 * d'urbanisme a chaque revision, un fichier de ventes une fois par semestre.
 */

const UA = 'aucadastre/1.0 (+https://aucadastre.fr)';

interface OptionsCloudflare extends RequestInit {
	cf?: { cacheEverything: boolean; cacheTtl: number };
}

/** Une journee : le zonage, les risques, les adresses. */
export const JOUR = 86_400;

/** Une semaine : le plan cadastral et les fichiers de ventes, qui bougent par lots. */
export const SEMAINE = 604_800;

/**
 * L'ECHEANCE D'UN APPEL SORTANT, en millisecondes.
 *
 * Un appel sans echeance ne tombe pas : il PEND, et il tient la page entiere
 * en otage alors qu'elle a autre chose a montrer. Le chiffre vient de la mesure
 * d'edifiable du 2026-09-05 : sur une page de rue, Georisques met jusqu'a 6,2 s
 * sur un point neuf. En dessous de dix secondes on couperait des lectures qui
 * allaient aboutir.
 *
 * ELLE NE CREE AUCUNE FORME DE PANNE NOUVELLE. `json()` rend deja `null` quand
 * la source ne repond pas, et `traits()` comme `ban.json` levent deja sur un
 * 5xx : une echeance atteinte arrive chez l'appelant exactement comme un 502,
 * qui peut tomber a chaque appel depuis toujours. Ce qu'elle change est un
 * blocage sans fin, qui lui n'a pas de forme du tout.
 */
const ECHEANCE = 10_000;

const options = (secondes: number | null): OptionsCloudflare => ({
	headers: { 'User-Agent': UA },
	signal: AbortSignal.timeout(ECHEANCE),
	...(secondes === null ? {} : { cf: { cacheEverything: true, cacheTtl: secondes } })
});

/** Un appel range au bord, et borne dans le temps. */
export async function lire(url: string, secondes: number): Promise<Response> {
	return fetch(url, options(secondes));
}

/**
 * LE MEME APPEL, BORNE MAIS SANS CACHE D'ARETE.
 *
 * Pour les appels dont on a MESURE que `cacheEverything` change la reponse -
 * ceux du cadastre, qui portent leur geometrie dans la requete. Le detail et
 * la mesure sont au-dessus de `cadastre.traits`. Le vide de cache est un choix
 * date, pas un oubli : l'echeance, elle, les concerne comme les autres.
 */
export async function lireSansCache(url: string): Promise<Response> {
	return fetch(url, options(null));
}

/**
 * Le JSON d'une source, ou `null` si elle ne repond pas.
 *
 * Une source muette ne doit jamais vider une page : le plan cadastral reste
 * utile sans les risques, et l'inverse aussi. L'appelant decide quoi afficher a
 * la place, il n'a pas a attraper une exception pour chaque source.
 */
export async function json(url: string, secondes: number): Promise<unknown> {
	try {
		const reponse = await lire(url, secondes);
		return reponse.ok ? await reponse.json() : null;
	} catch {
		return null;
	}
}

/**
 * La ligne d'un fichier national qui commence par un code INSEE.
 *
 * DEUX FICHIERS DE L'ETAT SE LISENT AINSI - le zonage A/B/C et la couverture
 * fibre de l'Arcep - et ils ont la meme forme : une ligne par commune, le code
 * INSEE en tete, un point-virgule pour separateur. Ils pesent 0,9 et 2,2 Mo et
 * sont les MEMES pour les 34 933 communes : le cache d'arete n'en telecharge
 * qu'un par mois et par isolat, et toutes les pages le partagent.
 *
 * On cherche la ligne, on ne decoupe pas le fichier : trente-quatre mille
 * lignes decoupees a chaque rendu couteraient plus cher que l'appel.
 */
export async function ligneParCommune(
	url: string,
	insee: string,
	secondes: number
): Promise<string[] | null> {
	const reponse = await lire(url, secondes).catch(() => null);
	if (!reponse?.ok) return null;
	const brut = await reponse.text();
	const debut = brut.indexOf(`\n${insee};`);
	if (debut === -1) return null;
	const fin = brut.indexOf('\n', debut + 1);
	return brut.slice(debut + 1, fin === -1 ? undefined : fin).split(';');
}
