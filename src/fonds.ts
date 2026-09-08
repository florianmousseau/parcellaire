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

export type Fond = 'cadastre' | 'cote' | 'photo' | 'plan';

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
	}
];

/* -------------------------------------------------------------------------- */
/* LES MILLESIMES DE LA PHOTO                                                  */
/* -------------------------------------------------------------------------- */

/*
 * LA MEME EMPRISE, NEUF FOIS, DEPUIS 1950.
 *
 * L'IGN sert ses campagnes aeriennes comme autant de couches du meme serveur.
 * La photo n'est donc pas UN fond de plus, c'est un fond qui porte une DATE, et
 * la date se change sans quitter la photo - le geste de Google Maps, ni un
 * onglet par annee ni un choix a faire avant d'avoir vu l'image.
 *
 * CE SONT LES MOSAIQUES CONSOLIDEES, PAS LES COUCHES ANNEE PAR ANNEE. Le
 * service publie aussi `ORTHOPHOTOS2001` a `ORTHOPHOTOS2024` : ce sont les
 * campagnes brutes, et l'IGN couvre la France par rotation d'environ trois
 * ans, donc chacune ne porte qu'un tiers du pays. Les mosaïques par periode,
 * elles, sont faites pour etre completes.
 *
 * ET ELLES NE LE SONT PAS TOUJOURS. Mesure du 2026-09-08 : `1980-1995` rend
 * une image VIDE a Paris 2e et a Vitry-sur-Seine, et une image PLEINE a
 * Renaze. Une couche presente aux capacites ne prouve donc rien sur un point
 * donne : c'est a l'appelant de sonder (`urlDeLaSonde`) avant de proposer un
 * cran, et de dire celui qui ne repond pas plutot que de le cacher.
 */
export interface Millesime {
	/** Ce qui voyage dans l'adresse : `?millesime=1950`. */
	readonly cle: string;
	/** Ce que le lecteur lit sur le cran : « 1950-1965 ». */
	readonly libelle: string;
	readonly couche: string;
	/**
	 * LE FORMAT EST UNE DONNEE, PAS UNE DEDUCTION.
	 *
	 * Les trois campagnes anciennes sont servies en QUATRE bandes et repondent
	 * 400 au JPEG - *« Used data format (4 band(s) UINT8) and expected output
	 * format (image/jpeg) are not consistent »*, un cadre vide sans message.
	 * Mesure du 2026-09-08, les trois, contre les six autres en 200. Le champ
	 * est ici plutot que devine sur le nom de la couche pour qu'un millesime
	 * ajoute demain oblige a le mesurer.
	 */
	readonly format: 'png' | 'jpeg';
}

/* Le type dit que la liste n'est pas vide : sans cela, chaque lecture porterait
   un `undefined` que le repli devrait traiter comme une erreur possible. */
export const MILLESIMES: readonly [Millesime, ...Millesime[]] = [
	{
		cle: '1950',
		libelle: '1950-1965',
		couche: 'ORTHOIMAGERY.ORTHOPHOTOS.1950-1965',
		format: 'png'
	},
	{
		cle: '1965',
		libelle: '1965-1980',
		couche: 'ORTHOIMAGERY.ORTHOPHOTOS.1965-1980',
		format: 'png'
	},
	{
		cle: '1980',
		libelle: '1980-1995',
		couche: 'ORTHOIMAGERY.ORTHOPHOTOS.1980-1995',
		format: 'png'
	},
	{
		cle: '2000',
		libelle: '2000-2005',
		couche: 'ORTHOIMAGERY.ORTHOPHOTOS2000-2005',
		format: 'jpeg'
	},
	{
		cle: '2006',
		libelle: '2006-2010',
		couche: 'ORTHOIMAGERY.ORTHOPHOTOS2006-2010',
		format: 'jpeg'
	},
	{
		cle: '2011',
		libelle: '2011-2015',
		couche: 'ORTHOIMAGERY.ORTHOPHOTOS2011-2015',
		format: 'jpeg'
	},
	{
		cle: '2016',
		libelle: '2016-2020',
		couche: 'ORTHOIMAGERY.ORTHOPHOTOS2016-2020',
		format: 'jpeg'
	},
	{
		cle: '2021',
		libelle: '2021-2023',
		couche: 'ORTHOIMAGERY.ORTHOPHOTOS2021-2023',
		format: 'jpeg'
	},
	{
		cle: 'auj',
		libelle: "Aujourd'hui",
		couche: 'ORTHOIMAGERY.ORTHOPHOTOS',
		format: 'jpeg'
	}
];

