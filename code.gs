var emarger = false;

FORMATION = "" //cyberdefense, cyberlog ou cyberdata
A = "" //3, 4 ou 5
TP = "" //1, 2, 3, 4, 5 ou 6
var username = ""
var password = ""
const ignoredCourses = ["Activités GCC", "Activités HACK2G2"];
const topic = "";

var ntfweek = false;
var ntfjour = false;

const aujourdhui = new Date();
var j = aujourdhui.getDate();
var m = aujourdhui.getMonth();// 0 = janvier, 11 = décembre
var a = aujourdhui.getFullYear();
const d = aujourdhui.getDay();// 0 = Dimanche, 6 = Samedi
const slots = [
  { start: "08:00", end: "09:30" },
  { start: "09:45", end: "11:15" },
  { start: "11:30", end: "13:00" },
  { start: "13:00", end: "14:30" },
  { start: "14:45", end: "16:15" },
  { start: "16:30", end: "18:00" },
  { start: "18:15", end: "19:45" }
];
var skip = false;

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
  Logger.log("RelayState (URL-decoded):\n" + relay);

  function base64WebSafeToBytes(b64) {
    if (!b64) return [];
    let s = b64.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4 !== 0) s += "=";
    return Utilities.base64Decode(s);
  }
  const samlBytes = base64WebSafeToBytes(rawSaml);
  Logger.log("SAML bytes length: " + samlBytes.length);
  let maybeText = "";
  try {
    maybeText = Utilities.newBlob(samlBytes).getDataAsString();
    Logger.log("SAML as text (maybe compressed / binary):\n" + maybeText.substring(0, Math.min(2000, maybeText.length)));
  } catch (e) {
    Logger.log("Impossible de convertir en texte directement : " + e);
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
  // 1️⃣ Extraire action du formulaire
  const actionMatch = html.match(/<form[^>]*action="([^"]+)"/i);
  if (!actionMatch) throw new Error("Impossible de trouver l'action du formulaire");
  let actionUrl = actionMatch[1];
  if (!/^https?:/i.test(actionUrl)) {
    // URL relative → compléter avec le domaine IdP
    actionUrl = "https://cas.univ-ubs.fr/" + actionUrl.replace(/^\/?/, "");
  }

  // 2️⃣ Extraire champs hidden
  const inputs = {};
  const regex = /<input[^>]*type="hidden"[^>]*name="([^"]+)"[^>]*value="([^"]*)"/gi;
  let m;
  while ((m = regex.exec(html)) !== null) {
    inputs[m[1]] = m[2];
  }

  // 3️⃣ Ajouter username & password
  inputs["username"] = username;
  inputs["password"] = password;

  // 4️⃣ Envoyer POST vers CAS
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

  Logger.log("CAS login status: " + res.getResponseCode());
  Logger.log("CAS login headers: " + JSON.stringify(res.getAllHeaders(), null, 2));

  return res;
}

function handleTicketRedirect(response, jar) {
  let headers = response.getAllHeaders();
  let location = headers["Location"];

  if (!location) {
    Logger.log("Pas de Location trouvé !");
    return null;
  }

  // Vérifie si c’est bien un ticket CAS (ST-xxxxx)
  if (location.includes("ticket=")) {
    Logger.log("Ticket CAS détecté → " + location);

    // Ici on arrête de suivre l’IdP et on appelle Moodle directement
    let moodleRes = UrlFetchApp.fetch(location, {
      method: "get",
      headers: {
        "Cookie": jar
      },
      muteHttpExceptions: true,
      followRedirects: false
    });

    Logger.log("Moodle response code: " + moodleRes.getResponseCode());
    Logger.log("Moodle headers: " + JSON.stringify(moodleRes.getAllHeaders(), null, 2));

    // Récupère le vrai cookie de session Moodle
    let setCookie = moodleRes.getAllHeaders()["Set-Cookie"];
    if (setCookie) {
      jar.push(setCookie.split(";")[0]);
      Logger.log("Nouvelle session Moodle récupérée: " + setCookie);
    }

    return moodleRes;
  }

  Logger.log("Pas de ticket CAS → continue normalement");
  return null;
}

function htmlDecode(str) {
  if (!str) return str;
  // hex numeric first
  str = str.replace(/&#x([0-9a-fA-F]+);/g, function(_, hex) {
    return String.fromCharCode(parseInt(hex, 16));
  });
  // decimal numeric
  str = str.replace(/&#(\d+);/g, function(_, dec) {
    return String.fromCharCode(Number(dec));
  });
  // named entities (add more if needed)
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

  // support action="..." or action='...' or action=unquoted
  const actionMatch = body.match(/<form[^>]*\saction=(?:"([^"]+)"|'([^']+)'|([^>\s]+))/i);
  let actionUrl = actionMatch ? (actionMatch[1] || actionMatch[2] || actionMatch[3]) : null;
  actionUrl = htmlDecode(actionUrl);

  // Décoder et récupérer RelayState / SAMLResponse (handle single/double quotes)
  const relayMatch = body.match(/name=['"]?RelayState['"]?[^>]*value=(?:"([^"]*)"|'([^']*)'|([^>\s]*))/i);
  const samlMatch  = body.match(/name=['"]?SAMLResponse['"]?[^>]*value=(?:"([^"]*)"|'([^']*)'|([^>\s]*))/i);

  const relayState = relayMatch ? htmlDecode(relayMatch[1] || relayMatch[2] || relayMatch[3]) : null;
  const samlResponse = samlMatch ? htmlDecode(samlMatch[1] || samlMatch[2] || samlMatch[3]) : null;

  // Si actionUrl est relatif, le rendre absolu en utilisant baseUrl
  if (actionUrl && !/^https?:\/\//i.test(actionUrl)) {
    if (/^\/\//.test(actionUrl)) {
      // protocol-relative //domain/path
      actionUrl = 'https:' + actionUrl;
    } else if (/^\//.test(actionUrl) && baseUrl) {
      const m = baseUrl.match(/^(https?:\/\/[^\/]+)/i);
      if (m) actionUrl = m[1] + actionUrl;
    } else if (baseUrl && !/^\w+:/.test(actionUrl)) {
      // relative without leading slash
      const m = baseUrl.match(/^(https?:\/\/[^\/]+)(\/.*)?$/i);
      if (m) {
        const basePath = (m[2] || '/').replace(/\/[^\/]*$/, '/'); // parent path
        actionUrl = m[1] + basePath + actionUrl.replace(/^\/+/, '');
      }
    }
  }

  return { actionUrl, relayState, samlResponse };
}

function extractPresenceLink(html) {
  // Regex pour attraper <a href="..."> contenant "attendance/view.php"
  const regex = /https:\/\/moodle\.univ-ubs\.fr\/mod\/attendance\/view\.php\?id=\d+/i;
  const match = html.match(regex);
  if (match) {
    return match[0]; // lien complet
  }
  return null;
}

function extractAttendanceLink(html) {
  const regex = /<a\s+href="(https:\/\/moodle\.univ-ubs\.fr\/mod\/attendance\/attendance\.php\?[^"]+)">Envoyer le statut de présence<\/a>/i;
  const match = html.match(regex);
  return match ? match[1] : null;
}

function testLogin() {
  const moodleUrl = "https://moodle.univ-ubs.fr/auth/shibboleth/login.php";
  let jar = "";
  let jarjarjar = "";
  let indexphp ="";
  // 1️⃣ Première requête GET pour initialiser la session
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
    Logger.log("Connexion Moodle OK ✅");
    Logger.log("redirection vers : "+finalRes.getAllHeaders()["Location"]);
  } else {
    Logger.log("Pas encore de ticket, on continue le flux normal");
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
  Logger.log("Lien page émargement : " + link);

  let res13 = UrlFetchApp.fetch(link+"&view=1", {
        method: "get",
        headers: {
          "Cookie": jarjar 
        },
        followRedirects: false,
        muteHttpExceptions: true
      });
  link = res13.getContentText()
  link = extractAttendanceLink(link);
  Logger.log("link : " + link);
  if (link === null){
    return link;
  }

  let res14 = UrlFetchApp.fetch(link, {
        method: "get",
        headers: {
          "Cookie": jarjar 
        },
        followRedirects: false,
        muteHttpExceptions: true
      });
}

function withRetry(fn, delayMs) {
  var nbEssais = 0;
  while (true) {
    nbEssais++;
    try {
      Logger.log("Essaie numéro " + nbEssais);
      let result = fn(); // essaie d’exécuter ta fonction
      return result; // si ça marche, on sort
    } catch (e) {
      Logger.log("Erreur détectée : " + e.message);
      Utilities.sleep(delayMs); // on attend avant de recommencer
    }
  }
}

function emargement() {
  var now = new Date();
  now.setMinutes(now.getMinutes()+8);
  ScriptApp.newTrigger("verif")
    .timeBased()
    .at(now)
    .create();
  var lien = withRetry(testLogin, 2500);
  return lien;
}

function sendNtfyNotification(message, topic) {
  const url = "https://ntfy.sh/" + topic;
  const options = {
    method: "post",
    payload: message,
    muteHttpExceptions: true,
  };

  let attempt = 0;
  const maxAttempts = 10;
  const baseDelay = 15000; // 15 secondes d’attente entre les essais

  while (true) {
    attempt++;
    try {
      const response = UrlFetchApp.fetch(url, options);
      const code = response.getResponseCode();

      if (code >= 200 && code < 300) {
        Logger.log("✅ Notification envoyée avec succès (tentative " + attempt + ")");
        return; // succès → on sort
      } else if (code === 429) {
        Logger.log("⚠️ Code 429 reçu, attente avant nouvelle tentative...");
      } else {
        Logger.log("❌ Erreur HTTP " + code + " : " + response.getContentText());
      }
    } catch (e) {
      Logger.log("⚠️ Erreur réseau : " + e.message);
    }

    // Vérifie la limite max d’essais
    if (attempt >= maxAttempts) {
      Logger.log("🚨 Abandon après " + maxAttempts + " tentatives d’envoi de notification.");
      return;
    }
    Utilities.sleep(baseDelay);
  }
}

function randomize(){
  let laps1 = Math.floor(Math.random() * 60000);      
  Logger.log("Attente de : "+(laps1/1000));
  Utilities.sleep(laps1);
}

function verif() {
  const now = new Date();
  const events = getEventsTodayFromJson(laData());
  const slotsNow = getRelevantSlotsForDay(events, now);

  slotsNow.forEach(s => {
    if (Math.abs(s.slotStart.getTime() - now.getTime()) < 3600*1000) {
      var lien=emargement();
      if (lien === null){
        return;
      }
      else {
        sendNtfyNotification("🤖 Je viens d'émarger pour vous à "+ timetime() +" pour votre cours de :\n\n"+ s.summary +"\n\nde " + formatTime(s.slotStart) + " à " + formatTime(s.slotEnd)+" !", topic);
      }
    }
  });
}

function attenteEmargement() {
  const now = new Date();
  const events = getEventsTodayFromJson(laData());
  const slotsNow = getRelevantSlotsForDay(events, now);

  slotsNow.forEach(s => {
    if (Math.abs(s.slotStart.getTime() - now.getTime()) < 3600*1000) {
      if (skip === false){//permet de skip l'attente si on le lance en étant déjà en cours
        randomize();
        var lien=emargement();
        if (lien === null){
          sendNtfyNotification("Vous avez déjà émargé !", topic);
        }
        else {
          sendNtfyNotification("🤖 Je viens d'émarger pour vous à "+ timetime() +" pour votre cours de :\n\n"+ s.summary +"\n\nde " + formatTime(s.slotStart) + " à " + formatTime(s.slotEnd)+" !", topic);
        }
      }
    }
  });
}

function attente(){
  var aleatoire=Math.random()*100;
  Logger.log("Proba = "+aleatoire);
  if (aleatoire>90){
    let laps1 = Math.floor(Math.random() * 960) + 1;
    let laps2 = 960;
    let laps3 = laps1 + laps2;
    var laps = Math.floor(laps3/60);
    var heure = new Date();
    heure.setMinutes(heure.getMinutes()+laps);
    Logger.log("L'émargement s'effectuera dans plus de "+laps+" minutes");
    ScriptApp.newTrigger("attenteEmargement")
    .timeBased
    .at(heure)
    .create();
    return true;
  } 
  else {
    let laps1 = Math.floor(Math.random() * 960) + 1;
    Logger.log(laps1);
    if (laps1 > 119){
      var laps = Math.floor(laps1 / 60);
      var heure = new Date();
      heure.setMinutes(heure.getMinutes()+laps);
      Logger.log("L'émargement s'effectuera dans plus de "+laps+" minutes");
      ScriptApp.newTrigger("attenteEmargement")
      .timeBased()
      .at(heure)
      .create();
      return true;
    }
    else{
      if (laps1 > 59){
        var heure = new Date();
        heure.setMinutes(heure.getMinutes()+2);
        Logger.log("L'émargement s'effectuera dans plus de 2 minutes");
        ScriptApp.newTrigger("attenteEmargement")
        .timeBased()
        .at(heure)
        .create();
        return true;
      }
      else {
        Logger.log("Attente de : "+(laps1));
        Utilities.sleep(laps1*1000);
        return false;
      }
    }
  } 
}

function parseICalDate(str) {
  // Exemple de format : 20251026T130000Z
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
  first.setMonth(first.getMonth()-11);
  last.setMonth(last.getMonth()+13);

  var [id1, id2] = choixId();
  const url1 = "planning.univ-ubs.fr/jsp/custom/modules/plannings/anonymous_cal.jsp?resources="+id1+"&projectId=1&calType=ical&firstDate="+first.getFullYear()+"-"+first.getMonth()+"-"+first.getDate()+"&lastDate="+last.getFullYear()+"-"+last.getMonth()+"-"+last.getDate();
  
  var events1 = appel(url1);
  
  let eventsfiltered1 = events1.filter(s => {
  const summaryOk = !ignoredCourses.some(word => s.name.includes(word));
  return summaryOk;
  });
  if (id2 == null){
    return eventsfiltered1;
  }
  else {
    const url2 = "planning.univ-ubs.fr/jsp/custom/modules/plannings/anonymous_cal.jsp?resources="+id2+"&projectId=1&calType=ical&firstDate="+first.getFullYear()+"-"+first.getMonth()+"-"+first.getDate()+"&lastDate="+last.getFullYear()+"-"+last.getMonth()+"-"+last.getDate();
    var events2 = appel(url2);
    let eventsfiltered2 = events2.filter(s => {
    const summaryOk = !ignoredCourses.some(word => s.name.includes(word));
    return summaryOk;
    });
    var eventsConcat = eventsfiltered1.concat(eventsfiltered2);
    return eventsConcat;
  }
}


function planning(semestre){
  var url = "https://planningsup.app/api/v1/calendars?p=ensibs." + FORMATION + "." + A + "emeannee.semestre" + semestre + "s" + semestre + ".tp" + TP;
  var response = UrlFetchApp.fetch(url);
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
  const summaryOk = !ignoredCourses.some(word => s.name.includes(word));
  return summaryOk;
  });
  return eventsConcat;
}

