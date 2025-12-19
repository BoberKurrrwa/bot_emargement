FORMATION = "" //cyberdefense, cyberlog ou cyberdata
A = "" //3, 4 ou 5
TP = "" //1, 2, 3, 4, 5 ou 6

var username = "" // mettez votre username moodle, du type exxxxxxx
var password = "" // mettez votre mdp moodle

const ignoredCourses1 = ["[CM] - Projet Cyber","[autonomie TD1] - Projet Cyber", "[autonomie TD2] - Projet Cyber", "[autonomie TD3] - Projet Cyber", "[BDE] Week-End de Cohésion (lundi)", "[BDE] Week-End de Cohésion (mardi)", "Lancement Le Robert : CD3+IC3 \\; CD4+IC4 (néo-entrants)", "[BDE] Réunion présentation WEC (Vannes)", "[A4 Vannes] Réunion d'information : mobilité internationale", "Activités GCC", "Activités HACK2G2", "[distanciel] Le Robert (néo-entrants+rattrapage) : certification blanche : A4+A5", "[distanciel] Le Robert - certification finale (+1/3 temps) : A4 (néo-entrants) ; A4+A5 (rattrapage)", "[A4 FISA] Examen TOEIC (session aménagée)"]; 

const slots1 = [
  { start: "08:00", end: "09:30" },
  { start: "09:45", end: "11:15" },
  { start: "11:30", end: "13:00" },
  { start: "13:00", end: "14:30" },
  { start: "14:45", end: "16:15" },
  { start: "16:30", end: "18:00" },
  { start: "18:15", end: "19:45" }
];

function globale() {
  var lien = withRetry1(recupQuestion, 2500);
  comparer(lien);
}

function decodeSamlParamsFromUrl(url) {
  const qIndex = url.indexOf("?");
  const qs = qIndex >= 0 ? url.substring(qIndex + 1) : url;
  const params = qs.split("&").reduce((acc, kv) => {
    const [k, v = ""] = kv.split("=");
    acc[decodeURIComponent(k)] = decodeURIComponent(v || "");
    return acc;
  }, {});
  const rawSaml = params.SAMLRequest || params.SAMLResponse || "";
  const relay = params.RelayState || "";

  function base64WebSafeToBytes(b64) {
    if (!b64) return [];
    let s = b64.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4 !== 0) s += "=";
    return Utilities.base64Decode(s);
  }
  const samlBytes = base64WebSafeToBytes(rawSaml);
  let maybeText = "";
  try {
    maybeText = Utilities.newBlob(samlBytes).getDataAsString();
  } catch (e) {
  }
  return {
    relayState: relay,
    samlRawBase64: rawSaml,
    samlBytes: samlBytes,
    samlTextPreview: maybeText
  };
}

function extractSetCookies(headers) {
  if (!headers) return [];
  const sc = headers["Set-Cookie"] || headers["set-cookie"];
  if (!sc) return [];
  return Array.isArray(sc) ? sc.map(s => s.split(";")[0]) : [sc.split(";")[0]];
}

function mergeCookieJar(oldJar, newSetCookies) {
  const map = {};
  if (oldJar) {
    oldJar.split(";").map(s => s.trim()).filter(Boolean).forEach(pair => {
      const idx = pair.indexOf("=");
      const k = idx>0 ? pair.substring(0, idx) : pair;
      const v = idx>0 ? pair.substring(idx+1) : "";
      map[k] = v;
    });
  }
  (newSetCookies || []).forEach(kv => {
    const idx = kv.indexOf("=");
    const k = idx>0 ? kv.substring(0, idx) : kv;
    const v = idx>0 ? kv.substring(idx+1) : "";
    map[k] = v;
  });
  return Object.entries(map).map(([k,v]) => `${k}=${v}`).join("; ");
}

