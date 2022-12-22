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
  const data = await response.json();

  const pages = data.query.pages;
  const pageID = Object.keys(pages)[0];
  const page_info = pages[pageID];

  console.log("fetched alt langs for: " + page_info.title);

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

  if (!found) return ["not a proper wikipedia page...", "die"];
  return [found[1], found[2]];
}

const items1 = [
  { date: "10/17/2018", name: "john doe" },
  { date: "10/18/2018", name: "jane doe" },
];
const items2 = [
  { date: "10/17/2019", name: "john doe" },
  { date: "10/18/2019", name: "jane doe" },
];

function xfunc() {
  var url = "http://stackoverflow.com/";
  chrome.tabs.create({ url, active: false });
}
function populateTable(arr) {
  const table = document.getElementById("testBody");
  arr.forEach((size_dict) => {
    let row = table.insertRow();
    let date = row.insertCell(0);
    date.innerHTML = size_dict.lang;
    let title = row.insertCell(1);
    title.innerHTML = size_dict.title;
    let size = row.insertCell(2);
    size.innerHTML = size_dict.size;
    row.onclick = xfunc;
    // let button = row.insertCell(0);
    // button.innerHTML = ;
  });
}

async function execute() {
  const [lang, title] = await getCurrentTab();
  document.getElementById("basic").innerHTML =
    "current:\n" + lang + " " + title;

  const lang_title_list = await fetchLanguages(lang, title);
  lang_title_list.push([lang, title]); // add active article
  const sizes = await processSizeFetching(lang_title_list);
  console.log(sizes);
  // console.log(sizes);
  populateTable(sizes);
  // document.getElementById("basic").innerHTML = sizes
  //   .map((size) => size.lang + "/" + size.title + ": " + size.size)
  //   .join("\n");

  return true;
}

document.getElementById("trigger").addEventListener("click", function () {
  execute();
});