function laData(){
  let miam = ExtractICS();
  if (miam == 0){
    miam = url();
  }
  return miam;
}

function getEventsTodayFromJson(jsonData) {
  const auj = new Date();
  const todayStr = auj.toDateString();
  let eventsToday = [];
  jsonData.forEach(ev => {
    const start = new Date(ev.start);
    const end = new Date(ev.end);
    if (start.toDateString() === todayStr) {
      eventsToday.push({
        summary: ev.name,
        start,
        end,
        location: ev.location || ""
      });
    }
  });
  return eventsToday;
}

function getEventsWeekFromJson(jsonData) {
  const diff = (d === 0 ? -6 : 1 - d);
  aujourdhui.setDate(j + diff);

  let eventsWeek = [];
  for (let i = 0; i < 5; i++) {
    const currentDay = aujourdhui;
    currentDay.setDate(j + i);

    jsonData.forEach(ev => {
      const start = new Date(ev.start);
      const end = new Date(ev.end);
      if (start.toDateString() === currentDay.toDateString()) {
        eventsWeek.push({
          summary: ev.name,
          start,
          end,
          location: ev.location || ""
        });
      }
    });
  }
  return eventsWeek;
}

function getRelevantSlotsForDay(events, date) {
  const result = [];
  const sameDayEvents = events.filter(ev =>
    ev.start.toDateString() === date.toDateString()
  );

  slots.forEach(slot => {
    const startParts = slot.start.split(":").map(Number);
    const endParts = slot.end.split(":").map(Number);
    const slotStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), startParts[0], startParts[1]);
    const slotEnd   = new Date(date.getFullYear(), date.getMonth(), date.getDate(), endParts[0], endParts[1]);

    sameDayEvents.forEach(ev => {
      // Si le créneau chevauche l'événement
      if (ev.start < slotEnd && ev.end > slotStart) {
        result.push({
          slotStart,
          slotEnd,
          summary: ev.summary,
          location: ev.location
        });
      }
    });
  });
  return result;
}

