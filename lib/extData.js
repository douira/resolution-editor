/*jshint esversion: 6, node: true */

const request = require("request-promise-native");
const { logger } = require("../lib/logger");
const fs = require("fs-extra");
const co = require("co");

//parses the committee and country data from the request or from the fallback file
function useData(data) {
  //get the countries and the forums
  const { countries, forums } = data;

  //must be present
  if (typeof countries !== "object" || typeof forums !== "object") {
    logger.error("gotten raw extData is malformed");
    return false;
  }

  //create object to export
  const out = {
    countries: { },
    forums: { }
  };

  //change to reference countries by name
  for (const id in countries) {
    //get country
    const country = countries[id];

    //add id to country itself
    country.id = id;

    //add property with this country
    out.countries[country.name] = country;
  }

  //change to reference forums by name
  const mapCountries = countryId => countries[countryId];
  for (const id in forums) {
    //get forum
    const forum = forums[id];

    //add id to forum itself
    forum.id = id;

    //replace ids of countries with references to country objects
    forum.countries = forum.countries.map(mapCountries);

    //add forums to output forums by name
    out.forum[forum.name] = forum;
  }

  //return created data object
  return out;
}

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
  } else {
    //failed completely
    logger.fatal("Could not get extData at all.");
  }
});
