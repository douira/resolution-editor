/*jshint esversion: 6, node: true*/
const { spawn } = require("child_process");
const fs = require("fs-extra");
const co = require("co");
const { logger } = require("../lib/logger");

//load template latex file
const templateLatex = fs.readFile("./lib/template.latex", "utf8").then(data => {
  //split data on $body$ when done loading
  return data.split("$body$");
}, () => logger.error("Could not read template latex file"));

//does one render
function doRenderPass(renderDirPath) {
  //return a promise linked to the errors or success of the render process
  //start the render process by spawning the xelatex process
  const process = spawn("xelatex", [
    //makes xelatex exit on errors
    "-halt-on-error",

    //tell it what the input file is called
    "document.latex"
  ], {
    //pass the working directory, the subdirectory in ./render
    cwd: renderDirPath,

    //make sure to not use shell mode
    shell: false
  });

  //output acculumator
  let data = "";

  //collect all the data sent over stdout
  process.stdout.on("data", output => {
    //convert the passed buffer to a string
    data += output.toString();
  });

  //return a promise that is handled according to the render outcome
  return new Promise((resolve, reject) => {
    //when the process ends, with an error or successful
    process.on("exit", () => {
      //the presence of a particular string in the output determines wether or not an error occured
      if (data.includes("No pages of output")) {
        reject("render error");
      } else {
        //rendering was probably ok, resolve with data
        resolve(data);
      }
    });
  });
}

//generates a pdf file for the given resolution document
module.exports = function generatePdf(resDoc) { return co(function* () {
  //the temporary directory to do the rendering in
  const renderDirPath = "./render/" + resDoc.token;

  //the path for the latex input file
  const inputFilePath = renderDirPath + "/document.latex";

  //create an empty dir to render in
  yield fs.emptyDir(renderDirPath);

  //wait for the template to have been loaded
  const splitData = yield templateLatex;

  //use the returned template processor function and write the result to a file
  //by giving it the generated latex wrapped in the template
  yield fs.writeFile(inputFilePath, splitData[0] + generateLatex(resDoc) + splitData[1]);

  //render twice to resolve page numbers
  yield doRenderPass(renderDirPath);
  const renderLog = yield doRenderPass(renderDirPath);

  //parse number of pages
  let pageAmount;
  try {
    //match where the total page number is and try to parse it
    pageAmount = parseInt(
      renderLog.match(/AED: lastpage setting LastPage\n\[([0-9]+)\]/)[1], 10);
  } catch (err) {
    //do error message, but don't reject, the pdf may still be fine
    logger.error(err, "could not parse page amount from renderlog output");
  }

  //move the pdf to the public static directory
  yield fs.rename(renderDirPath + "/document.pdf", "./public/rendered/" + resDoc.token + ".pdf");

  //finally delete the temporary rendering directory
  yield fs.remove(renderDirPath);

  //return found page amount (to be put in database)
  return pageAmount;
}); };

//returns the correct punctuation for a given op clause context
function getOpPunctuation(subPresent, lastInClause, isLastClause) {
  //essentially a precendence waterfall
  //it's the last in the doc if it's the last in the clause that is the last clause in the doc
  return subPresent ? ":" : (lastInClause && isLastClause) ? "." : lastInClause ? ";" : ",";
}

//capitalizes the first character of a string
function capFirst(str) {
  //depending on whether there are subsub clauses in ocs or not, one gets an
  //object and has to use the content field,
  //or gets a string and can use it right away
  if (str.content) {
    str = str.content;
  }

  //get first char and capitalize
  return str[0].toUpperCase() + str.slice(1);
}

//uncapitalizes the first character of a string
/*function uncapFirst(str) {
  //get first char and uncapitalize
  return str[0].toLowerCase() + str.slice(1);
}*/

//replacer functions for _ and * and ^
const modeScriptReplacers = {
  sub: (m, innerMatch) => "\\textsubscript{" + innerMatch + "}",
  super: (m, innerMatch) => "\\textsuperscript{" + innerMatch + "}",
  emph: (m, innerMatch) => "\\emph{" + innerMatch + "}"
};