function formatSummary(hoursFloat) {
  const h = Math.floor(hoursFloat); // partie entière → heures
  const m = Math.round((hoursFloat - h) * 60); // reste → minutes
  return `${h}h${m.toString().padStart(2, "0")}`;
}

function clearOldTriggers(triggered) {
  const triggers = ScriptApp.getProjectTriggers();
  for (const t of triggers) {
    if (t.getHandlerFunction() === triggered) {
      ScriptApp.deleteTrigger(t);
      Logger.log("Trigger supprimé");
    }
  }
}

function PlusOrMinus(jsonData, semainesRestantes) {
  const aujourdhui = new Date();
  aujourdhui.setDate(aujourdhui.getDate() + (semainesRestantes * 7));

  let eventsWeek = [];
  for (let i = 0; i < 5; i++) {
    const currentDay = new Date(aujourdhui);
    currentDay.setDate(currentDay.getDate() + i);

    jsonData.forEach(ev => {
      const start = new Date(ev.start);
      const end = new Date(ev.end);
      if (start.toDateString() === currentDay.toDateString()) {
        eventsWeek.push({
          summary: ev.name,
          start,
          end,
          location: ev.location || ""
        });
      }
    });
  }
  return eventsWeek;
}

function calculateWeeks(choix) {
  var jsonData=laData();
  let semainesRestantes = 0;
  let foundEvents = false;
  while (!foundEvents) {
    if (choix == "UntilApprenticeship"){
      semainesRestantes++;
      let eventsWeek = PlusOrMinus(jsonData, semainesRestantes);
      if (eventsWeek.length == 0) {
        foundEvents = true;
      }
    }
    if (choix == "SinceApprenticeship"){
      semainesRestantes--;
      let eventsWeek = PlusOrMinus(jsonData, semainesRestantes);
      if (eventsWeek.length == 0) {
        foundEvents = true;
      }
    }
    if (choix == "UntilSchool"){
      semainesRestantes++;
      let eventsWeek = PlusOrMinus(jsonData, semainesRestantes);
      if (eventsWeek.length > 0) {
        foundEvents = true;
      }
    }
    if (choix == "SinceSchool"){
      semainesRestantes--;
      let eventsWeek = PlusOrMinus(jsonData, semainesRestantes);
      if (eventsWeek.length > 0) {
        foundEvents = true;
      }
    }
  }
  return semainesRestantes;
}

