// Wikimedia rate-limits bursts of API requests (HTTP 429), so articles with
// 100+ languages can't fire every size request at once.
const MAX_CONCURRENT_REQUESTS = 4;
const MAX_RETRIES = 3;
// waiting out longer rate limits would stall the popup for minutes
const MAX_RETRY_WAIT_SECONDS = 5;

function constructURL(lang_code, params) {
  const url = new URL("https://" + lang_code + ".wikipedia.org/w/api.php");
  // URLSearchParams encodes titles containing &, +, ?, # etc.
  url.search = new URLSearchParams(params);
  return url;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class RateLimitedError extends Error {}

// fetch json, retrying short rate limits and giving up on long ones
async function fetchJSON(url) {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url);
    if (response.ok) return response.json();
    if (response.status !== 429)
      throw new Error("HTTP " + response.status + " for " + url);

    const retryAfter =
      Number(response.headers.get("Retry-After")) || 0.5 * 2 ** attempt;
    if (attempt >= MAX_RETRIES || retryAfter > MAX_RETRY_WAIT_SECONDS)
      throw new RateLimitedError("Rate limited for " + url);
    await sleep(retryAfter * 1000);
  }
}

async function fetchSize(lang_code, title) {
  const url = constructURL(lang_code, {
    action: "query",
    prop: "revisions",
    format: "json",
    rvprop: "timestamp|size",
    titles: title,
  });

  const data = await fetchJSON(url);

  const pages = data.query.pages;
  const pageID = Object.keys(pages)[0];
  const page_info = pages[pageID];

  // missing pages have no revisions
  if (!page_info.revisions) return null;
  return {
    lang: lang_code,
    size: page_info.revisions[0].size,
    title: page_info.title,
  };
}

/**
 * Fetches the size of each article, calling onArticle as each one arrives.
 *
 * @param {Array[Array[string, string]]} lang_title_list   Langs and titles
 * @param {function} onArticle    Called with each {lang, size, title}
 * @return {{found: number, rateLimited: number}}   Counts of results
 */
async function processSizeFetching(lang_title_list, onArticle) {
  const queue = [...lang_title_list];
  let found = 0;
  let rateLimited = 0;
  let stopped = false;

  // a few workers pull from a shared queue to cap concurrent requests
  async function worker() {
    while (queue.length > 0 && !stopped) {
      const lang_title = queue.shift();
      try {
        const article = await fetchSize(...lang_title);
        if (article) {
          found++;
          onArticle(article);
        }
      } catch (error) {
        if (error instanceof RateLimitedError) {
          // the rest would be refused too, so stop sending requests
          stopped = true;
          rateLimited++;
        } else {
          // skip this language rather than failing the whole list
          console.warn("Could not fetch size for", lang_title, error);
        }
      }
    }
  }
  await Promise.all(Array.from({ length: MAX_CONCURRENT_REQUESTS }, worker));

  rateLimited += queue.length;
  return { found, rateLimited };
}

/**
 * Takes a language and a title of an article.
 * Returns a list of lists containting the other languages and titles of the
 * other versions of the article.
 *
 * @param {string} lang_code    Description.
 * @param {string} title        Description of optional variable.
 * @return {Array[Array[string, string]]}   List of langs and titles
 */
async function fetchLanguages(lang_code, title) {
  const url = constructURL(lang_code, {
    action: "query",
    prop: "langlinks",
    format: "json",
    lllimit: "500",
    titles: title,
  });

  try {
    var data = await fetchJSON(url);
  } catch (error) {
    return [];
  }

  const pages = data.query.pages;
  const pageID = Object.keys(pages)[0];
  const page_info = pages[pageID];

  if (!page_info.langlinks) return [];
  return page_info.langlinks.map((x) => [x.lang, x["*"]]);
}

/**
 * Returns a list containting the language and the title of the active tab.
 * If the active tab is not a Wikipedia article it does something else..
 *
 * @return {[Array[string, string]]}   List of lang and title
 */
async function getCurrentTab() {
  let queryOptions = { active: true, lastFocusedWindow: true };

  let [tab] = await chrome.tabs.query(queryOptions);
  if (!tab) return ["no url", "somehow..."];

  // group 1 is lang code, group 2 is title
  const regex = /\/\/([a-z-]*)\.wikipedia.org\/wiki\/(.*)/;

  // split removes extra page location information in url
  const found = tab.url.split("#", 1)[0].match(regex);

  if (!found) return [false, false];
  return [found[1], decodeURIComponent(found[2])];
}

function onClickAction(code, title) {
  const url =
    "https://" +
    code +
    ".wikipedia.org/wiki/" +
    encodeURIComponent(title.replaceAll(" ", "_"));
  chrome.tabs.create({ url, active: false });
}

