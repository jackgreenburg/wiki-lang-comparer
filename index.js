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

async function hitWiki(lang_code, title) {
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

  fetch(url)
    // fetch("data.json")
    .then((response) => response.json())
    .then((data) => data.query.pages)
    .then((pages) => pages[Object.keys(pages)[0]])
    // .then((page) => page.langlinks)
    .then((page) => {
      console.log(page.title);

      // const lang_size_list = await processPages(page.langlinks);

      page.langlinks.forEach((x) =>
        console.log(getSizeVerbose(x.lang, x["*"])),
      );
      // console.log();
      // document.getElementById("basic").innerHTML = lang_size_list;
      // console.log(lang_size_list);
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

  const urls = await getLangs(lang, title);
}

document.getElementById("trigger").addEventListener("click", function () {
  const tab = execute();
  // document.getElementById("basic").innerHTML = tab;

  // hitWiki("en", "Lego_World_Racers");
  // fetch(
  //   "https://en.wikipedia.org/w/api.php?&action=query&prop=revisions&format=json&rvprop=timestamp%7Csize&titles=Lego World Racers",
  // )
  //   .then((response) => response.json())
  //   .then((data) => data.query.pages)
  //   .then((data) => {
  //     console.log(data);
  //   });,
  // fetch(
  //   "https://da.wikipedia.org/w/api.php?&action=query&prop=revisions&format=json&rvprop=timestamp%7Csize&titles=Lego World Racers",
  // )
  //   .then((response) => response.json())
  //   .then((data) => data.query.pages)
  //   .then((data) => {
  //     console.log(data);
  //   });
});