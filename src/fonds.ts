/*
 * LES FONDS SOUS LE PLAN, ET CE QUE CHACUN REPOND.
 *
 * Le meme dessin de parcelles se lit sur trois appuis, et ce ne sont pas trois
 * decorations : ils repondent a trois questions differentes.
 *
 *   - LE CADASTRE est le plan de la DGFiP LUI-MEME, servi en image par leur WMS
 *     INSPIRE : feuille creme, batiments jaunes, et les numeros de parcelle,
 *     les noms de voie et les amorces de feuille que notre dessin n'ecrivait
 *     pas. C'est le plan qu'on joint a un dossier, et le defaut.
 *   - LA PHOTO repond « c'est bien ce terrain-la ? », la seule question qu'un
 *     trait ne repond jamais.
 *   - LE PLAN IGN repond « ou est-ce », avec les rues nommees autour.
 *
 * NOTRE PROPRE DESSIN RESTE, ET IL REPREND LA MAIN QUAND L'IMAGE MANQUE.
 * Florian, le 2026-09-07 : *« remplace le type cadastre par le type officiel,
 * le type officiel est bien meilleur »*. Le dessin garde deux emplois : le plan
 * COTE, qui a besoin d'un fond nu pour porter ses longueurs, et le repli des
 * dix-neuf communes que leur WMS refuse (`aUnPlanDgfip`). Il porte aussi, sur
 * tous les fonds, les surfaces cliquables et la parcelle en prune.
 *
 * CE QUE LE CHANGEMENT COUTE, ET C'EST ASSUME : leur service est PAR COMMUNE,
 * donc un cadre a cheval sur deux communes laisse l'autre en blanc ; et leur
 * image ne suit pas le theme sombre. Voir `cadastre-gouv.ts`.
 *
 * Un fond est UNE image, demandee au cadre exact du dessin : pas de tuile, pas
 * de carte glissante. Voir la tete de `plan.ts` pour la raison, et le champ
 * `cadre` de `Dessin` pour le calage.
 *
 * `CRS:84` plutot que `EPSG:4326` : en WMS 1.3.0 le second impose l'ordre
 * latitude-longitude, que la moitie des exemples du web ecrit a l'envers.
 */

import type { Cadre } from './plan.ts';
import { planDgfip } from './cadastre-gouv.ts';

/*
 * QUELLES COMMUNES LEUR SERVICE SERT VRAIMENT : LE SITE LE SAIT, PAS LE PAQUET.
 *
 * La reponse s'obtient en MOISSONNANT leur service, commune par commune, et le
 * releve est une donnee datee. Elle vit donc dans le site, qui la regenere ; un
 * paquet qui embarquerait sa propre copie servirait un jour une liste perimee
 * sans que personne ne s'en apercoive, et surtout sans pouvoir la refaire.
 *
 * Le predicat est EXIGE, pas optionnel : par defaut, un appelant qui l'oublie
 * n'aurait aucun fond de la DGFiP et rien ne le dirait.
 */
export type SertLePlanDgfip = (insee: string) => boolean;

const SERVEUR = 'https://data.geopf.fr/wms-r/wms';

export type Fond = 'cadastre' | 'cote' | 'photo' | 'plan' | 'avant';

export const FOND_PAR_DEFAUT: Fond = 'cadastre';

interface Definition {
	readonly code: Fond;
	/** Le mot de l'onglet. */
	readonly nom: string;
	/*
	 * CE QUE LA PAGE S'APPELLE SOUS CE FOND.
	 *
	 * « Plan de la parcelle CP 113 » au-dessus d'une photo aerienne est faux, et
	 * Florian l'a demande dans l'autre sens : *« mettre les titres adaptes au
	 * type d'image »*. Un titre qui ne decrit pas ce qu'on voit fait douter de
	 * tout ce qui l'entoure.
	 */
	readonly intitule: string;
	/** Ce que ce fond apporte, dit au lecteur qui hesite. */
	readonly dit: string;
	/**
	 * La couche de la Geoplateforme, `'@dgfip'` pour leur propre service, ou
	 * `null` quand le dessin se suffit.
	 *
	 * Le service de la DGFiP n'est pas une couche de plus sur le meme serveur :
	 * il a son adresse PAR COMMUNE et sa projection a lui. D'ou un marqueur, que
	 * l'arobase distingue de tout nom de couche reel.
	 */
	readonly couche: string | null;
	/** Qui produit l'image, nomme sous le plan. */
	readonly source: string;
}

/** Le marqueur du service de la DGFiP, qui n'est pas une couche du meme serveur. */
const DGFIP = '@dgfip';