/** La derniere prise de vue : c'est elle que la photo sert sans qu'on demande. */
export const MILLESIME_PAR_DEFAUT = 'auj';

/** Le millesime demande, ou le dernier : un mot inconnu ne fait pas une erreur. */
export function millesimeDemande(valeur: string | null): Millesime {
	const trouve = MILLESIMES.find((m) => m.cle === valeur);
	return trouve ?? definitionDuMillesime(MILLESIME_PAR_DEFAUT);
}

export function definitionDuMillesime(cle: string): Millesime {
	// La liste est close et `millesimeDemande` la garde : le repli sert au type.
	return MILLESIMES.find((m) => m.cle === cle) ?? MILLESIMES[0];
}

/** L'image d'un millesime, au cadre exact du dessin. */
export const urlDuMillesime = (
	millesime: Millesime,
	cadre: Cadre,
	largeur: number,
	hauteur: number
): string => imageWms(millesime.couche, cadre, largeur, hauteur, millesime.format, true);

/**
 * L'adresse qui dit si ce millesime couvre ce cadre : la MEME image, en 8 x 8.
 *
 * Une couche presente aux capacites du service ne prouve rien sur un point
 * donne, et une image vide n'est pas une erreur : elle sort en 200 et se
 * dessine en blanc. Le seul signal est le POIDS. Mesure du 2026-09-08 en
 * 8 x 8 PNG : 71 octets la ou la campagne ne couvre pas, 135 a 242 la ou elle
 * couvre - un ecart de deux a trois fois, sur tous les points sondes.
 *
 * En PNG QUELLE QUE SOIT la couche, et c'est ce qui rend le seuil comparable :
 * les six couches recentes acceptent le JPEG, dont un 8 x 8 pese 640 octets
 * pleins comme vides. Un seuil pose sur deux formats ne mesurerait rien.
 */
export const urlDeLaSonde = (millesime: Millesime, cadre: Cadre): string =>
	imageWms(millesime.couche, cadre, SONDE, SONDE, 'png', false);

/** Le cote de la sonde, en pixels. */
const SONDE = 8;

/** Au-dela de ce poids, la campagne a couvert ce cadre. */
export const SONDE_PLEINE = 100;

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
	if (couche === DGFIP) {
		/*
		 * Sans commune, ou sur une commune que leur WMS refuse, on ne demande RIEN
		 * et l'appelant redessine le plan lui-meme. Une image en erreur laisserait
		 * un cadre vide a la place du plan par defaut - dix-neuf communes.
		 */
		if (insee === null || !sertLePlanDgfip(insee)) return null;
		const facteur = Math.min(DENSITE, COTE_MAX_DEMANDE / Math.max(largeur, hauteur, 1));
		const enPixels = (v: number) => Math.max(1, Math.round(v * facteur));
		return planDgfip(insee, cadre, enPixels(largeur), enPixels(hauteur));
	}
	// Le trait du plan IGN se hache en JPEG ; la photo, elle, y gagne en poids.
	return imageWms(couche, cadre, largeur, hauteur, fond === 'photo' ? 'jpeg' : 'png', true);
}

/**
 * Une image du WMS de la Geoplateforme, au cadre exact demande.
 *
 * `CRS:84` plutot que `EPSG:4326` : en WMS 1.3.0 le second impose l'ordre
 * latitude-longitude, que la moitie des exemples du web ecrit a l'envers.
 *
 * `plusFine` porte le doublement de l'echantillonnage : vrai pour ce qui
 * s'affiche, faux pour une sonde, dont on veut les huit pixels demandes et pas
 * seize.
 */
function imageWms(
	couche: string,
	cadre: Cadre,
	largeur: number,
	hauteur: number,
	format: 'png' | 'jpeg',
	plusFine: boolean
): string {
	const facteur = plusFine
		? Math.min(DENSITE, COTE_MAX_DEMANDE / Math.max(largeur, hauteur, 1))
		: 1;
	const enPixels = (v: number) => Math.max(1, Math.round(v * facteur));
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
		FORMAT: `image/${format}`
	});
	return `${SERVEUR}?${parametres.toString()}`;
}
