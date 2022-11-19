function getSizeVerbose(lang_code, title) {
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

  console.log(title + " in " + lang_code + ":\n-->" + url);

  let a = fetch(url)
    // fetch("data2.json")
    .then((response) => response.json())
    .then((data) => data.query.pages)
    .then((pages) => pages[Object.keys(pages)[0]].revisions)
    .then((revision) => {
      // assert revision.length == 1...
      console.log(lang_code + revision[0].size);
      return lang_code + revision[0].size;
    })
    .then((a) => console.log("????", a));
  console.log("here:");
  console.log("><><" + a);
  return a;
}

async function processPages(langlinks) {
  let result;
  let promises = [];

  // langlinks.forEach((x) => promises.push(getSizeVerbose([x.lang, x["*"]])));

  // result = await Promise.all(promises);
  // console.log(result);
  for (let i = 0; i < user_list.length; i++) {
    user_list[i]["result"] = result[i];
  }
  // return result;
  return user_list;
}

/**
 * Takes a language and a title of an article.
 * Returns a list of lists containting the other languages and titles of the
 * other versions of the article.
 *
 * @param {string} lang_code    Description.
 * @param {string} title        Description of optional variable.
 * @return {list[list[string, string]]}   List of langs and titles
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

  return await fetch(url)
    // fetch("data.json")
    .then((response) => response.json())
    .then((data) => data.query.pages)
    .then((pages) => pages[Object.keys(pages)[0]])
    .then((page) => {
      console.log("fetched alt langs for: " + page.title);

      // const lang_size_list = await processPages(page.langlinks);
      return page.langlinks.map((x) => [x.lang, x["*"]]);
    });
}

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

async function execute() {
  const [lang, title] = await getCurrentTab();
  console.log("execute func--", lang, title);
  document.getElementById("basic").innerHTML = lang + " " + title;

  const lang_title_list = await fetchLanguages(lang, title);
  console.log(lang_title_list);
  return true;
}

document.getElementById("trigger").addEventListener("click", function () {
  execute();
  // document.getElementById("basic").innerHTML = tab;

  // fetchLanguages("en", "Lego_World_Racers");
  // fetchLanguages("da", "Lego_World_Racers");
});
