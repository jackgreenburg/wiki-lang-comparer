// Wikimedia rate-limits bursts of API requests (HTTP 429), so articles with
// 100+ languages can't fire every size request at once.
const MAX_CONCURRENT_REQUESTS = 4;
const MAX_RETRIES = 5;

function constructURL(lang_code, params) {
  const url = new URL("https://" + lang_code + ".wikipedia.org/w/api.php");
  // URLSearchParams encodes titles containing &, +, ?, # etc.
  url.search = new URLSearchParams(params);
  return url;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// fetch json, backing off and retrying when rate limited
async function fetchJSON(url) {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url);
    if (response.ok) return response.json();
    if (response.status !== 429 || attempt >= MAX_RETRIES)
      throw new Error("HTTP " + response.status + " for " + url);

    const retryAfter = Number(response.headers.get("Retry-After"));
    await sleep(retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt);
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

async function processSizeFetching(lang_title_list) {
  const articles = [];
  const queue = [...lang_title_list];

  // a few workers pull from a shared queue to cap concurrent requests
  async function worker() {
    while (queue.length > 0) {
      const lang_title = queue.shift();
      try {
        const article = await fetchSize(...lang_title);
        if (article) articles.push(article);
      } catch (error) {
        // skip this language rather than failing the whole list
        console.warn("Could not fetch size for", lang_title, error);
      }
    }
  }
  await Promise.all(Array.from({ length: MAX_CONCURRENT_REQUESTS }, worker));

  articles.sort((a, b) => (a.size < b.size ? 1 : -1));
  return articles;
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

async function populateTable(infoDictArr) {
  const langsData = await fetch("wiki_langs.json");
  const wikiLangs = await langsData.json();

  const redirectsData = await fetch("wiki_redirects.json");
  const wikiRedirects = await redirectsData.json();

  const rows = document.getElementById("rows");
  rows.innerHTML = "";

  const { size: maxSize } = infoDictArr[0];
  for (const [index, infoDict] of infoDictArr.entries()) {
    const { lang: langCode, title, size } = infoDict;
    var rowDiv = document.createElement("div");
    rowDiv.id = langCode + "." + title;
    rowDiv.className = "row";

    /** handle redirects*/
    var langDict = null;
    if (langCode in wikiLangs) langDict = wikiLangs[langCode];
    else if (wikiRedirects[langCode] in wikiLangs)
      langDict = wikiLangs[wikiRedirects[langCode]];
    else continue;

    rowDiv.appendChild(createDoubleLang(langDict.lang, langDict.lang_engl));
    rowDiv.appendChild(createGraph(size, maxSize));

    rowDiv.addEventListener("click", onClickAction.bind(null, langCode, title));

    rows.appendChild(rowDiv);
  }
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

  lang_title_list.push([lang, title]); // add active article
  const sizes = await processSizeFetching(lang_title_list);
  if (sizes.length === 0) {
    errorScreen("error_screens\\failed_connection.html");
    return false;
  }

  populateTable(sizes);

  document.getElementById("message").remove();
  document.getElementById("loading-thing").remove();

  return true;
}

execute();
