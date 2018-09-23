const request = require("request-promise-native");
const { logger } = require("../lib/logger");
const fs = require("fs-extra");
const co = require("co");

//parses the committee and country data from the request or from the fallback file
const useData = data => {
  //parse json if not object
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch (e) {
      logger.error("gotten raw extData is invlaid json");
      return false;
    }
  }

  //get the countries and the forums
  const { countries, forums } = data;

  //must be present
  if (typeof countries !== "object" || typeof forums !== "object") {
    logger.error("gotten raw extData is json but invalid data");
    return false;
  }

  //create object to export
  const out = {
    countries: { },
    forums: { },
    countriesFlat: data.countries,
    forumsFlat: data.forums
  };

  //add references to countries by name
  for (const id in countries) {
    //get country copy
    const country = Object.assign({}, countries[id]);

    //add id to country itself
    country.id = id;

    //add property with this country
    out.countries[country.name] = country;
  }

  //add references to forums by name
  const mapCountries = countryId => countries[countryId];
  for (const id in forums) {
    //get forum copy
    const forum = Object.assign({}, forums[id]);

    //add id to forum itself
    forum.id = id;

    //parse plenary id
    forum.plenary = parseInt(forum.plenary, 10);

    //replace ids of countries with references to country objects
    forum.countries = forum.countries.map(mapCountries);

    //add forums to output forums by name
    out.forums[forum.name] = forum;
  }

  //return created data object
  return out;
};

//get data from url or fall back to file
module.exports = co(function*() {
  //the gotten raw data
  let rawData;

  //get the json from the url
  try {
    //the server at this url has its own chaching so we don't have to worry about its load
    rawData = yield request("http://munol.org/masscontent/reso_editor_data.json");
  } catch (e) {
    logger.error("Failed to get external data from url", { stack: e.stack });
  }

  //parse downloaded data if present
  if (rawData) {
    return useData(rawData);
  }

  //try to read from file instead
  try {
    rawData = yield fs.readFile("./resources/data.json", "utf8");
  } catch (e) {
    logger.error("Error reading extData from file", { stack: e.stack });
  }

  //use data if present
  if (rawData) {
    return useData(rawData);
  }

  //failed completely
  logger.fatal("Could not get extData at all.");
});