function submitCasLogin(html, username, password, cookieJar) {
  const actionMatch = html.match(/<form[^>]*action="([^"]+)"/i);
  if (!actionMatch) throw new Error("Impossible de trouver l'action du formulaire");
  let actionUrl = actionMatch[1];
  if (!/^https?:/i.test(actionUrl)) {
    // URL relative → compléter avec le domaine IdP
    actionUrl = "https://cas.univ-ubs.fr/" + actionUrl.replace(/^\/?/, "");
  }


  const inputs = {};
  const regex = /<input[^>]*type="hidden"[^>]*name="([^"]+)"[^>]*value="([^"]*)"/gi;
  let m;
  while ((m = regex.exec(html)) !== null) {
    inputs[m[1]] = m[2];
  }

  inputs["username"] = username;
  inputs["password"] = password;

  const res = UrlFetchApp.fetch("https://cas.univ-ubs.fr/login", {
    method: "post",
    payload: inputs,
    headers: {
      "Cookie": cookieJar,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    followRedirects: false,
    muteHttpExceptions: true
  });


  return res;
}

function handleTicketRedirect(response, jar) {
  let headers = response.getAllHeaders();
  let location = headers["Location"];

  if (!location) {
    return null;
  }

  if (location.includes("ticket=")) {

    let moodleRes = UrlFetchApp.fetch(location, {
      method: "get",
      headers: {
        "Cookie": jar
      },
      muteHttpExceptions: true,
      followRedirects: false
    });


    let setCookie = moodleRes.getAllHeaders()["Set-Cookie"];
    if (setCookie) {
      jar.push(setCookie.split(";")[0]);
    }

    return moodleRes;
  }

  return null;
}

function htmlDecode(str) {
  if (!str) return str;
  str = str.replace(/&#x([0-9a-fA-F]+);/g, function(_, hex) {
    return String.fromCharCode(parseInt(hex, 16));
  });
  str = str.replace(/&#(\d+);/g, function(_, dec) {
    return String.fromCharCode(Number(dec));
  });

  const named = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&apos;': "'"
  };
  str = str.replace(/&(amp|lt|gt|quot|apos);/g, function(_, name) {
    return named['&' + name + ';'] || '&' + name + ';';
  });
  return str;
}