//prepares the string by selectively removing punctuation
function prepareClause(str) {
  //remove unwanted chararcters and transform quotation marks
  str = str
    //convert detached ticks and normal apostrophes to nicer apostrophe character
    //remove space before such characters with " *"
    .replace(/ *[`´']+/g, "’")

    //convert all types of double quotes to normal quotes
    //for csquotes to do its thing we need them all to be the same
    .replace(/[“”‹›«»]/g, "\"")

    //remove duplicates of all but these characters a-zA-Z0-9
    //(not ", that would cause confusion for the renderer)
    //.replace(/([^a-zA-Z0-9"])(?=\1)/g, "")

    //remove all spaces at tips
    .trim()

    //remove all consecutive whitespace that includes a non-space whitespace character
    //(replace by single space to preserve words)
    .replace(/\s*[^\S ]+\s*/g, " ")

    //remove special characters that may mess up latex,
    //^ and _ are used later though (see below) and & is extra escaped
    //.replace(/[#$%\\{}~]+/g, "")

    //remove all but these characters from the end of the string a-zA-Z0-9
    //(removes punctuation that may have been allowed by 1st in the body of the string)
    //allow special chars | and * for end of sub/superscript and italics closing
    //.replace(/[^a-zA-Z0-9*|]$/g, "")

    //remove disallowed unicode characters (these are all the allowed characters)
    .replace(/[^a-zA-Z0-9*_^|&’"\-.,()/+\u00c0-\u024F ]+/g, "")

    //the & sign may be used in names and will be escaped
    .replace(/&/g, "\\&");

  //append final " if there is an odd amount of "s
  if ((str.match(/"/g) || []).length % 2) {
    //append at end of string to saitfy renderer (throws error otherwise)
    str += "\"";
  }

  //return with final modifications
  return str
    //parse special char markers: see issue douira/resolution-editor#104
    //asteriks enclose italics, add the italics markers
    .replace(/\*(.*?)\*/g, modeScriptReplacers.emph)

    //enclosed sub- and superscripts
    .replace(/_([^_^]*?)\|/g, modeScriptReplacers.sub)
    .replace(/\^([^_^]*?)\|/g, modeScriptReplacers.super)

    //single sub- and superscripts
    .replace(/_([^_^])/g, modeScriptReplacers.sub)
    .replace(/\^([^_^])/g, modeScriptReplacers.super);
}

//removes any non alphanumeric (or not space) characters from the string (for header info stings)
function prepareHeader(str) {
  return str.trim().replace(/[^0-9a-zA-Z ]/g, "");
}

/*generates latex code to be compiled and used by a installed latex binary
  and then turned into a pdf that is displayed to the user for printing
  Tested the performance of this function: about 0.029ms per call (for a mediumsmall resolution)
*/
function generateLatex(resDoc) {
  //unpack resolution
  const obj = resDoc.content;

  //add setup and some data
  let str =
`\\newcommand{\\forum}{${prepareHeader(capFirst(obj.resolution.address.forum))}}
\\newcommand{\\issue}{${prepareHeader(capFirst(obj.resolution.address.questionOf))}}
\\newcommand{\\sponsor}{${prepareHeader(capFirst(obj.resolution.address.sponsor.main))}}`;

  //check if a resolution ID has been generated
  if ("resolutionId" in resDoc) {
    //add dentifier to corner header
    str += `\\rhead{MUNOL / ${resDoc.idYear} / ${resDoc.resolutionId}}\n`;
  }

  //add co-sponsors if there are any
  const coSponsors = obj.resolution.address.sponsor.co;
  const coSponsorsPresent = coSponsors && coSponsors.length;
  if (coSponsorsPresent) {
    //add another command
    str += `\\newcommand{\\cosponsors}{${
      coSponsors.map(str => prepareHeader(capFirst(str))).join(", ")}}`;
  }

  //add the rest of the address
  str += "\\begin{tabbing}" +
    "FORUM: \\quad \\quad  \\quad \\quad\\=\\forum \\\\\\\\" +
    "QUESTION OF: \\>\\issue \\\\\\\\" +
    "SPONSOR: \\>\\sponsor \\\\";

  //add cosponsor part if present
  if (coSponsorsPresent) {
    str += "\\\\CO-SPONSORS: \\>\\cosponsors \\\\";
  }

  //finish the address
  str += "\\end{tabbing}\\MakeUppercase{THE \\forum},\\newline";

  //preambs
  str += obj.resolution.clauses.preambulatory.map(
    clause => {
      //check if subclauses are going to be added
      const subsPresent = clause.sub && clause.sub.length;

      //add code for clause, add correct punctuation at end of content
      let str = `\\begin{preamb}{${prepareHeader(capFirst(clause.phrase))}}{${
        prepareClause(clause.content) + (subsPresent ? ":" : ",")}}`;

      //handle subclauses
      if (subsPresent) {
        //start subclauses
        str += "\\begin{preambsubclause}";

        //fill in all subclause contents
        str += clause.sub.map(sub => `\\item ${prepareClause(sub.content)},`).join("\n");

        //end subclauses
        str += "\\end{preambsubclause}";
      }

      //add extended content if available
      if (clause.contentExt && clause.contentExt.length) {
        str += prepareClause(clause.contentExt) + ",";
      }

      //end of preamb
      str += "\\end{preamb}";

      //return created clause
      return str;
    }
  ).join("\n");

  //ops
  if (obj.resolution.clauses.operative.length) {

    //close gap between preambulatory and operative clauses
    str += "\\vspace{-12pt}";

    //begin operative clauses
    str += "\\begin{enumerate}[1., align = left, leftmargin =* , " +
      "widest* = 8, labelindent=0cm, labelsep=1cm, topsep=0pt] \\itemsep12pt " +

    //for every oc clause
    obj.resolution.clauses.operative.map((clause, index, arr) => {
      //check if there are going to be subclauses
      const subsPresent = clause.sub && clause.sub.length;

      //check if we are in the last clause
      const lastClause = index === arr.length - 1;

      //clause beginning with correct punctuation
      let cStr = `\\begin{oc}{${prepareHeader(capFirst(clause.phrase))}}{${
        prepareClause(clause.content) +
        getOpPunctuation(subsPresent, ! subsPresent, lastClause)}}`;

      //add subclauses, if detected
      if (subsPresent) {
        //begin of subclauses
        cStr += "\\begin{ocsubclause}";

        //check if super clause has extended content
        const hasExtContent = clause.contentExt && clause.contentExt.length;

        //for all subclauses add to string
        cStr += clause.sub.map((subclause, subIndex, subArr) => {
          //start with item
          let subContent = "\\item ";

          //add content, punctuation comes later
          subContent += prepareClause(capFirst(subclause));

          //check if subsubs are present
          const subsubsPresent = subclause.sub && subclause.sub.length;

          //check if this is the last subclause
          const lastSubClause = subIndex === subArr.length - 1;

          //add punctuation
          subContent += getOpPunctuation(
            subsubsPresent, ! subsubsPresent && lastSubClause && ! hasExtContent, lastClause);

          //add susubs if there are any
          if (subsubsPresent) {
            //begin subsubclause
            subContent += "\\begin{ocsubsubclause}";

            //check if super subclause has extended content
            const subHasExtContent = subclause.contentExt && subclause.contentExt.length;

            //add all subclauses of this subclause
            subContent += subclause.sub.map((subSub, subSubIndex, subSubArr) => {
              //check if this is the last subsub clause
              const lastSubSubClause = subSubIndex === subSubArr.length - 1;

              //generate items with correct punctuation
              return "\\item " +
                prepareClause(subSub.content) +
                getOpPunctuation(
                  false,
                  lastSubSubClause && lastSubClause && ! subHasExtContent && ! hasExtContent,
                  lastClause
                );
            }).join("\n");

            //end sub segment
            subContent += "\\end{ocsubsubclause}";
          }

          //extension of subclauses if available
          if(subclause.contentExt && subclause.contentExt.length){
            subContent += "~" + prepareClause(subclause.contentExt) + getOpPunctuation(
              false,
              lastSubClause && ! hasExtContent,
              lastClause
            );
          }

          //return content of subclause
          return subContent;
        }).join("\n");

        //end subclauses
        cStr += "\\end{ocsubclause}";
      }

      //extension of operative clause if available
      if(clause.contentExt && clause.contentExt.length){
          cStr += prepareClause(clause.contentExt) + getOpPunctuation(false, true, lastClause);
      }

      //end clause and return
      return cStr + "\\end{oc}";
    }).join("\n") + "\\end{enumerate}";
  }

  //return generated body latex string
  return str;
}

/*Generates Signature Code
* name: Name of Signee
* position: Position of Signee, e.g. Secretary-General
* index: determines the order of the signatures
* totalNumerOfSignatures: either 7 or 8 (4 in first row, 3 or 4 in second row)
*/
function generateSignature(name, position, index, totalNumerOfSignatures ){
    //first row of signatures
    let str = ``;
    if(index <= 3){ 
      str+= `\\draw (${index}*\\strichbreite+${index}*\\luecke,\\erstezeile) -- (${index+1}*\\strichbreite+${index}*\\luecke,\\erstezeile);
      \\node at (${index+0.5}*\\strichbreite+${index}*\\luecke,\\erstezeile-0.3)[below] {${name}};
      \\node at (${index+0.5}*\\strichbreite+${index}*\\luecke,\\erstezeile-1)[below] {(${position})};`;
    }else{
      //second row consisting of 4 or just 3 further signatures  
      index = index-4;
      if(totalNumerOfSignatures == 8){
        str+= `\\draw (${index}*\\strichbreite+${index}*\\luecke,\\zweitezeile) --  (${index+1}*\\strichbreite+${index}*\\luecke,\\zweitezeile);
        \\node at (${index+0.5}*\\strichbreite+${index}*\\luecke,\\zweitezeile-0.3)[below] {${name}};
        \\node at (${index+0.5}*\\strichbreite+${index}*\\luecke,\\zweitezeile-1)[below] {(${position})};`;
      }else if(totalNumerOfSignatures == 7){
        str+= `\\draw (${index}*\\strichbreite+${index}*\\luecke+\\offsetsieben,\\zweitezeile) -- (${index+1}*\\strichbreite+${index}*\\luecke+\\offsetsieben,\\zweitezeile);
        \\node at (${index+0.5}*\\strichbreite+${index}*\\luecke+\\offsetsieben,\\zweitezeile-0.3)[below] {${name}};
        \\node at (${index+0.5}*\\strichbreite+${index}*\\luecke+\\offsetsieben,\\zweitezeile-1)[below] {(${position})};`;  
      }else{
          console.log("You must have 7 or 8 signatures, everthing else doesn't work!");
      }
    }
    return str;
}

/*
* Generates the LaTeX Code for a title page
* title: Title of the Booklet, e.g. Resolution Booklet
* session: Session name, e.g. XXI Annual Session
* signatures: Array of signature items consisting of a name and a position
*/
function generateTitlePage(title, session, signatures){
  let str= `\\begin{titlepage}
            \\fontsize{1.2cm}{1.2cm}\\selectfont
            \\centering
            \\textbf{\\textsc{${title}}}\\\\
            \\fontsize{1cm}{1.5cm}\\selectfont
            \\textbf{${session}}
            \\vspace*{0.7cm}
            \\date{}
            \\begin{figure}[h]
            \\centering
            \\includegraphics[width=11.5cm]{graylogo.png}
            \\end{figure}
            \\begin{figure}
            \\centering
            \\begin{tikzpicture}
            \\footnotesize
            \\def\\strichbreite{3.25}
            \\def\\luecke{0.5}
            \\def\\erstezeile{4}
            \\def\\zweitezeile{1}
            `; 
            
  //adds signatures into code         
  signatures.reduce((accumulator, signature, signatureindex, arr)=>{
      str += generateSignature(signature.name, signature.position, signatureindex, arr.count);
  });            
 
  
  str += `\end{tikzpicture}	
        \end{figure}
        \thispagestyle{empty}
        \end{titlepage}
        \newpage
        \setcounter{page}{1}
        \newgeometry{twoside,headheight=14pt,headsep=12pt, footskip=24pt, vmargin=2cm, includeheadfoot}`;
  return str;
}


/*generates latex code for a whole booklet to be compiled and used by a installed latex binary
  and then turned into a pdf that is displayed to the user for printing
  Tested the performance of this function: about 0.029ms per call (for a mediumsmall resolution)
*/
function generateLatexBooklet(booklet) {

  let str= generateTitlePage(booklet.title, booklet.session, booklet.signatures);
       
  booklet.resolutions.reduce((accumulator, resDoc, resolutionIndex)=> {
    //unpack resolution
    const obj = resDoc.content;
      
    //add setup and some data
    str +=
        `\\begin{resolution}
        \\renewcommand{\\forum}{${General Assembly}}
        \\renewcommand{\\issue}{${prepareHeader(capFirst(obj.resolution.address.questionOf))}}
        \\renewcommand{\\sponsor}{${prepareHeader(capFirst(obj.resolution.address.forum))}}`;

    //check if a resolution ID has been generated
    if ("resolutionId" in resDoc) {
      //add dentifier to corner header
      str += `\\fancyhead[RE ,LO]{MUNOL / ${resDoc.idYear} / ${resDoc.resolutionId}}\n`;
    }

    //add the rest of the address
    str += "\\begin{tabbing}" +
      "FORUM: \\quad \\quad  \\quad \\quad\\=\\forum \\\\\\\\" +
      "QUESTION OF: \\>\\issue \\\\\\\\" +
      "SPONSOR: \\>\\sponsor \\\\";

    //finish the address
    str += "\\end{tabbing}\\MakeUppercase{THE \\forum},\\newline";

    //preambs
    str += obj.resolution.clauses.preambulatory.map(
      clause => {
        //check if subclauses are going to be added
        const subsPresent = clause.sub && clause.sub.length;
         //add code for clause, add correct punctuation at end of content
        let str = `\\begin{preamb}{${prepareHeader(capFirst(clause.phrase))}}{${
            prepareClause(clause.content) + (subsPresent ? ":" : ",")}}`;

        //handle subclauses
        if (subsPresent) {
          //start subclauses
          str += "\\begin{preambsubclause}";
           //fill in all subclause contents
          str += clause.sub.map(sub => `\\item ${prepareClause(sub.content)},`).join("\n");
           //end subclauses
          str += "\\end{preambsubclause}";
        }

        //add extended content if available
        if (clause.contentExt && clause.contentExt.length) {
          str += prepareClause(clause.contentExt) + ",";
        }

        //end of preamb
        str += "\\end{preamb}";

        //return created clause
        return str;
      }
    ).join("\n");

    //ops
    if (obj.resolution.clauses.operative.length) {

      //close gap between preambulatory and operative clauses
      str += "\\vspace{-12pt}";

      //begin operative clauses
      str += "\\begin{enumerate}[1., align = left, leftmargin =* , " +
        "widest* = 8, labelindent=0cm, labelsep=1cm, topsep=0pt] \\itemsep12pt " +

      //for every oc clause
      obj.resolution.clauses.operative.map((clause, index, arr) => {
        //check if there are going to be subclauses
        const subsPresent = clause.sub && clause.sub.length;

        //check if we are in the last clause
        const lastClause = index === arr.length - 1;

        //clause beginning with correct punctuation
        let cStr = `\\begin{oc}{${prepareHeader(capFirst(clause.phrase))}}{${
          prepareClause(clause.content) +
          getOpPunctuation(subsPresent, ! subsPresent, lastClause)}}`;

        //add subclauses, if detected
        if (subsPresent) {
          //begin of subclauses
          cStr += "\\begin{ocsubclause}";

          //check if super clause has extended content
          const hasExtContent = clause.contentExt && clause.contentExt.length;

          //for all subclauses add to string
          cStr += clause.sub.map((subclause, subIndex, subArr) => {
            //start with item
            let subContent = "\\item ";

            //add content, punctuation comes later
            subContent += prepareClause(capFirst(subclause));

            //check if subsubs are present
            const subsubsPresent = subclause.sub && subclause.sub.length;

            //check if this is the last subclause
            const lastSubClause = subIndex === subArr.length - 1;

            //add punctuation
            subContent += getOpPunctuation(
              subsubsPresent, ! subsubsPresent && lastSubClause && ! hasExtContent, lastClause);

            //add susubs if there are any
            if (subsubsPresent) {
              //begin subsubclause
              subContent += "\\begin{ocsubsubclause}";

              //check if super subclause has extended content
              const subHasExtContent = subclause.contentExt && subclause.contentExt.length;

              //add all subclauses of this subclause
              subContent += subclause.sub.map((subSub, subSubIndex, subSubArr) => {
                //check if this is the last subsub clause
                const lastSubSubClause = subSubIndex === subSubArr.length - 1;

                //generate items with correct punctuation
                return "\\item " +
                  prepareClause(subSub.content) +
                  getOpPunctuation(
                    false,
                    lastSubSubClause && lastSubClause && ! subHasExtContent && ! hasExtContent,
                    lastClause
                  );
              }).join("\n");

              //end sub segment
              subContent += "\\end{ocsubsubclause}";
            }

            //extension of subclauses if available
            if(subclause.contentExt && subclause.contentExt.length){
              subContent += "~" + prepareClause(subclause.contentExt) + getOpPunctuation(
                false,
                lastSubClause && ! hasExtContent,
                lastClause
              );
            }

            //return content of subclause
            return subContent;
          }).join("\n");

          //end subclauses
          cStr += "\\end{ocsubclause}";
        }

        //extension of operative clause if available
        if(clause.contentExt && clause.contentExt.length){
            cStr += prepareClause(clause.contentExt) + getOpPunctuation(false, true, lastClause);
        }

        //end clause and return
        return cStr + "\\end{oc}";
      }).join("\n") + "\\end{enumerate}\\end{resolution}";
    }
  });      
  
  //return generated body latex string
  return str;    
}