function createLang(title) {
  var div = document.createElement("div");
  div.className = "row-lang";
  div.innerHTML = title;
  return div;
}

function createSize(title) {
  var div = document.createElement("div");
  div.className = "graph-size";
  div.innerHTML = title;
  return div;
}

function createDoubleLang(lang, lang_engl) {
  var div = document.createElement("div");
  div.className = "row-lang";

  var nativeDiv = document.createElement("div");
  nativeDiv.className = "lang-native";
  nativeDiv.innerHTML = lang;
  div.appendChild(nativeDiv);

  var englDiv = document.createElement("div");
  englDiv.className = "lang-engl";
  englDiv.innerHTML = lang_engl;
  div.appendChild(englDiv);

  return div;
}

function createGraph(size, max) {
  var div = document.createElement("div");
  div.className = "graph";

  var graphDiv = document.createElement("div");
  graphDiv.className = "bar-container";

  var barDiv = document.createElement("div");
  barDiv.className = "bar";
  barDiv.style.width = (size / max) * 100 + "%";
  graphDiv.appendChild(barDiv);
  div.appendChild(graphDiv);

  var sizeDiv = document.createElement("div");
  sizeDiv.className = "graph-size";
  sizeDiv.innerHTML = size + " bytes";
  div.append(sizeDiv);
  return div;
}

async function loadLangInfo() {
  const langsData = await fetch("wiki_langs.json");
  const wikiLangs = await langsData.json();

  const redirectsData = await fetch("wiki_redirects.json");
  const wikiRedirects = await redirectsData.json();

  // wiki_langs.json is ordered from largest wiki to smallest
  const ranks = Object.keys(wikiLangs);

  /** handle redirects*/
  return function getLangInfo(langCode) {
    var code = null;
    if (langCode in wikiLangs) code = langCode;
    else if (wikiRedirects[langCode] in wikiLangs)
      code = wikiRedirects[langCode];
    else return null;

    return { langDict: wikiLangs[code], rank: ranks.indexOf(code) };
  };
}

// rescale every bar against the largest article
function updateBars(rows) {
  const maxSize = Number(rows.firstChild.dataset.size);
  for (const rowDiv of rows.children) {
    const bar = rowDiv.querySelector(".bar");
    bar.style.width = (Number(rowDiv.dataset.size) / maxSize) * 100 + "%";
  }
}

// insert a row so the table stays sorted from largest to smallest
function addRow(rows, infoDict, langDict) {
  const { lang: langCode, title, size } = infoDict;
  var rowDiv = document.createElement("div");
  rowDiv.id = langCode + "." + title;
  rowDiv.className = "row";
  rowDiv.dataset.size = size;

  rowDiv.appendChild(createDoubleLang(langDict.lang, langDict.lang_engl));
  rowDiv.appendChild(createGraph(size, size));

  rowDiv.addEventListener("click", onClickAction.bind(null, langCode, title));

  const smaller = [...rows.children].find(
    (row) => Number(row.dataset.size) < size,
  );
  rows.insertBefore(rowDiv, smaller ?? null);
  updateBars(rows);
}

async function errorScreen(path) {
  document.getElementById("loading-thing").remove();
  const response = await fetch(path);
  const html = await response.text();
  document.getElementById("message").innerHTML = html;
}

async function execute() {
  const [lang, title] = await getCurrentTab();
  if (!lang) {
    await errorScreen("error_screens\\not_a_wiki_article.html");
    return false;
  }

  const lang_title_list = await fetchLanguages(lang, title);
  if (lang_title_list.length === 0) {
    errorScreen("error_screens\\failed_connection.html");
    return false;
  }

  const getLangInfo = await loadLangInfo();

  // skip languages that can't be displayed, and fetch the biggest wikis
  // first so rate limiting only cuts off small ones
  const known = lang_title_list.filter(([code]) => getLangInfo(code));
  known.sort((a, b) => getLangInfo(a[0]).rank - getLangInfo(b[0]).rank);
  known.unshift([lang, title]); // add active article

  const rows = document.getElementById("rows");
  rows.innerHTML = "";

  const { found, rateLimited } = await processSizeFetching(
    known,
    (article) => {
      const info = getLangInfo(article.lang);
      if (info) addRow(rows, article, info.langDict);
    },
  );
  if (found === 0) {
    errorScreen("error_screens\\failed_connection.html");
    return false;
  }

  document.getElementById("loading-thing").remove();
  const message = document.getElementById("message");
  if (rateLimited > 0) {
    message.className = "rate-limit-note";
    message.textContent =
      rateLimited +
      (rateLimited === 1 ? " language" : " languages") +
      " couldn't load because Wikipedia is limiting requests. " +
      "Try again in a minute.";
  } else {
    message.remove();
  }

  return true;
}

execute();
