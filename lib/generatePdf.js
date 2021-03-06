const { spawn } = require("child_process");
const fs = require("fs-extra");
const co = require("co");
const { logger } = require("../lib/logger");
const extDataPromise = require("../lib/extData");

//where the template promises are stored
const templatePromises = {};

//load all latex template files
[
  { type: "resolution", template: "template" },
  { type: "booklet", template: "booklet-template" }
]
  .map(
    //for every template defintion
    templateDef => ({
      //set the template loading promise
      templatePromise: fs
        .readFile(`./resources/${templateDef.template}.latex`, "utf8")
        .then(
          //split data on $body$ when done loading
          data => data.split("$body$"),
          () => logger.error("Could not read template latex file")
        ),

      //set the type of this template
      type: templateDef.type
    })
  )
  .forEach(
    //insert into the templatePromises object by type
    t => (templatePromises[t.type] = t.templatePromise)
  );

//does one render
const doRenderPass = (renderDirPath, renderStringLog, passNumber) => {
  //start the render process by spawning the xelatex process
  const xelatexProcess = spawn(
    "xelatex",
    [
      //makes xelatex exit on errors
      "-halt-on-error",

      //tell it what the input file is called
      "document.latex"
    ],
    {
      //pass the working directory, the newly created temporary subdirectory in ./render
      cwd: renderDirPath,

      //make sure to not use shell mode
      shell: false
    }
  );

  //output accumulator
  let data = "";

  //collect all the data sent over stdout
  xelatexProcess.stdout.on("data", output => {
    //convert the passed buffer to a string
    data += output.toString();
  });

  //return a promise that is handled according to the render (/process) outcome
  return new Promise((resolve, reject) => {
    //catch errors on spawn
    xelatexProcess.on("error", err => {
      //log and reject with error
      logger.error(`xelatex spawn error on pass #${passNumber}`);
      reject(err);
    });

    //when the process ends, with an error or successful
    xelatexProcess.on("exit", () => {
      //the presence of a particular string in the output
      //determines whether or not an error occurred
      if (
        ["No pages of output", ".pdf may not be valid"].some(str =>
          data.includes(str)
        )
      ) {
        //error log data
        logger.error(`pdf render error on pass #${passNumber}: ${data}`, {
          renderStringLog
        });
        reject(new Error("render error"));
      } else {
        //rendering was probably ok, resolve with data
        resolve(data);
      }
    });
  });
};

//returns the correct punctuation for a given op clause context
const getOpPunctuation = (subPresent, lastInClause, isLastClause) =>
  //essentially a precedence waterfall
  //it's the last in the doc if it's the last in the clause that is the last clause in the doc
  subPresent
    ? ":"
    : lastInClause && isLastClause
    ? "."
    : lastInClause
    ? ";"
    : ",";

//capitalizes the first character of a string
const capFirst = str =>
  //get first char and capitalize
  str[0].toUpperCase() + str.slice(1);

//for parser debugging purposes
/*String.prototype.p = function() {
  console.log(this);
  return this;
};*/

//latex code replacer functions for _ and * and ^-type constructs
const modeScriptReplacers = {
  sub: (m, innerMatch) => `\\textsubscript{${innerMatch}}`,
  super: (m, innerMatch) => `\\textsuperscript{${innerMatch}}`,
  emph: (m, innerMatch) => `\\emph{${innerMatch}}`
};