function nombreSemaine(){
  if (getEventsWeekFromJson(laData()) == 0){
    var after = calculateWeeks("UntilSchool");
    var before = calculateWeeks("SinceSchool");
    var total = after-before-1;
    var texteSemaine = "Début de la semaine " + (-before) + " sur " + total + " en entreprise";
    if (after == 1){
      texteSemaine += "\nRetour à l'école semaine prochaine (Yaouh)";
    }
    return texteSemaine
  }
  else {
    var after = calculateWeeks("UntilApprenticeship");
    var before = calculateWeeks("SinceApprenticeship");
    var total = after-before-1;
    var texteSemaine = "Début de la semaine " + (-before) + " sur " + total + " en école"
    if (after == 1){
      texteSemaine += "\nRetour en entreprise semaine prochaine !";
    }
    return texteSemaine;
  }
}

function weeklySummary(){
  if (ntfweek === true) {
    const data = laData();
    let eventsSemaine = getEventsWeekFromJson(data);
  
    if (eventsSemaine == 0) {
      return;
    }
  // Grouper par nom et calculer la durée totale
    const summaryMap = {};
  
    eventsSemaine.forEach(ev => {
      const durationMs = ev.end - ev.start; // durée en millisecondes
      const durationHours = durationMs / (1000 * 60 * 60);
      if (!summaryMap[ev.summary]) {
        summaryMap[ev.summary] = { hours: 0 };
      }
      summaryMap[ev.summary].hours += durationHours;
    });
    // Transformer en tableau pour trier
    let resultArray = Object.entries(summaryMap).map(([summary, data]) => ({
      summary,
      hours: data.hours
    }));
    // Fonction pour attribuer une priorité CM → TD → TP
    function getPriority(summary) {
      if (summary.startsWith("[CM")) return 1;
      if (summary.startsWith("[TD")) return 2;
      if (summary.startsWith("[TP")) return 3;
      return 4; // si autre chose
    }
    // Trier : priorité CM/TD/TP puis par ordre alphabétique
    resultArray.sort((a, b) => {
      const prioDiff = getPriority(a.summary) - getPriority(b.summary);
      if (prioDiff !== 0) return prioDiff;
      return a.summary.localeCompare(b.summary);
    });
    let resume = "";
    if (eventsSemaine != 0) {
      resume += "📅 Résumé de la semaine :\n\n";
      resultArray.forEach(ev => {
      const totalHours = ev.hours.toFixed(1);
      resume += `${ev.summary} → ${formatSummary(totalHours)}\n`;
      });
      let totalHoursWeek = 0;
      eventsSemaine.forEach(ev => {
      totalHoursWeek += (ev.end - ev.start) / (1000 * 60 * 60);
      });
      resume += `\n\n🕒 Total semaine : ${formatSummary(totalHoursWeek)}`;
      sendNtfyNotification(resume, topic);
    }
  }
}

