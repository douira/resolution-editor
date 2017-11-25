/*jshint esversion: 6, node: true*/

//returns the correct punctuation for a given op clause context
function getOpPunctuation(subPresent, lastInClause, lastInDoc) {
  //essentially a precendence waterfall
  return subPresent ? ":" : lastInDoc ? "." : lastInClause ? ";" : ",";
}

//latex generator doesn't seem to be able to produce compilable code atm
module.exports = (obj) => {
  //add setup and some data
  let str = `
  \\newcommand{\\forum}{${obj.resolution.address.forum}}
  \\newcommand{\\issue}{${obj.resolution.address.questionOf}}
  \\newcommand{\\sponsor}{${obj.resolution.address.sponsor.main}}
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
      let str = `\\begin{preamb}{${clause.phrase}}{${
        clause.content + (subsPresent ? ":" : ",")}}\\end{preamb}`;

      //handle subclauses
      if (subsPresent) {
        //start subclauses
        str += "\\begin{preambsubclause}";
        str += clause.sub.map((sub) => `\\item ${sub},`).join("\n");
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
      let cStr = `\\begin{oc}{${clause.phrase}}{${clause.content + getOpPunctuation(
        subsPresent, ! subsPresent, ! subsPresent && lastClause)}}`;

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
            subContent += subclause;
          } else {

            //add content without punctuation
            subContent += subclause.content;
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
              return "\\item " + (typeof subSub === "string" ? subSub : subSub.content) +
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
  console.log(str);
  return str;
};
