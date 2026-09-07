/*
 * LES FONDS SOUS LE PLAN, ET CE QUE CHACUN REPOND.
 *
 * Le meme dessin de parcelles se lit sur trois appuis, et ce ne sont pas trois
 * decorations : ils repondent a trois questions differentes.
 *
 *   - LE CADASTRE ne montre que le decoupage, dans la convention de la DGFiP -
 *     feuille creme, batiments jaunes. C'est le plan qu'on joint a un dossier,
 *     et le seul qui s'imprime sans devorer l'encre. Il n'a pas de fond : le
 *     dessin SE SUFFIT, et c'est pour ca qu'il est le defaut.
 *   - LA PHOTO repond « c'est bien ce terrain-la ? », la seule question qu'un
 *     trait ne repond jamais.
 *   - LE PLAN IGN repond « ou est-ce », avec les rues nommees autour.
 *
 * Un fond est UNE image, demandee au cadre exact du dessin : pas de tuile, pas
 * de carte glissante. Voir la tete de `plan.ts` pour la raison, et le champ
 * `cadre` de `Dessin` pour le calage.
 *
 * `CRS:84` plutot que `EPSG:4326` : en WMS 1.3.0 le second impose l'ordre
 * latitude-longitude, que la moitie des exemples du web ecrit a l'envers.
 */

import type { Cadre } from './plan.ts';

const SERVEUR = 'https://data.geopf.fr/wms-r/wms';

export type Fond = 'cadastre' | 'cote' | 'photo' | 'plan';

export const FOND_PAR_DEFAUT: Fond = 'cadastre';

interface Definition {
	readonly code: Fond;
	/** Le mot de l'onglet. */
	readonly nom: string;
	/** Ce que ce fond apporte, dit au lecteur qui hesite. */
	readonly dit: string;
	/** La couche de la Geoplateforme, ou `null` quand le dessin se suffit. */
	readonly couche: string | null;
	/** Qui produit l'image, nomme sous le plan. */
	readonly source: string;
}

export const FONDS: readonly Definition[] = [
	{
		code: 'cadastre',
		nom: 'Cadastre',
		dit: 'le découpage seul, dans la convention de la DGFiP',
		couche: null,
		source: 'DGFiP, plan cadastral informatisé'
	},
	{
		/*
		 * LE PLAN COTE EST UN TYPE A PART, ET C'EST UNE DEMANDE DE FLORIAN.
		 *
		 * Les cotes ne se posent PAS sur les autres fonds : au-dessus d'une photo
		 * ou d'un quartier entier, elles se chevauchent et n'apprennent rien. Ici
		 * le cadre se resserre sur la parcelle, les voisines s'effacent, et chaque
		 * cote porte sa longueur EN TOUTES LETTRES - pas seulement un numero.
		 */
		code: 'cote',
		nom: 'Coté',
		dit: 'la longueur de chaque limite',
		couche: null,
		source: 'DGFiP (parcellaire), IGN BD TOPO (voies)'
	},
	{
		code: 'photo',
		nom: 'Photo',
		dit: 'ce qui est sur le sol',
		couche: 'ORTHOIMAGERY.ORTHOPHOTOS',
		source: 'IGN, BD ORTHO'
	},
	{
		code: 'plan',
		nom: 'Plan IGN',
		dit: 'les rues nommées autour',
		couche: 'GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2',
		source: 'IGN, Plan IGN'
	}
];

/** Le fond demande, ou celui par defaut : un mot inconnu ne fait pas une erreur. */
export function fondDemande(valeur: string | null): Fond {
	const trouve = FONDS.find((f) => f.code === valeur);
	return trouve?.code ?? FOND_PAR_DEFAUT;
}

export function definitionDuFond(fond: Fond): Definition {
	// La liste est close et `fondDemande` la garde : le repli ne sert qu'au type.
	return FONDS.find((f) => f.code === fond) ?? FONDS[0]!;
}

/**
 * L'image de fond au cadre exact du dessin, ou `null` quand il n'en faut pas.
 *
 * La taille demandee est celle du `viewBox` : l'image et les traits partagent
 * alors le meme repere, au pixel, sans aucune transformation a l'affichage.
 */
export function urlDuFond(
	fond: Fond,
	cadre: Cadre,
	largeur: number,
	hauteur: number
): string | null {
	const { couche } = definitionDuFond(fond);
	if (couche === null) return null;
	const bbox = [cadre.ouest, cadre.sud, cadre.est, cadre.nord].map((v) => v.toFixed(6)).join(',');
	const parametres = new URLSearchParams({
		SERVICE: 'WMS',
		VERSION: '1.3.0',
		REQUEST: 'GetMap',
		LAYERS: couche,
		STYLES: '',
		CRS: 'CRS:84',
		BBOX: bbox,
		WIDTH: String(Math.round(largeur)),
		HEIGHT: String(Math.round(hauteur)),
		// Le trait du plan IGN se lit mal en JPEG ; la photo, elle, y gagne.
		FORMAT: fond === 'photo' ? 'image/jpeg' : 'image/png'
	});
	return `${SERVEUR}?${parametres.toString()}`;
}
