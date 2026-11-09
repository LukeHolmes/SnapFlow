// Compact on-device name lists (US/UK common given + family names). ~12KB source,
// zero runtime deps — trades recall vs. a cloud NER model for size and privacy.

const FIRST_RAW =
  'james,mary,john,patricia,robert,jennifer,michael,linda,william,elizabeth,david,barbara,richard,susan,joseph,jessica,thomas,sarah,charles,karen,christopher,nancy,daniel,lisa,matthew,betty,anthony,margaret,mark,sandra,donald,ashley,steven,kimberly,paul,donna,andrew,carol,joshua,michelle,kenneth,emily,kevin,dorothy,brian,amanda,george,melissa,edward,deborah,ronald,stephanie,timothy,rebecca,jason,laura,jeffrey,sharon,ryan,cynthia,jacob,kathleen,gary,amy,nicholas,angela,eric,shirley,jonathan,anna,stephen,helen,larry,samantha,justin,olivia,scott,brittany,brandon,diana,frank,marie,gregory,kayla,raymond,crystal,alexander,samuel,lauren,patrick,heather,jack,debra,dennis,emma,walter,amber,jerry,julia,henry,martha,alan,rachel,arthur,victoria,jesse,maria,lawrence,heidi,billy,jordan,albert,michele,dylan,brenda,carolyn,bruce,kathy,willie,diane,gabriel,ann,zachary,julie,noah,joyce,roy,russell,joan,vincent,philip,bobby,judith,harry,megan,juan,alice,wayne,andrea,catherine,gloria,ralph,doris,roger,marilyn,eugene,jean,benjamin,luke,hannah,natalie,audrey,claire,faith,rose';

const LAST_RAW =
  'smith,johnson,williams,brown,jones,garcia,miller,davis,rodriguez,martinez,hernandez,lopez,gonzalez,wilson,anderson,thomas,taylor,moore,jackson,martin,lee,perez,thompson,white,harris,sanchez,clark,ramirez,lewis,robinson,walker,young,allen,king,wright,scott,torres,nguyen,hill,flores,green,adams,nelson,baker,hall,rivera,campbell,mitchell,carter,roberts,gomez,phillips,evans,turner,diaz,parker,cruz,edwards,collins,reyes,stewart,morris,morales,murphy,cook,rogers,gutierrez,ortiz,morgan,cooper,peterson,bailey,reed,kelly,howard,ramos,kim,cox,ward,richardson,watson,brooks,chavez,wood,james,bennett,gray,mendoza,ruiz,hughes,price,alvarez,castillo,sanders,patel,myers,long,ross,foster,jimenez,powell,jenkins,perry,russell,sullivan,bell,coleman,butler,henderson,barnes,gibson,holmes,murray,holland,owen,freeman,wells,webb,simpson,stevens,porter,hunter,hicks,crawford,harrison,gordon,connor,wallace,west,grant,stone,mills,nichols';

function toSet(csv: string): Set<string> {
  const s = new Set<string>();
  for (const part of csv.split(',')) {
    const w = part.trim().toLowerCase();
    if (w.length > 1) s.add(w);
  }
  return s;
}

export const FIRST_NAMES = toSet(FIRST_RAW);
export const LAST_NAMES = toSet(LAST_RAW);

/** UI / calendar tokens that look Title Case but are not person names. */
export const PII_NAME_STOPWORDS = new Set([
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
  'submit', 'cancel', 'login', 'logout', 'sign', 'password', 'email', 'phone', 'address', 'total', 'amount', 'date', 'time',
  'error', 'warning', 'success', 'failed', 'button', 'click', 'settings', 'profile', 'account', 'search', 'library',
  'dashboard', 'history', 'capture', 'screen', 'window', 'region', 'scroll', 'save', 'delete', 'edit', 'copy', 'send',
  'snapflow', 'github', 'slack', 'notion', 'gmail', 'chrome', 'safari', 'firefox', 'windows', 'android', 'iphone',
  'version', 'build', 'release', 'update', 'install', 'download', 'upload', 'file', 'image', 'photo', 'video',
  'north', 'south', 'east', 'west', 'street', 'road', 'avenue', 'lane', 'city', 'state', 'county', 'kingdom',
  'united', 'states', 'america', 'europe', 'english', 'french', 'german', 'india', 'china', 'japan',
]);