function formatTime(date) {
  return ("0" + date.getHours()).slice(-2) + ":" + ("0" + date.getMinutes()).slice(-2);
}


function timetime(){
  let timestamp = new Date();
  let hh = false;
  let mm = false;
  let ss = false;
  if (timestamp.getHours()<10){
    hh = "0"+timestamp.getHours();
  } else {
    hh = timestamp.getHours();
  }
  if (timestamp.getMinutes()<10){
    mm = "0"+timestamp.getMinutes();
  } else {
    mm = timestamp.getMinutes();
  }
  if (timestamp.getSeconds()<10){
    ss = "0"+timestamp.getSeconds();
  } else {
    ss = timestamp.getSeconds();
  }
  let timetime = hh + ":" + mm + ":" + ss;
  return timetime;
}

function sendSlotNotification() {
  const now = new Date();
  const events = getEventsTodayFromJson(laData());
  const slotsNow = getRelevantSlotsForDay(events, now);

  slotsNow.forEach(s => {
    if (Math.abs(s.slotStart.getTime() - now.getTime()) < 3600*1000) {
      if (emarger === false) {
      sendNtfyNotification("📚 C'est l'heure d’émarger pour : \n\n" + s.summary + " \n\n" + formatTime(s.slotStart) + " à " + formatTime(s.slotEnd) + " \n\n" + s.location, topic);
      }
      if (emarger === true){
        if (skip === false){//permet de skip l'attente si on le lance en étant déjà en cours
          var wait = attente();
        }
        if (wait === false){
          var lien=emargement();
          if (lien === null){
            sendNtfyNotification("Vous avez déjà émargé !", topic);
          }
          else {
            sendNtfyNotification("🤖 Je viens d'émarger pour vous à "+ timetime() +" pour votre cours de :\n\n"+ s.summary +"\n\nde " + formatTime(s.slotStart) + " à " + formatTime(s.slotEnd)+" !", topic);
          }
        }
      }
    }
  });
}