//processes apostrophes
const processApostrophes = str =>
  //convert detached ticks and normal apostrophes to nicer apostrophe character
  //remove space before such characters with " *"
  str.replace(/ *[`´'’]+/g, "'");

//remove illegal chars and expect and sign
const removeIllegalChars = (str, doApostrophes) => {
  //if enabled, process apostrophes
  if (doApostrophes) {
    str = processApostrophes(str);
  }

  //filter chars
  return (
    str
      //remove disallowed unicode characters (these are all the allowed characters)
      .replace(/[^a-zA-Z0-9*_^|&'"\-.,()/+\u00c0-\u024F ]+/g, "")

      //the & sign may be used in names and will be escaped
      .replace(/&/g, "\\&")
  );
};

//prepares the string by selectively removing punctuation
const prepareClause = str => {
  //remove unwanted characters and perform other transforms
  str = str
    //limit a single content node to 2500 characters
    .substring(0, 2500)

    //remove too long words, limit to 45 characters
    .replace(/\b[^\s ]{46,}/g, "");

  //process apostrophes before normalization
  str = processApostrophes(str)
    //attempt to combine Unicode diacritical marks and letters before removing all detached marks
    .normalize("NFKC")

    //convert all types of double quotes to normal quotes
    //for csquotes to do its thing we need them all to be the same
    .replace(/[“”‹›«»]/g, '"')

    //remove all non-space whitespace and/or at least two spaces surrounded by any whitespace
    //(replace by single space to preserve words)
    .replace(/\s*[^\S ]+| {2,}\s*/g, " ")

    //remove trailing _ and ^ (produce latex error), also remove trailing .,-(&/+
    .replace(/[_^.,\-(&/+]+$/g, "")

    //remove preceding |.,-)&/+
    .replace(/^[|.,\-)&/+]+/g, "")

    //remove all spaces at tips
    .trim();

  //remove illagal chars, general filter
  str = removeIllegalChars(str, false);

  //append final " if there is an odd amount of "s
  if ((str.match(/"/g) || []).length % 2) {
    //append at end of string to satisfy renderer (throws error otherwise)
    str += '"';
  }

  //return with final modifications
  return (
    str
      //parse special char markers: see issue douira/resolution-editor#104
      //asteriks enclose italics, add the italics markers
      .replace(/\*(.+?)\*/g, modeScriptReplacers.emph)

      //remove left over italics markers
      .replace(/\*/g, "")

      //remove empty enclosed sub- and superscripts and left over italics markers
      .replace(/[_^*]+[|*]+|\*/g, "")

      //enclosed sub- and superscripts
      .replace(/[_^]*_+([^_^]+?)\|+/g, modeScriptReplacers.sub)
      .replace(/[_^]*\^+([^_^]+?)\|+/g, modeScriptReplacers.super)

      //single sub- and superscripts
      .replace(/[_^]*_+([^_^])/g, modeScriptReplacers.sub)
      .replace(/[_^]*\^+([^_^])/g, modeScriptReplacers.super)

      //remove left over | that didn't have anthing to match with before them
      .replace(/\|/g, "")
  );
};

//removes any non alphanumeric (or not space) characters from the string (for header info stings)
const prepareHeader = str =>
  //remove illegal chars and limit length
  removeIllegalChars(str, true)
    .trim()
    .substring(0, 500);

//possible plenary names
const plenaryNames = {
  //names of plenaries by id
  byId: [false, "General Assembly", "Economic and Social Council"]
};

//names of plenaries by abbreviation
plenaryNames.byAbbr = {
  GA: plenaryNames.byId[1],
  ECOSOC: plenaryNames.byId[2]
};

//gets the full country name for a given normal name
const getFullName = (extData, name) => {
  //find full name for this country
  const countryData = extData.countries[name];

  //must be present
  if (countryData) {
    return countryData.fullname;
  }

  //warn and use placeholder
  logger.warn(
    `Country name ${name} is invalid and has no country data in extData.`
  );
};

/*generates latex code to be compiled and used by an installed latex binary
  and then turned into a pdf that is displayed to the user for printing
  Tested the performance of this function: about 0.029ms per call (for a mediumsmall resolution)
*/
const generateLatex = (resDoc, extData, bookletMode) => {
  //unpack resolution
  const obj = resDoc.content;

  //if in booklet mode
  let headerTexts;
  if (bookletMode) {
    //find plenary name for this forum
    const forumData = extData.forums[obj.resolution.address.forum];

    //require forum data to be valid
    let plenaryName;
    if (forumData) {
      //get plenary id and find name
      plenaryName = plenaryNames.byId[forumData.plenary];
    } else {
      //warn
      logger.warn(
        `Forum called ${
          obj.resolution.address.forum
        } is invalid and has no forum data in extData`
      );

      //use placeholder
      plenaryName = "--- Invalid Forum ---";
    }

    //booklet header
    headerTexts = {
      forum: plenaryName,
      sponsor: prepareHeader(capFirst(obj.resolution.address.forum))
    };
  } else {
    //regular names
    headerTexts = {
      forum: prepareHeader(capFirst(obj.resolution.address.forum)),
      sponsor: prepareHeader(
        capFirst(getFullName(extData, obj.resolution.address.sponsor.main))
      )
    };
  }

  //latex document body code accumulator
  let str = "";

  //check if a resolution ID has been generated
  if ("resolutionId" in resDoc) {
    //add identifier to corner header
    str += `${bookletMode ? "\\fancyhead[RE ,LO]" : "\\rhead"}{MUNOL / ${
      resDoc.idYear
    } / ${resDoc.resolutionId}}\n`;
  }

  //add the rest of the address
  str += `\\begin{tabular}{@{}p{.25\\linewidth}p{.72\\linewidth}}
FORUM: &${headerTexts.forum}\\\\\\\\
QUESTION OF: &${prepareHeader(
    capFirst(obj.resolution.address.questionOf)
  )}\\\\\\\\
SPONSOR: &${headerTexts.sponsor}\\\\\\\\`;

  //no cosponsors in booklet mode for now
  if (!bookletMode) {
    //add co-sponsors if there are any
    const coSponsors = obj.resolution.address.sponsor.co;
    if (coSponsors && coSponsors.length) {
      //add cosponsors
      str += `CO-SPONSORS: &${coSponsors
        .map(
          //map name to fill name and prepare
          name => prepareHeader(capFirst(getFullName(extData, name)))
        )
        .join(", ")}\\\\\\\\`;
    }
  }

  //finish the address
  str += `\\end{tabular}\\\\~\\newline~\\newline\\MakeUppercase{THE ${
    headerTexts.forum
  }},\\newline\\newline`;

  //preambs
  str += obj.resolution.clauses.preambulatory
    .map(clause => {
      //check if subclauses are going to be added
      const subsPresent = clause.sub && clause.sub.length;

      //add code for clause, add correct punctuation at end of content
      let str = `\\begin{preamb}{${prepareHeader(
        capFirst(clause.phrase)
      )}}{${prepareClause(clause.content) + (subsPresent ? ":" : ",")}}`;

      //handle subclauses
      if (subsPresent) {
        //start subclauses
        str += "\\begin{preambsubclause}";

        //fill in all subclause contents
        str += clause.sub
          .map(sub => `\\item ${prepareClause(sub.content)},`)
          .join("\n");

        //end subclauses
        str += "\\end{preambsubclause}";
      }

      //add extended content if available
      if (clause.contentExt && clause.contentExt.length) {
        str += `${prepareClause(clause.contentExt)},`;
      }

      //end of preamb
      str += "\\end{preamb}";

      //return created clause
      return str;
    })
    .join("\n");

  //ops
  if (obj.resolution.clauses.operative.length) {
    //close gap between preambulatory and operative clauses
    //and begin operative clauses
    str +=
      "\\vspace{-12pt}\\begin{enumerate}[1., align = left, leftmargin =2cm , " +
      "widest* = 8, labelindent=0cm, labelsep=1cm, topsep=0pt] \\itemsep12pt ";

    //for every oc clause
    str += obj.resolution.clauses.operative
      .map((clause, index, arr) => {
        //check if there are going to be subclauses
        const subsPresent = clause.sub && clause.sub.length;

        //check if we are in the last clause
        const lastClause = index === arr.length - 1;

        //clause beginning with correct punctuation
        let cStr = `\\begin{oc}{${prepareHeader(
          capFirst(clause.phrase)
        )}}{${prepareClause(clause.content) +
          getOpPunctuation(subsPresent, !subsPresent, lastClause)}}`;

        //add subclauses, if detected
        if (subsPresent) {
          //begin of subclauses
          cStr += "\\begin{ocsubclause}";

          //check if super clause has extended content
          const hasExtContent = clause.contentExt && clause.contentExt.length;

          //for all subclauses add to string
          cStr += clause.sub
            .map((subclause, subIndex, subArr) => {
              //start with item
              let subContent = "\\item ";

              //add content, punctuation comes later
              subContent += prepareClause(capFirst(subclause.content));

              //check if subsubs are present
              const subsubsPresent = subclause.sub && subclause.sub.length;

              //check if this is the last subclause
              const lastSubClause = subIndex === subArr.length - 1;

              //add punctuation
              subContent += getOpPunctuation(
                subsubsPresent,
                !subsubsPresent && lastSubClause && !hasExtContent,
                lastClause
              );

              //add susubs if there are any
              if (subsubsPresent) {
                //begin subsubclause
                subContent += "\\begin{ocsubsubclause}";

                //check if super subclause has extended content
                const subHasExtContent =
                  subclause.contentExt && subclause.contentExt.length;

                //add all subclauses of this subclause
                subContent += subclause.sub
                  .map((subSub, subSubIndex, subSubArr) => {
                    //check if this is the last subsub clause
                    const lastSubSubClause =
                      subSubIndex === subSubArr.length - 1;

                    //generate items with correct punctuation
                    return `\\item ${prepareClause(
                      subSub.content
                    )}${getOpPunctuation(
                      false,
                      lastSubSubClause &&
                        lastSubClause &&
                        !subHasExtContent &&
                        !hasExtContent,
                      lastClause
                    )}`;
                  })
                  .join("\n");

                //end sub segment
                subContent += "\\end{ocsubsubclause}";
              }

              //extension of subclauses if available
              if (subclause.contentExt && subclause.contentExt.length) {
                subContent += `~${prepareClause(
                  subclause.contentExt
                )}${getOpPunctuation(
                  false,
                  lastSubClause && !hasExtContent,
                  lastClause
                )}`;
              }

              //return content of subclause
              return subContent;
            })
            .join("\n");

          //end subclauses
          cStr += "\\end{ocsubclause}";
        }

        //extension of operative clause if available
        if (clause.contentExt && clause.contentExt.length) {
          cStr +=
            prepareClause(clause.contentExt) +
            getOpPunctuation(false, true, lastClause);
        }

        //end clause and return
        return `${cStr}\\end{oc}`;
      })
      .join("\n");

    //end subclause list
    str += "\\end{enumerate}";
  }

  //return generated body latex string
  return str;
};

//generates latex to be rendered for the whole passed resolution booklet
const generateBooklet = (booklet, extData) => {
  //booklet may only have 7 or 8 signatures for now
  if (!(booklet.signatures.length === 7 || booklet.signatures.length === 8)) {
    logger.warn(
      "Only 7 or 8 signatures allowed in booklet for now, found other amount"
    );
  }

  //get the full name of the forum
  const fullForumName = plenaryNames.byAbbr[booklet.type];

  //init the title page header latex code
  let str = `\\begin{titlepage}
\\fontsize{1.0cm}{1.2cm}\\selectfont
\\centering
\\textbf{\\textsc{${booklet.title}}}\\\\
\\fontsize{0.7cm}{1.05cm}\\selectfont
\\textbf{\\textsc{${fullForumName}}}\\\\
\\fontsize{1cm}{1.8cm}\\selectfont
\\textbf{${booklet.session}}\\\\
\\vspace*{0.7cm}
\\date{}
\\begin{figure}[h]
\\centering
\\includegraphics[width=11.5cm]{../../resources/graylogo.png}
\\end{figure}
\\begin{figure}
\\centering
\\begin{tikzpicture}
\\footnotesize`;

  //second row has 3 or 4 signatures, check if there are 7 or 8 in total, because this
  //changes the position offset of the second row of signatures
  const applyOffset = booklet.signatures.length === 7 ? "+\\offsetsieben" : "";

  //generate signature latex code for all signatures
  str += booklet.signatures
    .map((signature, index) => {
      //check what row we are in, first four are the first row
      if (index <= 3) {
        return `\\draw (${index}*\\strichbreite+${index}*\\luecke,\\erstezeile) -- (${index +
          1}*\\strichbreite+${index}*\\luecke,\\erstezeile); \\node [align=center] at (${index +
          0.5}*\\strichbreite+${index}*\\luecke,\\erstezeile-0.3)[below] {${
          signature.name
        }};\\node [align=center] at (${index +
          0.5}*\\strichbreite+${index}*\\luecke,\\erstezeile-1)[below] {${
          signature.position
        }};`;
      }

      //reduce index by 4 to get the index of this signature in the second row
      index -= 4;

      //return drawing code for second row signature, with or without offset
      return `\\draw (${index}*\\strichbreite+${index}*\\luecke${applyOffset},\\zweitezeile) -- (${index +
        1}*\\strichbreite+${index}*\\luecke${applyOffset},\\zweitezeile);\\node [align=center] at (${index +
        0.5}*\\strichbreite+${index}*\\luecke${applyOffset},\\zweitezeile-0.3)[below] {${
        signature.name
      }};\\node [align=center] at (${index +
        0.5}*\\strichbreite+${index}*\\luecke${applyOffset},\\zweitezeile-1)[below] {${
        signature.position
      }};`;
    })
    .join("");

  //finalize with header closing code
  str += `\\end{tikzpicture}
\\end{figure}
\\thispagestyle{empty}
\\end{titlepage}
\\newpage
\\setcounter{page}{1}
\\newgeometry{twoside,headheight=14pt,headsep=12pt,footskip=24pt, vmargin=2cm, includeheadfoot}`;

  //add latex code for all included resolutions and wrap in resolution tags
  return (
    str +
    booklet.resolutions
      .map(
        resDoc =>
          `\\begin{resolution}${generateLatex(
            resDoc,
            extData,
            true
          )}\\end{resolution}`
      )
      .join("")
  );
};

//generates a pdf file for the given resolution document
module.exports = (renderDoc, templateType) =>
  co(function*() {
    //check if we are in booklet mode
    const bookletMode = templateType === "booklet";

    //file name to render, prepend booklet in booklet mode
    const renderFileName = `${
      bookletMode ? `booklet${renderDoc._id}` : renderDoc.token
    }.pdf`;

    //the temporary directory to do the rendering in
    const renderDirPath = `./render/${renderFileName}`;

    //the path for the latex input file
    const inputFilePath = `${renderDirPath}/document.latex`;

    //create an empty dir to render in
    yield fs.emptyDir(renderDirPath);

    //wait for the template and the extData to have been loaded
    const [splitData, extData] = yield [
      templatePromises[templateType],
      extDataPromise
    ];

    //generate the latex body to enclose in the template and render
    const latexInner = bookletMode
      ? generateBooklet(renderDoc, extData)
      : generateLatex(renderDoc, extData, false);

    //use the returned template processor function and write the result to a file
    //by giving it the generated latex wrapped in the template
    const renderString = splitData[0] + latexInner + splitData[1];
    yield fs.writeFile(inputFilePath, renderString);

    //render twice to resolve page numbers
    yield doRenderPass(renderDirPath, renderString, 0);
    const renderLog = yield doRenderPass(renderDirPath, renderString, 1);

    //match page amount with two different methods
    const pageAmountMatch =
      renderLog.match(/Output written on document.pdf \(([0-9]+) pa/) ||
      renderLog.match(/AED: lastpage setting LastPage\n\[([0-9]+)\]/);

    //if there was a match
    let pageAmount;
    if (pageAmountMatch) {
      //parse the page amount
      pageAmount = parseInt(pageAmountMatch[1], 10);
    }

    //error when not finding the page number or not being able to parse it
    if (!pageAmount) {
      //do error message, but don't reject, the pdf may still be fine
      logger.error("could not parse page amount from render log output");

      //log latex output for dealing with the error
      logger.debug("latex render output: ", { renderLog });

      //set to unambiguous 0
      pageAmount = 0;
    }

    //move the pdf to the public static directory
    yield fs.rename(
      `${renderDirPath}/document.pdf`,
      `./public/rendered/${renderFileName}`
    );

    //finally delete the temporary rendering directory
    yield fs.remove(renderDirPath);

    //return found page amount (to be put in database)
    return pageAmount;
  });
