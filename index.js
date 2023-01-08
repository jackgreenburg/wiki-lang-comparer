// TODO: make this work with size or langlinks
function constructURL(lang_code, title) {
  // if prop === revisions... elif prop===langlinks
  let url = "https://" + lang_code + ".wikipedia.org/w/api.php";

  let params = {
    action: "query",
    prop: "revisions",
    format: "json",
    rvprop: "timestamp%7Csize",
    titles: title,
  };

  url = url + "?";
  Object.keys(params).forEach(function (key) {
    url += "&" + key + "=" + params[key];
  });

  return url;
}

async function fetchSize(lang_code, title) {
  const url = constructURL(lang_code, title);

  const response = await fetch(url);
  // const response = await fetch("fetch2_response.json");
  const data = await response.json();

  const pages = data.query.pages;
  const pageID = Object.keys(pages)[0];
  const page_info = pages[pageID];

  // perhaps assert length revisions == 0
  return {
    lang: lang_code,
    size: page_info.revisions[0].size,
    title: page_info.title,
  };
}

async function processSizeFetching(lang_title_list) {
  const articles = await Promise.all(
    lang_title_list.map((lang_title) => fetchSize(...lang_title)),
  );

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
  // set url with language
  let url = "https://" + lang_code + ".wikipedia.org/w/api.php";

  let params = {
    action: "query",
    prop: "langlinks",
    format: "json",
    lllimit: "500",
    titles: title,
  };

  // concatenate onto url
  url = url + "?";
  Object.keys(params).forEach(function (key) {
    url += "&" + key + "=" + params[key];
  });

  console.log("prepped first url:\n-->" + url);

  const response = await fetch(url);
  // const response = await fetch("fetch1_response.json");

  const data = await response.json();

  const pages = data.query.pages;
  const pageID = Object.keys(pages)[0];
  const page_info = pages[pageID];

  console.log("fetched alt langs for: " + page_info.title);
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
  return [found[1], found[2]];
}

function onClickAction(code, title) {
  const url = "https://" + code + ".wikipedia.org/wiki/" + title;
  console.log("Opening... " + url);

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
    console.log(langDict.lang);
    rowDiv.appendChild(createDoubleLang(langDict.lang, langDict.lang_engl));
    rowDiv.appendChild(createGraph(size, maxSize));

    rowDiv.addEventListener("click", onClickAction.bind(null, langCode, title));

    rows.appendChild(rowDiv);
  }
}

async function execute() {
  const [lang, title] = await getCurrentTab();
  if (!lang) {
    document.getElementById("basic").innerHTML =
      "not a proper wikipedia page... die";
    return false;
  }
  document.getElementById("basic").innerHTML =
    "searching for other languanges of article: " + title;

  const lang_title_list = await fetchLanguages(lang, title);
  lang_title_list.push([lang, title]); // add active article
  const sizes = await processSizeFetching(lang_title_list);
  console.log(sizes);
  // console.log(sizes);

  populateTable(sizes);
  // document.getElementById("basic").innerHTML = sizes
  //   .map((size) => size.lang + "/" + size.title + ": " + size.size)
  //   .join("\n");

  document.getElementById("basic").innerHTML = "";
  return true;
}

document.getElementById("trigger").addEventListener("click", function () {
  execute();
});
