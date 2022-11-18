function getSize(lang_code, title) {
  return True;
  console.log(lang_code, title);
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

  console.log(url);

  fetch(url)
    .then((response) => response.json())
    .then((data) => data.query.pages)
    .then((pages) => pages[Object.keys(pages)[0]])
    // .then((page) => page.langlinks)
    .then((page) => {
      console.log(page.revisions.size);
    });
}

function printLangsInfo(p1, p2) {
  // why do I do this?
  let lang_code = p1;
  let title = p2;
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

  fetch(url)
    // fetch("data2.json")
    .then((response) => response.json())
    .then((data) => data.query.pages)
    .then((pages) => pages[Object.keys(pages)[0]].revisions)
    // .then((page) => page.langlinks)
    .then((revision) => {
      // assert revision.length == 1...
      console.log(lang_code + revision[0].size);
      return lang_code + revision[0].size;
    });
}

async function processPages(langlinks) {
  let result;
  let promises = [];

  langlinks.forEach((x) => promises.push(printLangsInfo([x.lang, x["*"]])));

  result = await Promise.all(promises);
  console.log(result);
  // for (let i = 0; i < user_list.length; i++) {
  //   user_list[i]["result"] = result[i];
  // }
  return result;
  // return user_list;
}

function hitWiki(lang_code, title) {
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

      const lang_size_list = processPages(page.langlinks);

      document.getElementById("basic").innerHTML = lang_size_list;
      console.log(lang_size_list);
    });
}

// function getSize(props) {}

document.getElementById("trigger").addEventListener("click", function () {
  hitWiki("en", "Lego_World_Racers");
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
