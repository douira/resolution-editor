/*jshint esversion: 6, node: true*/

//returns the correct punctuation for a given op clause context
function getOpPunctuation(subPresent, lastInClause, lastInDoc) {
  //essentially a precendence waterfall
  return subPresent ? ":" : lastInDoc ? "." : lastInClause ? ";" : ",";
}

//capitalizes the first character of a string
function capFirst(str) {
  //get first char and capitalize
  return str[0].toUpperCase() + str.slice(1);
}

//uncapitalizes the first character of a string
/*function uncapFirst(str) {
  //get first char and uncapitalize
  return str[0].toLowerCase() + str.slice(1);
}*/

//prepares the string by selectively removing punctuation
function prepareClause(str) {
  return str.trim() //remove all spaces at tips
    .replace(/['`´’]/g, "’") //make all apostrophe like characters the same
    /*remove dissallowed punctuation:
      1st part: remove all but allowed characters 0-9a-zA-Z \-;:,
      2nd part: remove duplicates of all but these characters a-zA-Z0-9
      3rd part: remove all but these characters from the end of the string a-zA-Z0-9
        (removes punctuation that may have been allowed by 1st in the body of the string)
    */
    //.replace(/[^0-9a-zA-Z \-;:,.()$€"“”'%\/]/g, "")
    .replace(/([^a-zA-Z0-9])(?=\1)/g, "")
    .replace(/[^a-zA-Z0-9]$/g, "");
}

//removes any non alphanumeric characters from the string (for header info stings)
function prepareHeader(str) {
  return str.trim().replace(/[^0-9a-zA-Z ]/g, "");
}

//generates latex code to be compiled and used by a installed latex binary
//and then truned into a pdf that is displayed to the user for printing
module.exports = generateLatex;
function generateLatex(obj) {
  //add setup and some data
  let str = `
  \\newcommand{\\forum}{${prepareHeader(capFirst(obj.resolution.address.forum))}}
  \\newcommand{\\issue}{${prepareHeader(capFirst(obj.resolution.address.questionOf))}}
  \\newcommand{\\sponsor}{${prepareHeader(capFirst(obj.resolution.address.sponsor.main))}}
  \\begin{tabbing}
      FORUM: \\quad \\quad  \\quad \\quad\\=\\forum \\\\
      \\\\
      QUESTION OF: \\>\\issue \\\\
      \\\\
      SPONSOR: \\>\\sponsor \\\\
  \\end{tabbing}
  \\MakeUppercase{THE \\forum},`;

  //preambs
  str += obj.resolution.clauses.preambulatory.map(
    (clause) => {
      //check if subclauses are going to be added
      const subsPresent = clause.sub && clause.sub.length;

      //add code for clause, add correct punctuation at and of content
      let str = `\\begin{preamb}{${prepareHeader(capFirst(clause.phrase))}}{${
        prepareClause(clause.content) + (subsPresent ? ":" : ",")}}\\end{preamb}`;

      //handle subclauses
      if (subsPresent) {
        //start subclauses
        str += "\\begin{preambsubclause}";
        str += clause.sub.map(sub => `\\item ${prepareClause(sub)},`).join("\n");
        str += "\\end{preambsubclause}";
      }

      //extensions not yet suppored by the template

      //return created clause
      return str;
    }
  ).join("\n");

  //ops
  if (obj.resolution.clauses.operative.length) {
    //begin operative clauses
    str += "\\begin{enumerate}[1., align = left, leftmargin =* , " +
      "widest* = 8, labelindent=0cm, labelsep=1cm, topsep=0pt]" +

    //for every oc clause
    obj.resolution.clauses.operative.map((clause, index, arr) => {
      //check if there are going to be subclauses
      const subsPresent = clause.sub && clause.sub.length;

      //check if we are in the last clause
      const lastClause = index === arr.length - 1;

      //clause beginning with correct punctuation
      let cStr = `\\begin{oc}{${prepareHeader(capFirst(clause.phrase))}}{${
        prepareClause(clause.content) +
        getOpPunctuation(subsPresent, ! subsPresent, ! subsPresent && lastClause)}}`;

      //add subclauses, if detected
      if (subsPresent) {
        //begin of subclauses
        cStr += "\\begin{ocsubclause}";

        //for all subclauses add to string
        cStr += clause.sub.map((subclause, subIndex, subArr) => {
          //start with item
          let subContent = "\\item ";

          //if string only type
          const isStringType = typeof subclause === "string";
          if (isStringType) {
            //only add string content, no deeper nesting possible
            subContent += prepareClause(capFirst(subclause));
          } else {
            //add content, punctuation comes later
            subContent += prepareClause(capFirst(subclause.content));
          }

          //check if subsubs are present
          const subsubsPresent = ! isStringType && subclause.sub && subclause.sub.length;

          //check if this is the last subclause
          const lastSubClause = subIndex === subArr.length - 1;

          //add punctuation
          subContent += getOpPunctuation(
            subsubsPresent,
            ! subsubsPresent && lastSubClause,
            ! subsubsPresent && lastSubClause && lastClause
          );

          //add susubs if there are any
          if (subsubsPresent) {
            //begin subsubclause
            subContent += "\\begin{ocsubsubclause}";

            //add all subclauses of this subclause
            subContent += subclause.sub.map((subSub, subSubIndex, subSubArr) => {
              //check if this is the last subsub clause
              const lastSubSubClause = subSubIndex === subSubArr.length - 1;

              //generate items with correct punctuation
              return "\\item " +
                prepareClause((typeof subSub === "string" ? subSub : subSub.content)) +
                getOpPunctuation(
                  false,
                  lastSubSubClause && lastSubClause,
                  lastSubSubClause && lastSubClause && lastClause
                );
            }).join("\n");

            //end sub segment
            subContent += "\\end{ocsubsubclause}";
          }

          //return content of subclause
          return subContent;
        }).join("\n");

        //end subclauses
        cStr += "\\end{ocsubclause}";
      }

      //extensions not yet supported by the template

      //end clause and return
      return cStr + "\\end{oc}";
    }).join("\n") + "\\end{enumerate}";
  }

  return str;
}