export const FONDS: readonly Definition[] = [
	{
		code: 'cadastre',
		intitule: 'Plan',
		nom: 'Cadastre',
		dit: 'le plan de la DGFiP, avec ses numéros de parcelle',
		couche: DGFIP,
		source: 'DGFiP, service WMS INSPIRE'
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
		intitule: 'Plan coté',
		nom: 'Coté',
		dit: 'la longueur de chaque limite',
		couche: null,
		source: 'DGFiP (parcellaire), IGN BD TOPO (voies)'
	},
	{
		code: 'photo',
		intitule: 'Photo aérienne',
		nom: 'Photo',
		dit: 'ce qui est sur le sol',
		couche: 'ORTHOIMAGERY.ORTHOPHOTOS',
		source: 'IGN, BD ORTHO'
	},
	{
		code: 'plan',
		intitule: 'Plan IGN',
		nom: 'Plan IGN',
		dit: 'les rues nommées autour',
		couche: 'GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2',
		source: 'IGN, Plan IGN'
	},
	{
		/*
		 * LA MEME EMPRISE, SOIXANTE-DIX ANS PLUS TOT.
		 *
		 * L'IGN sert ses photographies aeriennes historiques comme une couche de
		 * plus sur le meme serveur : au cadre exact du dessin, le lecteur voit ce
		 * qu'il y avait a l'adresse avant l'immeuble, le lotissement ou la
		 * rocade. C'est la seule question de cette liste a laquelle ni le plan ni
		 * la photo d'aujourd'hui ne repondent.
		 *
		 * Les deux autres millesimes du service ont ete mesures le 2026-09-08 :
		 * `1965-1980` repond partout comme celle-ci, `1980-1995` rend une image
		 * VIDE de 760 octets sur les points sondes - une couche qui existe aux
		 * capacites et ne couvre pas. On n'en sert donc qu'une, et c'est la plus
		 * ancienne, celle qui montre autre chose.
		 */
		code: 'avant',
		intitule: 'Photo aérienne de 1950-1965',
		nom: '1950',
		dit: "ce qu'il y avait avant",
		couche: 'ORTHOIMAGERY.ORTHOPHOTOS.1950-1965',
		source: 'IGN, photographies aériennes historiques 1950-1965'
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

/*
 * L'IMAGE SE DEMANDE PLUS GRANDE QUE LA BOITE OU ELLE S'AFFICHE.
 *
 * Le `viewBox` du dessin fait 640 px de grand cote ; la figure, elle, occupe
 * pres de 1 000 px sur un ecran de bureau et le double sur un ecran a haute
 * densite. Une image demandee a 640 y est ETIREE, et Florian l'a vue tout de
 * suite : *« plan IGN et photo est floue sur PC »*. On la demande donc au
 * double, et le navigateur la reduit - une reduction est nette, un
 * agrandissement ne l'est jamais.
 *
 * Le cadre, lui, ne bouge pas d'un pouce : c'est le meme rectangle au sol,
 * juste echantillonne plus fin. Le calage au pixel sur les traits est conserve
 * puisque l'image garde exactement le rapport du `viewBox`.
 */
const DENSITE = 2;
/** Au-dela, le service refuse, et personne n'a d'ecran pour le voir. */
const COTE_MAX_DEMANDE = 2048;

/**
 * L'image de fond au cadre exact du dessin, ou `null` quand il n'en faut pas.
 *
 * Le rectangle au sol est celui du `viewBox` : l'image et les traits partagent
 * le meme repere. Seule la finesse d'echantillonnage differe.
 */
export function urlDuFond(
	fond: Fond,
	cadre: Cadre,
	largeur: number,
	hauteur: number,
	/** Le code INSEE, exige par le seul service qui a une adresse par commune. */
	insee: string | null = null,
	/** Le releve du site : leur WMS sert-il le plan de cette commune ? */
	sertLePlanDgfip: SertLePlanDgfip = () => false
): string | null {
	const { couche } = definitionDuFond(fond);
	if (couche === null) return null;
	const facteur = Math.min(DENSITE, COTE_MAX_DEMANDE / Math.max(largeur, hauteur, 1));
	const enPixels = (v: number) => Math.max(1, Math.round(v * facteur));
	if (couche === DGFIP) {
		/*
		 * Sans commune, ou sur une commune que leur WMS refuse, on ne demande RIEN
		 * et l'appelant redessine le plan lui-meme. Une image en erreur laisserait
		 * un cadre vide a la place du plan par defaut - dix-neuf communes.
		 */
		if (insee === null || !sertLePlanDgfip(insee)) return null;
		return planDgfip(insee, cadre, enPixels(largeur), enPixels(hauteur));
	}
	const bbox = [cadre.ouest, cadre.sud, cadre.est, cadre.nord].map((v) => v.toFixed(6)).join(',');
	const parametres = new URLSearchParams({
		SERVICE: 'WMS',
		VERSION: '1.3.0',
		REQUEST: 'GetMap',
		LAYERS: couche,
		STYLES: '',
		CRS: 'CRS:84',
		BBOX: bbox,
		WIDTH: String(enPixels(largeur)),
		HEIGHT: String(enPixels(hauteur)),
		/*
		 * Le trait du plan IGN se lit mal en JPEG ; la photo d'aujourd'hui, elle,
		 * y gagne.
		 *
		 * ET LA PHOTO DE 1950 LE REFUSE, ce qui ne se devine pas : sa couche est
		 * servie en QUATRE bandes, et le service repond alors 400 *« Used data
		 * format (4 band(s) UINT8) and expected output format (image/jpeg) are
		 * not consistent »*. Un cadre vide, pas un message. Elle est donc la
		 * seule photo de cette liste a partir en PNG, et ce n'est pas un oubli
		 * a corriger.
		 */
		FORMAT: fond === 'photo' ? 'image/jpeg' : 'image/png'
	});
	return `${SERVEUR}?${parametres.toString()}`;
}