function scheduleDailyNotifications() {
  clearOldTriggers("sendSlotNotification");
  clearOldTriggers("attenteEmargement");
  clearOldTriggers("verif");
  clearOldTriggers("scheduleDailyNotifications");
  clearOldTriggers("weeklySummary");
  var demain = aujourdhui;
  demain.setDate(demain.getDate() + 1);
  demain.setHours(7, 30, 0, 0);
  ScriptApp.newTrigger("scheduleDailyNotifications")
      .timeBased()
      .at(demain)
      .create();
  demain.setHours(7, 0, 0, 0);
  if (d === 0) {
    ScriptApp.newTrigger("weeklySummary")
      .timeBased()
      .at(demain)
      .create(); 
  }
  // Si on est le week-end :
  if (d === 0 || d === 6) { 
    return;
  }
  const aujo = new Date();
  const events = getEventsTodayFromJson(laData());
  let slotsToday = getRelevantSlotsForDay(events, aujo);

  slotsToday.forEach(s => {
    const now = new Date();
    if (s.slotEnd <= now) {
      Logger.log("Créneau déjà passé → " + formatTime(s.slotStart) + "-" + formatTime(s.slotEnd));
      return; // on skip ce créneau
  }

  if (s.slotStart <= now && s.slotEnd > now) {
    Logger.log("On est déjà dans ce créneau → " + formatTime(s.slotStart)+"-" + formatTime(s.slotEnd));
    if (emarger === false) {
      sendNtfyNotification("⚠️ Cours en cours : \n\n" + s.summary + ", \n" + s.location, topic);
    }
    skip=true;
    sendSlotNotification();
    return;
  }

  // si le créneau est futur → on programme le trigger normalement
  ScriptApp.newTrigger("sendSlotNotification")
    .timeBased()
    .at(s.slotStart)
    .create();
  });

  if (slotsToday == 0) {
    if (getEventsWeekFromJson(laData()) != 0){ 
      if (ntfjour === true) {
        sendNtfyNotification("Eh beh jeune personne très respectable, tu n'as pas cours aujourd'hui !!!", topic);
      }
    }
  } else {
    events.sort((a, b) => a.start - b.start);
    let totalHoursDay = 0;
    events.forEach(ev => {
    totalHoursDay += (ev.end - ev.start) / (1000 * 60 * 60);
    });   
    const ajd = events.map(ev =>
      formatTime(ev.start) + "-" + formatTime(ev.end) + " : " + ev.summary + ", " + ev.location +"\n").join("\n");
    if (ntfjour === true) {
      sendNtfyNotification("📅 Planning du jour :\n\n" + ajd + "\n\n🕒 Total : " + formatSummary(totalHoursDay)+"\n", topic);
    }
  }
}

function affichageTemps(secondes){
  const minmin = Math.floor(secondes / 60); 
  const secsec = secondes % 60;                
  return {minmin, secsec};
}


// Debug si besoin
function testGetEventsToday() {
  const eventsToday = getEventsTodayFromJson(laData());
  eventsToday.forEach(ev => {
    Logger.log("Événement: " + ev.summary);
    Logger.log("Début: " + ev.start);
    Logger.log("Fin: " + ev.end);
    Logger.log("Lieu: " + ev.location);
  });
}