function extractFormFields(body, baseUrl) {
  if (typeof body !== 'string') body = body.getContentText();

  const actionMatch = body.match(/<form[^>]*\saction=(?:"([^"]+)"|'([^']+)'|([^>\s]+))/i);
  let actionUrl = actionMatch ? (actionMatch[1] || actionMatch[2] || actionMatch[3]) : null;
  actionUrl = htmlDecode(actionUrl);

  const relayMatch = body.match(/name=['"]?RelayState['"]?[^>]*value=(?:"([^"]*)"|'([^']*)'|([^>\s]*))/i);
  const samlMatch  = body.match(/name=['"]?SAMLResponse['"]?[^>]*value=(?:"([^"]*)"|'([^']*)'|([^>\s]*))/i);

  const relayState = relayMatch ? htmlDecode(relayMatch[1] || relayMatch[2] || relayMatch[3]) : null;
  const samlResponse = samlMatch ? htmlDecode(samlMatch[1] || samlMatch[2] || samlMatch[3]) : null;

  if (actionUrl && !/^https?:\/\//i.test(actionUrl)) {
    if (/^\/\//.test(actionUrl)) {
      actionUrl = 'https:' + actionUrl;
    } else if (/^\//.test(actionUrl) && baseUrl) {
      const m = baseUrl.match(/^(https?:\/\/[^\/]+)/i);
      if (m) actionUrl = m[1] + actionUrl;
    } else if (baseUrl && !/^\w+:/.test(actionUrl)) {
      const m = baseUrl.match(/^(https?:\/\/[^\/]+)(\/.*)?$/i);
      if (m) {
        const basePath = (m[2] || '/').replace(/\/[^\/]*$/, '/'); 
        actionUrl = m[1] + basePath + actionUrl.replace(/^\/+/, '');
      }
    }
  }

  return { actionUrl, relayState, samlResponse };
}

function extractPresenceLink(html) {
  const regex = /https:\/\/moodle\.univ-ubs\.fr\/mod\/attendance\/view\.php\?id=\d+/i;
  const match = html.match(regex);
  if (match) {
    return match[0]; 
  }
  return null;
}

function extractAttendanceLink(html) {
  const regex = /<a\s+href="(https:\/\/moodle\.univ-ubs\.fr\/mod\/attendance\/attendance\.php\?[^"]+)">Envoyer le statut de présence<\/a>/i;
  const match = html.match(regex);
  return match ? match[1] : null;
}

function recupQuestion() {
  const moodleUrl = "https://moodle.univ-ubs.fr/auth/shibboleth/login.php";
  let jar = "";
  let jarjarjar = "";
  let indexphp ="";
  let res1 = UrlFetchApp.fetch(moodleUrl, {
    method: "get",
    muteHttpExceptions: true,
    followRedirects: false
  });

  let headers1 = res1.getAllHeaders();
  let sessionCookie = headers1["Set-Cookie"];
  jarjarjar = mergeCookieJar(jarjarjar, extractSetCookies(res1.getAllHeaders()));
  indexphp = mergeCookieJar(jarjarjar, extractSetCookies(res1.getAllHeaders()));

  const payload = {
    idp: "urn:mace:cru.fr:federation:univ-ubs.fr"
  };

  let res2 = UrlFetchApp.fetch(moodleUrl, {
    method: "post",
    payload: payload,
    headers: {
      "Cookie": sessionCookie
    },
    muteHttpExceptions: true,
    followRedirects: false
  });

  let headers2 = res2.getAllHeaders();
  let jarjar = "";
  jarjar = mergeCookieJar(jarjar, extractSetCookies(res2.getAllHeaders()));
  indexphp = mergeCookieJar(jarjarjar, extractSetCookies(res2.getAllHeaders()));
  sessionCookie = headers2["Set-Cookie"];
  let redirect = res2.getAllHeaders()["Location"];

  var sso="https://moodle.univ-ubs.fr"+redirect;
  let res3 = UrlFetchApp.fetch(sso, {
    method: "get",
    headers: {
      "Cookie": sessionCookie
    },
    muteHttpExceptions: true,
    followRedirects: false
  });

  let headers3 = res3.getAllHeaders();
  sessionCookie = headers3["Set-Cookie"];
  jarjarjar = mergeCookieJar(jarjarjar, extractSetCookies(res3.getAllHeaders()));
  redirect = res3.getAllHeaders()["Location"];

  let res4 = UrlFetchApp.fetch(redirect, {
    method: "get",
    headers: {
      "Cookie": sessionCookie
    },
    muteHttpExceptions: true,
    followRedirects: false
  });

  let headers4 = res4.getAllHeaders();
  sessionCookie = headers4["Set-Cookie"];
  redirect = res4.getAllHeaders()["Location"];
  var idp = "https://idp.univ-ubs.fr"+ redirect;

  let res5 = UrlFetchApp.fetch("https://idp.univ-ubs.fr"+ redirect, {
    method: "get",
    headers: {
      "Cookie": sessionCookie
    },
    muteHttpExceptions: true,
    followRedirects: false
  });
  redirect = res5.getAllHeaders()["Location"];

  let res6 = UrlFetchApp.fetch("https://idp.univ-ubs.fr"+ redirect, {
    method: "get",
    headers: {
      "Cookie": sessionCookie
    },
    muteHttpExceptions: true,
    followRedirects: false
  });

  redirect = res6.getAllHeaders()["Location"];

  let res7 = UrlFetchApp.fetch(redirect, {
    method: "get",
    headers: {
      "Cookie": sessionCookie
    },
    muteHttpExceptions: true,
    followRedirects: false
  });

  var redirect1 = res7.getAllHeaders()["Location"];
  sessionCookie = res7.getAllHeaders()["Set-Cookie"];
  jar = mergeCookieJar(jar, extractSetCookies(res1.getAllHeaders()));
  jar = mergeCookieJar(jar, extractSetCookies(res2.getAllHeaders()));
  jar = mergeCookieJar(jar, extractSetCookies(res3.getAllHeaders()));
  jar = mergeCookieJar(jar, extractSetCookies(res4.getAllHeaders()));
  jar = mergeCookieJar(jar, extractSetCookies(res5.getAllHeaders()));
  jar = mergeCookieJar(jar, extractSetCookies(res6.getAllHeaders()));
  jar = mergeCookieJar(jar, extractSetCookies(res7.getAllHeaders()));
  let html7 = res7.getContentText();
  let cas = submitCasLogin(html7, username, password, jar);
  jar = mergeCookieJar(jar, extractSetCookies(cas.getAllHeaders()));

  redirect = cas.getAllHeaders()["Location"];
  sessionCookie = cas.getAllHeaders()["Set-Cookie"];

  let finalRes = handleTicketRedirect(cas, jar);

  if (finalRes) {
  } else {
  }

  let res8 = UrlFetchApp.fetch("https://idp.univ-ubs.fr"+finalRes.getAllHeaders()["Location"], {
      method: "get",
      headers: {
        "Cookie": jar
      },
      muteHttpExceptions: true,
      followRedirects: false
    });

  sessionCookie = res8.getAllHeaders()["Set-Cookie"];
  jar = mergeCookieJar(jar, extractSetCookies(res8.getAllHeaders()));
  let body = res8.getContentText();
  let postfinal = extractFormFields(body, "https://idp.univ-ubs.fr"+finalRes.getAllHeaders()["Location"]);

  let res9 = UrlFetchApp.fetch("https://moodle.univ-ubs.fr/Shibboleth.sso/SAML2/POST", {
      method: "post",
      payload: {
        "RelayState": postfinal.relayState,
        "SAMLResponse": postfinal.samlResponse
      },
      headers: {
        "Cookie": jarjarjar 
      },
      followRedirects: false,
      muteHttpExceptions: true
    });

  sessionCookie = res9.getAllHeaders()["Set-Cookie"];

  jarjar = mergeCookieJar(jarjar, extractSetCookies(res9.getAllHeaders()))
  jarjarjar = mergeCookieJar(jarjarjar, extractSetCookies(res9.getAllHeaders()));;
  indexphp = mergeCookieJar(jarjarjar, extractSetCookies(res9.getAllHeaders()));;

  redirect = res9.getAllHeaders()["Location"];

  let res10 = UrlFetchApp.fetch(redirect, {
      method: "get",
      headers: {
        "Cookie": indexphp 
      },
      followRedirects: false,
      muteHttpExceptions: true
    });

  sessionCookie = res10.getAllHeaders()["Set-Cookie"];
  jarjar = mergeCookieJar(jarjar, extractSetCookies(res10.getAllHeaders()));
  redirect = res10.getAllHeaders()["Location"];
  jarjarjar = mergeCookieJar(jarjarjar, extractSetCookies(res10.getAllHeaders()));

  let res11 = UrlFetchApp.fetch(redirect, {
      method: "get",
      headers: {
        "Cookie": jarjar 
      },
      followRedirects: false,
      muteHttpExceptions: true
    });
  sessionCookie = res11.getAllHeaders()["Set-Cookie"];
  redirect = res11.getAllHeaders()["Location"];

  let res12 = UrlFetchApp.fetch("https://moodle.univ-ubs.fr/course/view.php?id=10731", {
        method: "get",
        headers: {
          "Cookie": jarjar 
        },
        followRedirects: false,
        muteHttpExceptions: true
      });
  redirect = res12.getAllHeaders()["Location"];
  sessionCookie = res12.getAllHeaders()["Set-Cookie"];

  let link = res12.getContentText()
  link = extractPresenceLink(link);
  if (link === null){
    return link;
  }

  let res13 = UrlFetchApp.fetch(link+"&view=4", {
        method: "get",
        headers: {
          "Cookie": jarjar 
        },
        followRedirects: false,
        muteHttpExceptions: true
      });
  let html = res13.getContentText();

  const tableRegex = /<table\b[^>]*class=(["'])(?:(?!\1).)*\bgeneraltable\b(?:(?!\1).)*\1[^>]*>([\s\S]*?)<\/table>/i;

  const tableMatch = html.match(tableRegex);
  if (!tableMatch) {
    return { erreur: "Aucune table avec classe 'generaltable' trouvée", resultat: [] };
  }
  const tableHtml = tableMatch[0];

  function stripTags(s) {
    if (!s) return "";
    let t = s.replace(/<[^>]*>/g, "");
    t = t.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'");
    return t.trim();
  }

  // Récupérer toutes les lignes <tr> ... </tr>
  const trRegex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  const rows = [];
  let trMatch;
  while ((trMatch = trRegex.exec(tableHtml)) !== null) {
    const trHtml = trMatch[1]; // contenu interne du tr
    rows.push(trHtml);
  }

  // Pour chaque ligne, récupérer tous les <td> ou <th> avec leurs classes et contenu
  function parseCells(trInnerHtml) {
    const cellRegex = /<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
    const cells = [];
    let m;
    while ((m = cellRegex.exec(trInnerHtml)) !== null) {
      const attrs = m[2];
      const inner = m[3];
      const clsMatch = attrs.match(/\bclass\s*=\s*(['"])(.*?)\1/i);
      const cls = clsMatch ? clsMatch[2] : "";
      cells.push({ class: cls, html: inner, text: stripTags(inner) });
    }
    return cells;
  }

  // lignes où la cellule "remarkscol c4 lastcol" est vide
  const listeSansRemarks = [];
  rows.forEach((trInner, idx) => {
    const cells = parseCells(trInner);
    const remarksCell = cells.find(c => {
      const cls = c.class || "";
      return /\bremarkscol\b/i.test(cls) && /\bc4\b/i.test(cls) && /\blastcol\b/i.test(cls);
    });
    if (remarksCell) {
      if (remarksCell.text === "" ) {
        listeSansRemarks.push({ index: idx, trHtml: trInner, cells: cells });
      }
    }
  });

  // parmi ces lignes, garder celles où "pointscol c3" contient "? / 2"
  const listeAvecPointsInterro = [];
  listeSansRemarks.forEach(item => {
    const cells = item.cells;
    const pointsCell = cells.find(c => {
      const cls = c.class || "";
      return /\bpointscol\b/i.test(cls) && /\bc3\b/i.test(cls);
    });
    if (pointsCell) {
      if (pointsCell.text.indexOf("? / 2") !== -1) {
        listeAvecPointsInterro.push({
          index: item.index,
          pointsText: pointsCell.text,
          cells: cells
        });
      }
    }
  });

  let textesAvec = [];
  listeAvecPointsInterro.forEach(cels => {
    const cells_text = cels.cells[0].text
    textesAvec.push(cells_text);
  });


  let listeDifferente = [];

  listeDifferente = listeSansRemarks.filter(s => {
  const name = !textesAvec.some(word => s.cells[0].text.includes(word));
  return name;
  });

  return {listeAvecPointsInterro,listeSansRemarks,listeDifferente};
}


function parseICalDate(str) {
  const match = str.match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?/);
  if (!match) return null;
  const [_, y, m, d, h, min, s] = match;
  return new Date(Date.UTC(y, m - 1, d, h, min, s));
}

function parseICS(url) {
  const response = UrlFetchApp.fetch(url);
  const icsData = response.getContentText();
  
  const events = [];
  const lines = icsData.split(/\r?\n/);
  let currentEvent = null;
  
  for (let line of lines) {
    line = line.trim();

    if (line === 'BEGIN:VEVENT') {
      currentEvent = {};
    } else if (line === 'END:VEVENT') {
      events.push(currentEvent);
      currentEvent = null;
    } else if (currentEvent) {
      const [key, ...valueParts] = line.split(':');
      const value = valueParts.join(':');

      switch (true) {
        case key.startsWith('SUMMARY'):
          currentEvent.name = value;
          break;
        case key.startsWith('DTSTART'):
          currentEvent.start = parseICalDate(value);
          break;
        case key.startsWith('DTEND'):
          currentEvent.end = parseICalDate(value);
          break;
        case key.startsWith('LOCATION'):
          currentEvent.location = value;
          break;
      }
    }
  }

  return events;
}


function choixId() {
  if (FORMATION === "cyberdefense"){
    if (A === "3"){
      if (TP === "1"){
        return [85,4770];
      }
      if (TP === "2"){
        return [334,4838];
      }
      if (TP === "3"){
        return [3733,5256];
      }
      if (TP === "4"){
        return [3851,4473];
      }
      if (TP === "5"){
        return [7198,7204];
      }
      if (TP === "6"){
        return [7200,7203];
      }
    }
    if (A === "4"){
      if (TP === "1"){
        return [2860,4866];
      }
      if (TP === "2"){
        return [4517,4848];
      }
      if (TP === "3"){
        return [4938,4820];
      }
      if (TP === "4"){
        return [4948,4821];
      }
      if (TP === "5"){
        return [6024,6102];
      }
      if (TP === "6"){
        return [6052,6125];
      }
    }
    if (A === "5"){
      if (TP === "1"){
        return [4965,null];
      }
      if (TP === "2"){
        return [4958,null];
      }
      if (TP === "3"){
        return [2422,null];
      }
      if (TP === "4"){
        return [2424,null];
      }
      if (TP === "5"){
        return [4983,null];
      }
      if (TP === "6"){
        return [4989,null];
      }
    }
  }
  if (FORMATION === "cyberlog"){
    if (A === "3"){
      if (TP === "1"){
        return [1026,5132];
      }
      if (TP === "2"){
        return [9358,9359];
      }
    }
    if (A === "4"){
      if (TP === "1"){
        return [1771,645];
      }
      if (TP === "2"){
        return [9983,9917];
      }
    }
    if (A === "5"){
      if (TP === "1"){
        return [9994,null];
      }
      if (TP === "2"){
        return [9992,null];
      }
    }
  }
  if (FORMATION === "cyberdata"){
    if (A === "3"){
      if (TP === "1"){
        return [4426,5258];
      }
      if (TP === "2"){
        return [8954,8955];
      }
    }
    if (A === "4"){
      if (TP === "1"){
        return [154,2187];
      }
      if (TP === "2"){
        return [9982,9916];
      }
    }
    if (A === "5"){
      if (TP === "1"){
        return [6371,null];
      }
      if (TP === "2"){
        return [4096,null];
      }
    }
  }
}

function appel(icsUrl){
  let lastError;
  for (let i = 0; i < 3; i++) {
    try {
      return events1 = parseICS(icsUrl);  
    } catch (e) {
      lastError = e;
      Logger.log("Tentative " + (i+1) + " échouée : " + e.message);
      Utilities.sleep(200);
    }
  }
}

function ExtractICS() {
  const first = new Date();
  const last = new Date();
  first.setMonth(first.getMonth()-12);
  last.setMonth(last.getMonth()+12);

  var [id1, id2] = choixId();
  const url1 = "planning.univ-ubs.fr/jsp/custom/modules/plannings/anonymous_cal.jsp?resources="+id1+"&projectId=1&calType=ical&firstDate="+first.getFullYear()+"-"+first.getMonth()+"-"+first.getDate()+"&lastDate="+last.getFullYear()+"-"+last.getMonth()+"-"+last.getDate();
  
  var events1 = appel(url1);
  
  let eventsfiltered1 = events1.filter(s => {
  const summaryOk = !ignoredCourses1.some(word => s.name.includes(word));
  return summaryOk;
  });
  if (id2 == null){
    return eventsfiltered1;
  }
  else {
    const url2 = "planning.univ-ubs.fr/jsp/custom/modules/plannings/anonymous_cal.jsp?resources="+id2+"&projectId=1&calType=ical&firstDate="+first.getFullYear()+"-"+first.getMonth()+"-"+first.getDate()+"&lastDate="+last.getFullYear()+"-"+last.getMonth()+"-"+last.getDate();
    var events2 = appel(url2);
    let eventsfiltered2 = events2.filter(s => {
    const summaryOk = !ignoredCourses1.some(word => s.name.includes(word));
    return summaryOk;
    });
    var eventsConcat = eventsfiltered1.concat(eventsfiltered2);
    return eventsConcat;
  }
}

function appelUrl(url){
  let lastError;
  for (let i = 0; i < 3; i++) {
    try {
      return response = UrlFetchApp.fetch(url);  
    } catch (e) {
      lastError = e;
      Logger.log("Tentative " + (i+1) + " échouée : " + e.message);
      Utilities.sleep(200);
    }
  }
}

function planning(semestre){
  var url = "https://planningsup.app/api/plannings/ensibs." + FORMATION + "." + A + "emeannee.semestre" + semestre + "s" + semestre + ".tp" + TP + "?events=true";
  var response = appelUrl(url);
  var json = JSON.parse(response.getContentText());
  return json
}

function url() {
  a=planning(A*2-1);
  b=planning(A*2);
  var events1 = (a && Array.isArray(a.plannings) && a.plannings[0] && Array.isArray(a.plannings[0].events))
                ? a.plannings[0].events : [];
  var events2 = (b && Array.isArray(b.plannings) && b.plannings[0] && Array.isArray(b.plannings[0].events))
                ? b.plannings[0].events : [];
  var eventsConcat = events1.concat(events2);
  eventsConcat = eventsConcat.filter(s => {
  const summaryOk = !ignoredCourses1.some(word => s.name.includes(word));
  return summaryOk;
  });
  return eventsConcat;
}

function laData1(){
  let miam = ExtractICS();
  if (miam == 0){
    miam = url();
  }
  return miam;
}



function convertirTimestamp(texte) {
  // Exemple : "10.03.25 (lun.) 09:45 - 11:15"

  const dateMatch = texte.match(/(\d{1,2})\.(\d{1,2})\.(\d{2})/);
  if (!dateMatch) return null;
  
  var [_, j, m, aa] = dateMatch;
  j = j.padStart(2, "0");
  m = m.padStart(2, "0");

  const timeMatch = texte.match(/[0-9]+:[0-9]+/g);
  if (!timeMatch) return null;

  const heureDebut = timeMatch[0];
  const heureFin = timeMatch[1];

  const annee = 2000 + parseInt(aa, 10);

  const s = `${annee}-${m}-${j}T${heureDebut}:00`;
  const s1 = `${annee}-${m}-${j}T${heureFin}:00`;

  let date1 = new Date(s);
  let date2 = new Date(s1);
  return {date1, date2};
}


function parsing(md){
  let newMd = []
  md.forEach(ev => {
    const premiereCellule = ev.cells[0]; 
    var raw = premiereCellule.text;    
    ts = convertirTimestamp(raw);
    var debut = ts.date1;
    var fin = ts.date2; 
    ev.timestampDate = debut;
    ev.timestampDateFin = fin;
    newMd.push(ev);
  });
  newMd.sort((a, b) => a.timestampDate - b.timestampDate);
  return newMd;
}


function calculerCreneauxOccupes(events) {

  const result = [];

  let current = new Date(2025, 8, 8);  // 8 septembre 2025 (mois = 8 car 0-indexé)
  
  const today = new Date();
  const endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);

  while (current <= endDate) {

    const day = current.getDay();
    if (day !== 0 && day !== 6) {
      const sameDayEvents = events.filter(ev =>
        new Date(ev.start).toDateString() === new Date(current).toDateString()
      );

      slots1.forEach(slot => {

        const [h1, m1] = slot.start.split(":").map(Number);
        const slotStart = new Date(current.getFullYear(), current.getMonth(), current.getDate(), h1, m1);

        const [h2, m2] = slot.end.split(":").map(Number);
        const slotEnd = new Date(current.getFullYear(), current.getMonth(), current.getDate(), h2, m2);

        sameDayEvents.forEach(ev => {

          if (ev.start < slotEnd && ev.end > slotStart) {

            // Vérifier si déjà inséré
            const exists = result.some(r =>
              r.slotStart.getTime() === slotStart.getTime() &&
              r.slotEnd.getTime() === slotEnd.getTime() &&
              r.summary === ev.summary
            );
            if (exists) return;

            result.push({
              date: new Date(current), 
              slotStart,
              slotEnd,
              summary: ev.name,
              location: ev.location
            });
          }
        });
      });
    }
    current.setDate(current.getDate() + 1);
  }

  return result;
}


function comparer(moodle){
  var listeAvecPointsInterro = moodle.listeAvecPointsInterro; //je n'ai VRAIMENT pas émargé
  //var listeSansRemarks = moodle.listeSansRemarks; //je n'ai pas émargé ? (pas émargé + prof)
  var listeDifferente = moodle.listeDifferente; //le prof à émargé pour moi

  
  
  var cours = laData1();
  cours.sort((a, b) => a.start - b.start);

  cours = cours.filter(s => {
  const name = !ignoredCourses1.some(word => s.name.includes(word));
  return name;
  });

  var newMoodle = parsing(listeAvecPointsInterro);
  var prof = parsing(listeDifferente);
  var creneaux = calculerCreneauxOccupes(cours);
  let prof_emarg = [];
  let oublie = [];

  creneaux.forEach(ev => {
    var start = new Date(ev.slotStart);
    var end = new Date(ev.slotEnd);
    var nom = ev.summary;
    newMoodle.forEach(md => {
      const mdStart = new Date(md.timestampDate);
      if (mdStart.valueOf()<=1757311199000){
      } 
      else {
        if (mdStart.getDate() === start.getDate()){
          if (mdStart.valueOf() === start.valueOf()){
          oublie.push({start, end, nom});
          }
        }
      }
    })  
  });


  creneaux.forEach(ev => {
  var start = new Date(ev.slotStart);
  var end = new Date(ev.slotEnd);
  var nom = ev.summary;
    prof.forEach(pf => {
      const pfStart = new Date(pf.timestampDate);
      if (pfStart.valueOf()<=1757311199000){
      } 
      else {
        if (pfStart.getDate() === start.getDate()){
          if (pfStart.valueOf() === start.valueOf()){
          prof_emarg.push({start, end, nom});
          }
        }
      }
    })  
  });

  if (oublie==0){
    Logger.log("Je n'ai jamais oublié d'émarger sur des cours");
  }
  else {
    var texte_oublie = ""
    oublie.forEach(ev => {
      
      var jour1 = String(ev.start.getDate()).padStart(2, "0");
      var mois1 = String(ev.start.getMonth()+1).padStart(2, "0");
      var annee1 = String(ev.start.getFullYear()).padStart(4, "0");
      var heure1 = String(ev.start.getHours()).padStart(2, "0");
      var minute1 = String(ev.start.getMinutes()).padStart(2, "0");
      var seconde1 = String(ev.start.getSeconds()).padStart(2, "0");
      var correct_debut = jour1 + "/" + mois1 + "/" + annee1 + " " + heure1 + ":" + minute1 + ":" + seconde1;

      var heure2 = String(ev.end.getHours()).padStart(2, "0");
      var minute2 = String(ev.end.getMinutes()).padStart(2, "0");
      var seconde2 = String(ev.end.getSeconds()).padStart(2, "0");
      var correct_fin = heure2 + ":" + minute2 + ":" + seconde2;
      texte_oublie += "\n" + correct_debut + " - " + correct_fin + " : " + ev.nom;
    });
    if (oublie.length==1){
      Logger.log("Je n'ai pas émargé à ce cours :" + texte_oublie);
    } else {
      Logger.log("Je n'ai pas émargé à ces "+oublie.length+" cours :" + texte_oublie);
    }
  }
  if (prof_emarg==0){
    Logger.log("Aucun prof n'a émargé pour moi");
  }
  else {
    var texte_prof_emarg = ""
    prof_emarg.forEach(ev => {
      
      var jour1 = String(ev.start.getDate()).padStart(2, "0");
      var mois1 = String(ev.start.getMonth()+1).padStart(2, "0");
      var annee1 = String(ev.start.getFullYear()).padStart(4, "0");
      var heure1 = String(ev.start.getHours()).padStart(2, "0");
      var minute1 = String(ev.start.getMinutes()).padStart(2, "0");
      var seconde1 = String(ev.start.getSeconds()).padStart(2, "0");
      var correct_debut = jour1 + "/" + mois1 + "/" + annee1 + " " + heure1 + ":" + minute1 + ":" + seconde1;

      var heure2 = String(ev.end.getHours()).padStart(2, "0");
      var minute2 = String(ev.end.getMinutes()).padStart(2, "0");
      var seconde2 = String(ev.end.getSeconds()).padStart(2, "0");
      var correct_fin = heure2 + ":" + minute2 + ":" + seconde2;
      texte_prof_emarg += "\n" + correct_debut + " - " + correct_fin + " : " + ev.nom;
    });
    if (prof_emarg.length==1){
      Logger.log("Le prof a émargé pour moi à ce cours : "+ texte_prof_emarg );
    } else {
      Logger.log("Le prof a émargé pour moi à ces "+prof_emarg.length+" cours : "+ texte_prof_emarg );
    }
  }
}


function withRetry1(fn, delayMs) {
  var nbEssais = 0;
  while (true) {
    nbEssais++;
    try {
      let result = fn(); // essaie d’exécuter la fonction
      if (result === null) {
        throw new Error("La fonction a retourné une valeur d'échec.");
      }
      return result; // si ça marche, on sort
    } catch (e) {
      Utilities.sleep(delayMs); // on attend avant de recommencer
    }
  }
}
        

